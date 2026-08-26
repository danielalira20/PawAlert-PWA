from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.services import report_service, reputacion_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-interno"}


@contextmanager
def patched_supabase_clients(supabase, supabase_admin=None):
    with (
        patch.object(reports, "supabase", supabase),
        patch.object(reports, "supabase_admin", supabase_admin or supabase),
    ):
        yield


def _usuario(rol="voluntario_interno", usuario_id="usuario-interno-1"):
    return {
        "id": usuario_id,
        "asociacion_id": "asociacion-1",
        "roles": {"nombre": rol},
    }


def _reporte(usuario_id="usuario-interno-1"):
    return {
        "id": "reporte-1",
        "estado_reporte": "en_camino",
        "estado_cobertura": "confirmado",
        "staff_asignado_id": usuario_id,
        "asociacion_asignada_id": "asociacion-1",
        "latitud": 19.4326,
        "longitud": -99.1332,
    }


def _supabase_con_tablas(tablas):
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-interno-1")
    )
    return supabase


def test_voluntario_interno_registra_llegada_cercana(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario()]),
        "reportes": make_query(data=[_reporte()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(supabase),
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
    assert historial.call_args.kwargs["tipo_evento"] == "llegada_zona_reporte"
    assert historial.call_args.kwargs["datos_extra"]["distancia_reporte_metros"] < 20


def test_voluntario_interno_registra_busqueda_cercana(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario()]),
        "reportes": make_query(data=[_reporte()]),
    }
    supabase = _supabase_con_tablas(tablas)
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"id": "busqueda-1", "intento": 1, "estado": "pendiente"}
    )

    with patched_supabase_clients(supabase, supabase_admin):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_no_localizado",
                "comentario": "Recorrí las calles cercanas y pregunté a vecinos.",
                "tiempo_busqueda_minutos": 30,
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado"] is None
    assert response.json()["intento_busqueda"] == 1
    tablas["reportes"].update.assert_not_called()
    nombre_rpc, argumentos = supabase_admin.rpc.call_args.args
    assert nombre_rpc == "registrar_busqueda_no_localizado"
    assert argumentos["p_usuario_id"] == "usuario-interno-1"
    assert argumentos["p_distancia_reporte_metros"] < 20


def test_voluntario_interno_no_puede_registrar_busqueda_lejana(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario()]),
        "reportes": make_query(data=[_reporte()]),
    }
    supabase = _supabase_con_tablas(tablas)
    supabase_admin = MagicMock()

    with patched_supabase_clients(supabase, supabase_admin):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_no_localizado",
                "comentario": "Realicé la búsqueda en la zona indicada.",
                "tiempo_busqueda_minutos": 30,
                "latitud": 19.5,
                "longitud": -99.2,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "menos de 500 metros" in response.json()["detail"]
    supabase_admin.rpc.assert_not_called()


def test_staff_no_puede_registrar_busqueda_no_localizado(make_query):
    usuario_id = "usuario-staff-1"
    tablas = {
        "usuarios": make_query(data=[_usuario("staff", usuario_id)]),
        "reportes": make_query(data=[_reporte(usuario_id)]),
    }
    supabase = _supabase_con_tablas(tablas)
    supabase_admin = MagicMock()

    with patched_supabase_clients(supabase, supabase_admin):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_no_localizado",
                "comentario": "Realicé la búsqueda en la zona indicada.",
                "tiempo_busqueda_minutos": 30,
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    supabase_admin.rpc.assert_not_called()


def test_llegada_comprobada_al_refugio_premia_al_voluntario_interno(make_query):
    reporte = _reporte()
    reporte["estado_reporte"] = "en_atencion"
    tablas = {
        "usuarios": make_query(data=[_usuario()]),
        "reportes": make_query(data=[reporte]),
        "asociaciones": make_query(data=[{
            "latitud": 19.4326,
            "longitud": -99.1332,
        }]),
        "reporte_estados": make_query(data=[{"id": "estado-rescatado"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(supabase),
        patch.object(report_service, "registrar_historial") as mock_historial,
        patch.object(
            reputacion_service, "procesar_llegada_refugio_interna"
        ) as mock_reputacion,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegue_refugio",
                "foto_url": "https://pawalert.test/llegada-refugio.jpg",
                "latitud": 19.4326,
                "longitud": -99.1332,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado"] == "rescatado"
    mock_historial.assert_called_once()
    mock_reputacion.assert_called_once_with("reporte-1", "usuario-interno-1")


def test_llegada_al_refugio_sin_foto_no_otorga_reputacion(make_query):
    reporte = _reporte()
    reporte["estado_reporte"] = "en_atencion"
    tablas = {
        "usuarios": make_query(data=[_usuario()]),
        "reportes": make_query(data=[reporte]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(supabase),
        patch.object(
            reputacion_service, "procesar_llegada_refugio_interna"
        ) as mock_reputacion,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegue_refugio",
                "latitud": 19.4326,
                "longitud": -99.1332,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "foto" in response.json()["detail"].lower()
    mock_reputacion.assert_not_called()


def test_llegada_al_refugio_de_staff_no_usa_regla_de_voluntario_interno(make_query):
    usuario_id = "usuario-staff-1"
    reporte = _reporte(usuario_id)
    reporte["estado_reporte"] = "en_atencion"
    tablas = {
        "usuarios": make_query(data=[_usuario("staff", usuario_id)]),
        "reportes": make_query(data=[reporte]),
        "asociaciones": make_query(data=[{
            "latitud": 19.4326,
            "longitud": -99.1332,
        }]),
        "reporte_estados": make_query(data=[{"id": "estado-rescatado"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(supabase),
        patch.object(report_service, "registrar_historial"),
        patch.object(
            reputacion_service, "procesar_llegada_refugio_interna"
        ) as mock_reputacion,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegue_refugio",
                "foto_url": "https://pawalert.test/llegada-refugio.jpg",
                "latitud": 19.4326,
                "longitud": -99.1332,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    mock_reputacion.assert_not_called()
