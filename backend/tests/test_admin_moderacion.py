from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import admin
from app.main import app
from app.services import (
    incidentes_service,
    report_activation_service,
    report_service,
    reputacion_service,
)

client = TestClient(app)


# ─── Helpers ────────────────────────────────────────────────────────────
#
# resolver_moderacion_reporte usa DOS clientes de admin.py: `supabase`
# (solo para _verificar_admin) y `supabase_admin` (para leer/actualizar
# el reporte). El enganche nuevo a reputacion_service.procesar_reporte_falso_confirmado
# usa un TERCER cliente propio (reputacion_service.supabase). Los 3 se
# mockean por separado -- ninguno debe tocar la red real.

def _supabase_admin_autenticado(*, admin_id="admin-1") -> MagicMock:
    """Cliente `supabase` (no `supabase_admin`) que _verificar_admin usa
    para validar el token y confirmar rol 'admin'."""
    supabase = MagicMock()
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-admin-1"))
    tabla_usuarios = MagicMock()
    for metodo in ("select", "eq"):
        getattr(tabla_usuarios, metodo).return_value = tabla_usuarios
    tabla_usuarios.execute.return_value = SimpleNamespace(
        data=[{"id": admin_id, "roles": {"nombre": "admin"}}]
    )
    supabase.table.return_value = tabla_usuarios
    return supabase


def _supabase_admin_moderacion(make_query, *, reporte: dict) -> tuple[MagicMock, dict]:
    """Cliente `supabase_admin` con las 3 tablas que toca
    resolver_moderacion_reporte."""
    tablas = {
        "reportes": make_query(data=[reporte]),
        "reporte_denuncias": make_query(data=[]),
        "notificaciones_moderacion": make_query(data=[]),
    }
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: tablas[nombre]
    return supabase_admin, tablas


def _reputacion_supabase_ok(make_query) -> MagicMock:
    """Mismo criterio que en test_report_acceptance.py: cliente falso
    que responde neutro a cualquier tabla/RPC, para dejar correr el
    código real de procesar_reporte_falso_confirmado sin red. Desde que
    ese hook migró a incidentes_service, lo único que sigue tocando este
    cliente es revertir_puntos (movimientos_puntos, ajeno a 0050/0051)."""
    supabase = MagicMock()
    llamada_rpc = MagicMock()
    llamada_rpc.execute.return_value = SimpleNamespace(data=[{"id": "mov-1"}])
    supabase.rpc.return_value = llamada_rpc
    supabase.table.side_effect = lambda nombre: make_query(data=[], count=0)
    return supabase


