from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import report_acceptance
from app.main import app


client = TestClient(app)


def _clientes(make_query, *, asignacion=True, reporte=None):
    reporte = reporte or {
        "id": "rep-1",
        "estado_validacion_reporte": "aprobado",
        "estado_reporte": "asignado",
        "estado_cobertura": "abierto",
        "asociacion_asignada_id": "aso-1",
    }
    tablas = {
        "reporte_asignaciones": make_query(
            data=[{"id": "asig-1", "asociacion_id": "aso-1"}]
            if asignacion else []
        ),
        "reportes": make_query(data=[reporte]),
        "asignacion_estados": make_query(data=[{"id": "estado-asignacion"}]),
        "reporte_estados": make_query(data=[{"id": "estado-reporte"}]),
        "historial_reporte": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    tablas_admin = {"casos_administrativos": make_query(data=[])}
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: tablas_admin[nombre]
    return supabase, supabase_admin, tablas, tablas_admin


def test_accept_token_confirma_coordinacion_sin_iniciar_atencion(make_query):
    supabase, supabase_admin, tablas, _ = _clientes(make_query)

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(report_acceptance, "supabase_admin", supabase_admin),
    ):
        response = client.post("/reports/rep-1/accept", json={"token": "tok-1"})

    assert response.status_code == 200
    assert "selecciona un voluntario" in response.json()["mensaje"]
    cambio = tablas["reporte_asignaciones"].update.call_args.args[0]
    assert cambio["estado"] == "aceptada"
    assert cambio["accepted_at"] != "now()"
    tablas["reportes"].update.assert_not_called()
    evento = tablas["historial_reporte"].insert.call_args.args[0]
    assert evento["tipo_evento"] == "asociacion_acepta_coordinacion"
    supabase_admin.table.assert_not_called()


def test_accept_token_invalido_no_cambia_el_reporte(make_query):
    supabase, supabase_admin, tablas, _ = _clientes(
        make_query,
        asignacion=False,
    )

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(report_acceptance, "supabase_admin", supabase_admin),
    ):
        response = client.post(
            "/reports/rep-1/accept",
            json={"token": "tok-invalido"},
        )

    assert response.status_code == 404
    tablas["reportes"].update.assert_not_called()
    tablas["reporte_asignaciones"].update.assert_not_called()


def test_accept_no_permite_saltar_validacion_inicial(make_query):
    supabase, supabase_admin, tablas, _ = _clientes(
        make_query,
        reporte={
            "id": "rep-1",
            "estado_validacion_reporte": "revision_manual",
            "estado_reporte": "pendiente",
            "estado_cobertura": None,
            "asociacion_asignada_id": None,
        },
    )

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(report_acceptance, "supabase_admin", supabase_admin),
    ):
        response = client.post("/reports/rep-1/accept", json={"token": "tok-1"})

    assert response.status_code == 409
    tablas["reporte_asignaciones"].update.assert_not_called()


def test_reject_mueve_a_sin_cobertura_y_escala(make_query):
    supabase, supabase_admin, tablas, tablas_admin = _clientes(make_query)

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(report_acceptance, "supabase_admin", supabase_admin),
    ):
        response = client.post(
            "/reports/rep-1/reject",
            json={"token": "tok-1", "notas": "Sin capacidad"},
        )

    assert response.status_code == 200
    cambio = tablas["reportes"].update.call_args.args[0]
    assert cambio["estado_reporte"] == "sin_cobertura"
    assert cambio["estado_cobertura"] is None
    assert cambio["asociacion_asignada_id"] is None
    caso = tablas_admin["casos_administrativos"].insert.call_args.args[0]
    assert caso["tipo"] == "reporte_sin_coordinadora"
    evento = tablas["historial_reporte"].insert.call_args.args[0]
    assert evento["tipo_evento"] == "asociacion_rechaza_coordinacion"


def test_accept_staff_usa_el_mismo_acuse_de_coordinacion(make_query):
    supabase, supabase_admin, tablas, _ = _clientes(make_query)

    with (
        patch.object(report_acceptance, "supabase", supabase),
        patch.object(report_acceptance, "supabase_admin", supabase_admin),
        patch.object(
            report_acceptance,
            "_obtener_usuario_autenticado",
            return_value={
                "id": "staff-1",
                "asociacion_id": "aso-1",
                "rol": "staff",
            },
        ),
    ):
        response = client.post(
            "/reports/rep-1/accept-staff",
            json={},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    assert tablas["reporte_asignaciones"].update.call_args.args[0]["estado"] == (
        "aceptada"
    )
    tablas["reportes"].update.assert_not_called()


def test_accept_staff_rechaza_rol_no_autorizado():
    with patch.object(
        report_acceptance,
        "_obtener_usuario_autenticado",
        return_value={
            "id": "user-1",
            "asociacion_id": "aso-1",
            "rol": "reportante",
        },
    ):
        response = client.post(
            "/reports/rep-1/accept-staff",
            json={},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
