from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import admin
from app.main import app
from app.services import report_service, reputacion_service

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
    código real de procesar_reporte_falso_confirmado sin red."""
    supabase = MagicMock()
    llamada_rpc = MagicMock()
    llamada_rpc.execute.return_value = SimpleNamespace(data=[{"id": "mov-1"}])
    supabase.rpc.return_value = llamada_rpc
    supabase.table.side_effect = lambda nombre: make_query(data=[], count=0)
    return supabase


REPORTE_BASE = {"id": "rep-1", "usuario_id": "user-1", "estado_moderacion": "en_revision", "estado_reporte": "pendiente"}


# ─── decision="rechazar" ────────────────────────────────────────────────

def test_rechazar_llama_procesar_reporte_falso_confirmado_con_datos_correctos(make_query):
    """Prueba de cableado real: se deja correr procesar_reporte_falso_confirmado
    de verdad (con reputacion_service.supabase mockeado) y se verifica a
    través de las llamadas RPC que llegaron reporte_id, usuario_id y
    admin['id'] correctos."""
    supabase = _supabase_admin_autenticado(admin_id="admin-1")
    supabase_admin, tablas = _supabase_admin_moderacion(make_query, reporte=REPORTE_BASE)
    reputacion_supabase = _reputacion_supabase_ok(make_query)

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
    ):
        response = client.patch(
            "/admin/reportes-moderacion/rep-1",
            json={"decision": "rechazar", "notas": "foto no corresponde"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert response.json()["estado_moderacion"] == "rechazado"

    llamadas_ajuste = [
        c.args[1] for c in reputacion_supabase.rpc.call_args_list
        if c.args[0] == "ajustar_trust_score_atomico"
    ]
    assert len(llamadas_ajuste) == 1
    llamada = llamadas_ajuste[0]
    assert llamada["p_usuario_id"] == "user-1"
    assert llamada["p_evento_origen_id"] == "rep-1"
    assert llamada["p_responsable_confirmacion_id"] == "admin-1"


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
