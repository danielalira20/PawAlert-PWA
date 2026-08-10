from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import report_acceptance
from app.main import app
from app.services import reputacion_service

client = TestClient(app)


# ─── Helpers ────────────────────────────────────────────────────────────
#
# _aceptar_asignacion (llamada por accept_report y accept_report_staff)
# ahora dispara reputacion_service.procesar_reporte_valido, que usa su
# propio cliente (reputacion_service.supabase = supabase_admin real, no
# el `supabase` de report_acceptance.py). Sin mockear ESE cliente
# también, dejar correr el código real de procesar_reporte_valido en una
# prueba pegaría a la Supabase configurada en .env -- exactamente lo que
# pasó sin querer en test_security.py antes de corregirlo.

def _reputacion_supabase_ok(make_query) -> tuple[MagicMock, MagicMock]:
    """Cliente falso de reputacion_service que responde con datos vacíos/
    neutros a cualquier tabla o RPC -- suficiente para dejar correr el
    código real de procesar_reporte_valido sin tocar la red y sin ruido
    de comparar un MagicMock sin configurar contra un entero."""
    supabase = MagicMock()
    llamada_rpc = MagicMock()
    llamada_rpc.execute.return_value = SimpleNamespace(data=[{"id": "mov-1"}])
    supabase.rpc.return_value = llamada_rpc
    supabase.table.side_effect = lambda nombre: make_query(data=[], count=0)
    return supabase, llamada_rpc


# ─── accept_report (flujo por token, sin sesión) ───────────────────────

def test_accept_report_token_valido_llama_procesar_reporte_valido_con_datos_correctos(make_query):
    """Prueba de cableado real: no se mockea procesar_reporte_valido en
    sí -- se deja correr, y se verifica a través de las llamadas RPC que
    reputacion_service.supabase recibió que sí llegó el reporte_id y el
    usuario_id correctos."""
    tablas = {
        "reporte_asignaciones": make_query(data=[{"id": "asig-1"}]),
        "reportes": make_query(data=[{"usuario_id": "user-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    reputacion_supabase, rpc = _reputacion_supabase_ok(make_query)

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(reputacion_service, "supabase", reputacion_supabase),
    ):
        response = client.post("/reports/rep-1/accept", json={"token": "tok-1"})

    assert response.status_code == 200
    tablas["reporte_asignaciones"].update.assert_called_once()
    tablas["reportes"].update.assert_called_once()

    # otorgar_puntos se llama 2 veces (bono_bienvenida y reporte_valido)
    # con el mismo nombre de RPC -- call_args_list conserva ambas, y el
    # dict por nombre solo se queda con la última; se revisa la lista
    # completa para no perder la del bono.
    llamadas_otorgar = [c.args[1] for c in reputacion_supabase.rpc.call_args_list if c.args[0] == "otorgar_puntos_atomico"]
    llamada_reporte_valido = next(l for l in llamadas_otorgar if l["p_regla"] == reputacion_service.REGLA_REPORTE_VALIDO)
    assert llamada_reporte_valido["p_usuario_id"] == "user-1"
    assert llamada_reporte_valido["p_evento_origen_id"] == "rep-1"


def test_accept_report_token_invalido_no_llama_procesar_reporte_valido(make_query):
    tabla_asignaciones = make_query(data=[])  # token no encontrado
    supabase = MagicMock()
    supabase.table.return_value = tabla_asignaciones

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
        patch.object(reputacion_service, "supabase", MagicMock()),
    ):
        response = client.post("/reports/rep-1/accept", json={"token": "tok-invalido"})

    assert response.status_code == 404
    mock_procesar.assert_not_called()


def test_accept_report_fallo_al_leer_usuario_id_no_rompe_la_aceptacion(make_query, capsys):
    """El caso más importante: si la línea de consulta
    reportes.select('usuario_id') truena por cualquier motivo, la
    aceptación del reporte (200) debe completarse igual -- el
    try/except de _aceptar_asignacion es quien debe atrapar esto, no
    reputacion_service."""
    tabla_asignaciones = make_query(data=[{"id": "asig-1"}])

    tabla_reportes = MagicMock()
    for metodo in ("select", "update", "eq"):
        getattr(tabla_reportes, metodo).return_value = tabla_reportes
    tabla_reportes.execute.side_effect = [
        SimpleNamespace(data=[{"estado_reporte": "en_atencion"}]),  # el UPDATE de estado_reporte
        Exception("fallo inesperado leyendo usuario_id"),           # el SELECT de usuario_id truena
    ]

    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: {
        "reporte_asignaciones": tabla_asignaciones,
        "reportes": tabla_reportes,
    }[nombre]

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
        patch.object(reputacion_service, "supabase", MagicMock()),
    ):
        response = client.post("/reports/rep-1/accept", json={"token": "tok-1"})

    assert response.status_code == 200
    assert response.json()["mensaje"] == "Reporte aceptado exitosamente"
    # Nunca se llegó a invocar procesar_reporte_valido -- la consulta
    # previa de usuario_id ya había reventado.
    mock_procesar.assert_not_called()
    salida = capsys.readouterr().out
    assert "[WARN] reputacion fallo en _aceptar_asignacion" in salida


# ─── accept_report_staff (flujo autenticado) ───────────────────────────

def test_accept_report_staff_tambien_llama_procesar_reporte_valido(make_query):
    """No se duplica la verificación de cableado RPC de arriba -- solo
    se confirma que esta segunda ruta llega al mismo
    procesar_reporte_valido, con los mismos argumentos, porque ambas
    pasan por _aceptar_asignacion."""
    tablas = {
        "reporte_asignaciones": make_query(data=[{"id": "asig-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{"usuario_id": "user-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(
            report_acceptance, "_obtener_usuario_autenticado",
            return_value={"id": "staff-1", "asociacion_id": "aso-1", "rol": "staff"},
        ),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
        patch.object(reputacion_service, "supabase", MagicMock()),
    ):
        response = client.post(
            "/reports/rep-1/accept-staff",
            json={},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    mock_procesar.assert_called_once_with("rep-1", "user-1")


def test_accept_report_staff_rol_no_autorizado_no_llega_a_procesar_reporte_valido():
    """_verificar_rol debe cortar el flujo antes de tocar
    reporte_asignaciones o reputacion_service en absoluto."""
    with (
        patch.object(
            report_acceptance, "_obtener_usuario_autenticado",
            return_value={"id": "user-1", "asociacion_id": "aso-1", "rol": "reportante"},
        ),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
    ):
        response = client.post(
            "/reports/rep-1/accept-staff",
            json={},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
    mock_procesar.assert_not_called()