def _incidentes_supabase_ok(make_query) -> tuple[MagicMock, dict, MagicMock]:
    """Cliente falso de incidentes_service.supabase (CUARTO cliente
    distinto, separado de admin.supabase / admin.supabase_admin /
    report_service.supabase / reputacion_service.supabase) -- desde que
    procesar_reporte_falso_confirmado migró de la reducción directa
    (bloqueada por 0050) a incidentes_service.registrar_incidente +
    confirmar_incidente, ESTE es el cliente que de verdad hace el
    trabajo. Sin mockearlo, la ronda anterior demostró que sale a la red
    real: PGRST205 'Could not find the table incidente_tipos_catalogo'."""
    fila_incidente = {"id": "incidente-1", "usuario_id": "user-1", "estado": "pendiente", "reporte_id": "rep-1"}
    tablas = {
        "incidente_tipos_catalogo": make_query(data=[{"id": "cat-1"}]),
        "incidentes": make_query(execute_results=[
            SimpleNamespace(data=[fila_incidente]),  # INSERT dentro de registrar_incidente
            SimpleNamespace(data=[fila_incidente]),  # SELECT de _obtener_incidente_abierto dentro de confirmar_incidente
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    llamada_rpc = MagicMock()
    llamada_rpc.execute.return_value = SimpleNamespace(data={"id": "incidente-1", "estado": "confirmado"})
    supabase.rpc.return_value = llamada_rpc
    return supabase, tablas, llamada_rpc


REPORTE_BASE = {"id": "rep-1", "usuario_id": "user-1", "estado_moderacion": "en_revision", "estado_reporte": "pendiente"}


def test_adjuntar_coincidencias_visuales_no_expone_embeddings(make_query):
    coincidencias = make_query(
        data=[
            {
                "reporte_id": "rep-1",
                "animal_foto_id": "foto-nueva",
                "reporte_coincidente_id": "rep-anterior",
                "animal_foto_coincidente_id": "foto-anterior",
                "similitud": 0.96,
                "nivel": "high",
                "modelo": "openai/clip-vit-base-patch32",
            }
        ]
    )
    fotos = make_query(
        data=[{"id": "foto-anterior", "foto_url": "https://x/foto.jpg"}]
    )
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda tabla: {
        "reporte_imagen_coincidencias": coincidencias,
        "animal_fotos": fotos,
    }[tabla]
    reportes = [{"id": "rep-1"}]

    with patch.object(admin, "supabase_admin", supabase_admin):
        admin._adjuntar_coincidencias_visuales(reportes)

    assert reportes[0]["coincidencias_visuales"] == [
        {
            "reporte_id": "rep-1",
            "animal_foto_id": "foto-nueva",
            "reporte_coincidente_id": "rep-anterior",
            "animal_foto_coincidente_id": "foto-anterior",
            "similitud": 0.96,
            "nivel": "high",
            "modelo": "openai/clip-vit-base-patch32",
            "foto_coincidente_url": "https://x/foto.jpg",
        }
    ]
    campos = coincidencias.select.call_args.args[0]
    assert "embedding" not in campos


def test_adjuntar_coincidencias_visuales_degrada_sin_romper_panel(make_query):
    consulta = make_query(data=[])
    consulta.execute.side_effect = RuntimeError("tabla no disponible")
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = consulta
    reportes = [{"id": "rep-1"}]

    with patch.object(admin, "supabase_admin", supabase_admin):
        admin._adjuntar_coincidencias_visuales(reportes)

    assert reportes[0]["coincidencias_visuales"] == []


# ─── decision="rechazar" ────────────────────────────────────────────────

def test_rechazar_llama_procesar_reporte_falso_confirmado_con_datos_correctos(make_query):
    """Prueba de cableado real: se deja correr procesar_reporte_falso_confirmado
    de verdad -- incluyendo la migración a incidentes_service.registrar_incidente
    + confirmar_incidente -- y se verifican los parámetros reales de cada
    paso, no solo que la cadena "no truene" (ese fue el error de la
    ronda anterior: un mock que respondía éxito genérico sin validar
    nada dejó pasar el bug de 0050 sin que este test lo notara)."""
    supabase = _supabase_admin_autenticado(admin_id="admin-1")
    supabase_admin, tablas = _supabase_admin_moderacion(make_query, reporte=REPORTE_BASE)
    reputacion_supabase = _reputacion_supabase_ok(make_query)
    incidentes_supabase, tablas_incidentes, rpc_confirmar = _incidentes_supabase_ok(make_query)

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", supabase_admin),
        # resolver_moderacion_reporte también llama a
        # report_service.registrar_historial -- ese módulo tiene su
        # propio `supabase` (tercer cliente distinto de admin.supabase/
        # admin.supabase_admin) que hay que mockear aparte, o el INSERT
        # a historial_reporte sale a la red real.
        patch.object(report_service, "supabase", MagicMock()),
        patch.object(reputacion_service, "supabase", reputacion_supabase),
        patch.object(incidentes_service, "supabase", incidentes_supabase),
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "rechazar", "notas": "foto no corresponde"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert response.json()["estado_moderacion"] == "rechazado"

    # registrar_incidente insertó con el tipo/rol/reporte/admin correctos.
    insertado = tablas_incidentes["incidentes"].insert.call_args.args[0]
    assert insertado["usuario_id"] == "user-1"
    assert insertado["rol"] == reputacion_service.ROL_REPORTANTE
    assert insertado["tipo_incidente"] == "reporte_falso"
    assert insertado["reporte_id"] == "rep-1"
    assert insertado["registrado_por"] == "admin-1"

    # confirmar_incidente llamó la RPC real confirmar_incidente_atomico
    # con el incidente recién creado y el admin como confirmador.
    rpc_confirmar.execute.assert_called_once()
    nombre_rpc, params_rpc = incidentes_supabase.rpc.call_args.args
    assert nombre_rpc == "confirmar_incidente_atomico"
    assert params_rpc["p_incidente_id"] == "incidente-1"
    assert params_rpc["p_confirmado_por"] == "admin-1"


def test_aprobar_nunca_llama_procesar_reporte_falso_confirmado(make_query):
    supabase = _supabase_admin_autenticado()
    supabase_admin, tablas = _supabase_admin_moderacion(make_query, reporte=REPORTE_BASE)

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", supabase_admin),
        patch.object(report_service, "supabase", MagicMock()),
        patch.object(reputacion_service, "procesar_reporte_falso_confirmado") as mock_procesar,
        patch.object(reputacion_service, "supabase", MagicMock()),
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "aprobar"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert response.json()["estado_moderacion"] == "aprobado"
    mock_procesar.assert_not_called()


def test_aprobar_revision_inicial_activa_reporte_por_la_compuerta(make_query):
    supabase = _supabase_admin_autenticado(admin_id="admin-1")
    reporte = {
        **REPORTE_BASE,
        "estado_validacion_reporte": "revision_manual",
    }
    supabase_admin, _ = _supabase_admin_moderacion(
        make_query,
        reporte=reporte,
    )

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", supabase_admin),
        patch.object(report_service, "supabase", MagicMock()),
        patch.object(
            report_activation_service,
            "activar_reporte_desde_revision",
            return_value={
                "estado": "asignado",
                "asociacion": {"id": "asociacion-1"},
            },
        ) as activar,
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "aprobar", "notas": "Evidencia confirmada"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert response.json()["estado_reporte"] == "asignado"
    activar.assert_called_once_with(
        reporte_id="rep-1",
        admin_id="admin-1",
        notas="Evidencia confirmada",
    )


def test_rechazar_revision_inicial_cierra_validacion(make_query):
    supabase = _supabase_admin_autenticado(admin_id="admin-1")
    reporte = {
        **REPORTE_BASE,
        "estado_validacion_reporte": "revision_manual",
    }
    supabase_admin, tablas = _supabase_admin_moderacion(
        make_query,
        reporte=reporte,
    )

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", supabase_admin),
        patch.object(report_service, "supabase", MagicMock()),
        patch.object(
            reputacion_service,
            "procesar_reporte_falso_confirmado",
        ),
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "rechazar", "notas": "Evidencia inválida"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    cambios = tablas["reportes"].update.call_args.args[0]
    assert cambios["estado_validacion_reporte"] == "rechazado"
    assert cambios["estado_moderacion"] == "rechazado"
    assert cambios["urgency_excluido"] is True


def test_excepcion_en_procesar_reporte_falso_confirmado_no_rompe_la_resolucion(make_query, capsys):
    """Misma regla que en report_acceptance: la gamificación nunca debe
    tumbar el flujo principal de moderación."""
    supabase = _supabase_admin_autenticado()
    supabase_admin, tablas = _supabase_admin_moderacion(make_query, reporte=REPORTE_BASE)

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", supabase_admin),
        patch.object(report_service, "supabase", MagicMock()),
        patch.object(
            reputacion_service, "procesar_reporte_falso_confirmado",
            side_effect=Exception("fallo inesperado en reputacion"),
        ),
        patch.object(reputacion_service, "supabase", MagicMock()),
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "rechazar", "notas": "foto no corresponde"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert response.json()["estado_moderacion"] == "rechazado"
    salida = capsys.readouterr().out
    assert "[WARN] reputacion fallo en resolver_moderacion_reporte" in salida


# ─── Admin sin permisos ──────────────────────────────────────────────────
# No había cobertura previa de _verificar_admin en el suite (confirmado
# por grep antes de escribir este archivo) -- se agrega aquí, no en un
# archivo genérico de admin, porque es la condición de guarda de esta
# misma función.

def test_rol_no_admin_no_llega_a_moderacion_ni_a_reputacion():
    supabase = MagicMock()
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-1"))
    tabla_usuarios = MagicMock()
    for metodo in ("select", "eq"):
        getattr(tabla_usuarios, metodo).return_value = tabla_usuarios
    tabla_usuarios.execute.return_value = SimpleNamespace(
        data=[{"id": "user-1", "roles": {"nombre": "asociacion"}}]
    )
    supabase.table.return_value = tabla_usuarios

    with (
        patch.object(admin, "supabase", supabase),
        patch.object(admin, "supabase_admin", MagicMock()),
        patch.object(reputacion_service, "procesar_reporte_falso_confirmado") as mock_procesar,
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "rechazar", "notas": "x"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
    mock_procesar.assert_not_called()
