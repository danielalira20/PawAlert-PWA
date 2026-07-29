from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.services import red_aliados_service, report_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-externo"}


def _usuario_externo():
    return {
        "id": "usuario-externo-1",
        "asociacion_id": None,
        "roles": {"nombre": "voluntario_externo"},
    }


def _reporte_en_camino():
    return {
        "id": "reporte-1",
        "estado_reporte": "en_camino",
        "estado_cobertura": "confirmado",
        "staff_asignado_id": "usuario-externo-1",
        "asociacion_asignada_id": "asociacion-1",
        "latitud": 19.4326,
        "longitud": -99.1332,
    }


def _supabase_con_tablas(tablas):
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-externo-1")
    )
    return supabase


def test_llegada_zona_registra_gps_sin_cambiar_estado(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_zona_reporte",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["tipo_hito"] == "llegada_zona_reporte"
    assert response.json()["estado"] is None
    tablas["reportes"].update.assert_not_called()
    assert historial.call_args.kwargs["tipo_evento"] == "llegada_zona_reporte"
    assert historial.call_args.kwargs["datos_extra"]["distancia_reporte_metros"] < 20


def test_llegada_zona_rechaza_gps_fuera_del_radio(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_zona_reporte",
                "latitud": 19.5,
                "longitud": -99.2,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "menos de 500 metros" in response.json()["detail"]


def test_animal_encontrado_exige_llegada_previa(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
        "historial_reporte": make_query(data=[]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_encontrado",
                "foto_url": "https://pawalert.test/animal.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 409
    assert "Primero debes registrar tu llegada" in response.json()["detail"]


def test_animal_encontrado_avanza_a_atencion_y_usa_evento_canonico(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(
            execute_results=[
                SimpleNamespace(data=[_reporte_en_camino()], count=None),
                SimpleNamespace(data=[{"id": "reporte-1"}], count=None),
                SimpleNamespace(
                    data=[
                        {
                            "animal": [
                                {
                                    "orden": 1,
                                    "condicion_catalogo": {"clave": "estable"},
                                }
                            ]
                        }
                    ],
                    count=None,
                ),
            ]
        ),
        "historial_reporte": make_query(data=[{"id": "llegada-1"}]),
        "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
        patch.object(
            red_aliados_service,
            "sugerir_aliado_veterinario",
            return_value=None,
        ),
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_encontrado",
                "condicion_observada": "Igual que en el reporte",
                "foto_url": "https://pawalert.test/animal.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado"] == "en_atencion"
    tablas["reportes"].update.assert_called_once_with(
        {
            "estado_reporte": "en_atencion",
            "estado_id": "estado-en-atencion",
            "estado_cobertura": "en_atencion",
        }
    )
    assert historial.call_args.kwargs["tipo_evento"] == "animal_encontrado"


def test_animal_no_localizado_conserva_asignacion_y_registra_busqueda(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
        "historial_reporte": make_query(data=[{"id": "llegada-1"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_no_localizado",
                "comentario": "Recorrí las calles cercanas y pregunté a dos vecinos.",
                "tiempo_busqueda_minutos": 35,
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado"] is None
    tablas["reportes"].update.assert_not_called()
    assert historial.call_args.kwargs["tipo_evento"] == "animal_no_localizado"
    assert (
        historial.call_args.kwargs["datos_extra"]["tiempo_busqueda_minutos"]
        == 35
    )


def test_animal_no_localizado_exige_tiempo_y_comentario(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
        "historial_reporte": make_query(data=[{"id": "llegada-1"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_no_localizado",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "cuántos minutos" in response.json()["detail"]
