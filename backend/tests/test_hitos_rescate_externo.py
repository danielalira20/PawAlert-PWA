from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.services import red_aliados_service, report_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-externo"}


@contextmanager
def patched_supabase_clients(module, supabase):
    """Evita llamadas reales sustituyendo clientes público y administrativo."""
    with (
        patch.object(module, "supabase", supabase),
        patch.object(module, "supabase_admin", supabase),
    ):
        yield


def _usuario_externo():
    return {
        "id": "usuario-externo-1",
        "asociacion_id": None,
        "roles": {"nombre": "voluntario_externo"},
    }


def _usuario_interno():
    return {
        "id": "usuario-interno-1",
        "asociacion_id": "asociacion-1",
        "roles": {"nombre": "voluntario_interno"},
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


def _reporte_en_atencion():
    return {
        **_reporte_en_camino(),
        "estado_reporte": "en_atencion",
        "estado_cobertura": "en_atencion",
    }


def _reporte_en_camino_interno():
    return {**_reporte_en_camino(), "staff_asignado_id": "usuario-interno-1"}


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
        patched_supabase_clients(reports, supabase),
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
    assert historial.call_args.kwargs["datos_extra"]["fuente_comparacion"] == "punto_original"


def test_llegada_zona_rechaza_gps_fuera_del_radio(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
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


def test_llegada_zona_con_ubicacion_confirmada_compara_contra_esa_ubicacion(make_query):
    """Con ultima_ubicacion_confirmada_id seteado, la validacion debe usar
    avistamientos_animal (via supabase_admin) y no reportes.latitud/longitud."""
    reporte = {**_reporte_en_camino(), "ultima_ubicacion_confirmada_id": "avistamiento-1"}
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[reporte]),
        "avistamientos_animal": make_query(
            data=[{"latitud": 19.4327, "longitud": -99.1333}]
        ),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(reports, supabase),
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
    assert historial.call_args.kwargs["datos_extra"]["fuente_comparacion"] == "ubicacion_confirmada"
    assert historial.call_args.kwargs["datos_extra"]["distancia_reporte_metros"] < 20


def test_llegada_zona_cerca_del_original_pero_lejos_de_confirmada_falla(make_query):
    """Caso cruzado: el voluntario esta cerca del punto ORIGINAL del reporte
    pero lejos de la ubicacion CONFIRMADA -- debe fallar, porque ahora se
    compara contra la confirmada."""
    reporte = {**_reporte_en_camino(), "ultima_ubicacion_confirmada_id": "avistamiento-1"}
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[reporte]),
        "avistamientos_animal": make_query(
            data=[{"latitud": 19.5000, "longitud": -99.2000}]
        ),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_zona_reporte",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "menos de 500 metros" in response.json()["detail"]


def test_llegada_zona_lejos_del_original_pero_cerca_de_confirmada_pasa(make_query):
    """Caso cruzado inverso: lejos del punto original pero cerca de la
    ubicacion confirmada -- debe pasar."""
    reporte = {**_reporte_en_camino(), "ultima_ubicacion_confirmada_id": "avistamiento-1"}
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[reporte]),
        "avistamientos_animal": make_query(
            data=[{"latitud": 19.5000, "longitud": -99.2000}]
        ),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_zona_reporte",
                "latitud": 19.5001,
                "longitud": -99.2001,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert historial.call_args.kwargs["datos_extra"]["fuente_comparacion"] == "ubicacion_confirmada"


def test_llegada_zona_consulta_avistamientos_animal_con_supabase_admin(make_query):
    """avistamientos_animal solo tiene GRANT para service_role (migracion
    0071) -- si _resolver_punto_referencia usara el cliente anon en vez de
    supabase_admin, esto fallaria con KeyError en vez de silenciosamente
    caer al punto original, igual que el bug real que corrigio 9496e1c
    para propuestas_asignacion."""
    reporte = {**_reporte_en_camino(), "ultima_ubicacion_confirmada_id": "avistamiento-1"}
    tablas_anon = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[reporte]),
    }
    tablas_admin = {
        "avistamientos_animal": make_query(
            data=[{"latitud": 19.4327, "longitud": -99.1333}]
        ),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas_anon[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-externo-1")
    )
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: tablas_admin[nombre]

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(reports, "supabase_admin", supabase_admin),
        patch.object(report_service, "registrar_historial"),
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


def test_animal_encontrado_exige_llegada_previa(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
        "historial_reporte": make_query(data=[]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
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
        patched_supabase_clients(reports, supabase),
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
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"id": "busqueda-1", "intento": 1, "estado": "pendiente"}
    )

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(reports, "supabase_admin", supabase_admin),
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
    assert response.json()["intento_busqueda"] == 1
    tablas["reportes"].update.assert_not_called()
    nombre_rpc, argumentos = supabase_admin.rpc.call_args.args
    assert nombre_rpc == "registrar_busqueda_no_localizado"
    assert argumentos["p_tiempo_busqueda_minutos"] == 35


def test_animal_no_localizado_exige_tiempo_y_comentario(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_camino()]),
        "historial_reporte": make_query(data=[{"id": "llegada-1"}]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
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


def test_animal_no_localizado_interno_sin_ubicacion_confirmada_usa_punto_original(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_interno()]),
        "reportes": make_query(data=[_reporte_en_camino_interno()]),
    }
    supabase = _supabase_con_tablas(tablas)
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"id": "busqueda-1", "intento": 1, "estado": "pendiente"}
    )

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(reports, "supabase_admin", supabase_admin),
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
    _, argumentos = supabase_admin.rpc.call_args.args
    assert argumentos["p_distancia_reporte_metros"] < 20


def test_animal_no_localizado_interno_con_ubicacion_confirmada_usa_esa_ubicacion(make_query):
    """Igual que el caso cruzado de llegada_zona_reporte: cerca del punto
    original pero lejos de la confirmada debe fallar el radio, porque
    animal_no_localizado (voluntario_interno) usa la misma función
    _resolver_punto_referencia."""
    reporte = {
        **_reporte_en_camino_interno(),
        "ultima_ubicacion_confirmada_id": "avistamiento-1",
    }
    tablas = {
        "usuarios": make_query(data=[_usuario_interno()]),
        "reportes": make_query(data=[reporte]),
        "avistamientos_animal": make_query(
            data=[{"latitud": 19.5000, "longitud": -99.2000}]
        ),
    }
    supabase = _supabase_con_tablas(tablas)
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: tablas[nombre]
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"id": "busqueda-1", "intento": 1, "estado": "pendiente"}
    )

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(reports, "supabase_admin", supabase_admin),
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

    assert response.status_code == 400
    assert "menos de 500 metros" in response.json()["detail"]
    supabase_admin.rpc.assert_not_called()


def test_animal_bajo_resguardo_registra_destino_y_evidencia(make_query):
    fecha_limite = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion()]),
        "voluntarios": make_query(data=[{"id": "voluntario-1"}]),
        "planes_custodia_temporal": make_query(data=[]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_bajo_resguardo",
                "condicion_observada": "Estable",
                "destino": "Mi hogar temporal",
                "ruta_resguardo": "directo_hogar",
                "fecha_limite_resguardo": fecha_limite,
                "comentario": "Se mantiene tranquilo.",
                "foto_url": "https://pawalert.test/resguardo.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado"] is None
    tablas["reportes"].update.assert_not_called()
    assert historial.call_args.kwargs["tipo_evento"] == "animal_bajo_resguardo"
    assert historial.call_args.kwargs["datos_extra"]["destino"] == "Mi hogar temporal"
    plan = tablas["planes_custodia_temporal"].upsert.call_args.args[0]
    assert plan["ruta_resguardo"] == "directo_hogar"
    assert plan["fecha_limite_propuesta"] == fecha_limite


def test_animal_bajo_resguardo_exige_ruta_y_fecha_concretas(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_bajo_resguardo",
                "condicion_observada": "Estable",
                "foto_url": "https://pawalert.test/resguardo.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "Selecciona si irás directo" in response.json()["detail"]

    with patched_supabase_clients(reports, supabase):
        response_sin_fecha = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "animal_bajo_resguardo",
                "condicion_observada": "Estable",
                "ruta_resguardo": "directo_hogar",
                "foto_url": "https://pawalert.test/resguardo.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response_sin_fecha.status_code == 422
    assert "hasta qué fecha" in response_sin_fecha.json()["detail"]


def test_llegada_hogar_exige_resguardo_y_foto_entorno(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion()]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_hogar_temporal",
                "foto_url": "https://pawalert.test/animal.jpg",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "fotos del animal y del entorno" in response.json()["detail"]


def test_llegada_hogar_inicia_custodia_y_programa_seguimiento(make_query):
    fecha_limite = (datetime.now(timezone.utc) + timedelta(days=9)).isoformat()
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion()]),
        "historial_reporte": make_query(data=[{"id": "resguardo-1"}]),
        "voluntarios": make_query(data=[{"id": "voluntario-1"}]),
        "perfil_casa_temporal": make_query(
            data=[
                {
                    "latitud": 19.4327,
                    "longitud": -99.1333,
                }
            ]
        ),
        "planes_custodia_temporal": make_query(
            data=[
                {
                    "id": "plan-1",
                    "ruta_resguardo": "directo_hogar",
                    "fecha_limite_propuesta": fecha_limite,
                }
            ]
        ),
        "reporte_estados": make_query(data=[{"id": "estado-rescatado"}]),
        "custodias_temporales": make_query(data=[]),
    }
    supabase = _supabase_con_tablas(tablas)

    with (
        patched_supabase_clients(reports, supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_hogar_temporal",
                "condicion_observada": "Estable",
                "foto_url": "https://pawalert.test/animal.jpg",
                "foto_entorno_url": "https://pawalert.test/entorno.jpg",
                "fecha_limite_resguardo": fecha_limite,
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    tablas["reportes"].update.assert_called_once_with(
        {
            "estado_reporte": "rescatado",
            "estado_id": "estado-rescatado",
            "estado_cobertura": "finalizado",
        }
    )
    payload = tablas["custodias_temporales"].insert.call_args.args[0]
    assert payload["estado"] == "activo"
    assert payload["frecuencia_horas"] == 72
    assert payload["fecha_limite"] == fecha_limite
    assert payload["ruta_ingreso"] == "directo_hogar"
    assert payload["proximo_seguimiento_at"]
    assert historial.call_args.kwargs["tipo_evento"] == "llegada_hogar_temporal"


def test_llegada_hogar_exige_paso_veterinario_si_fue_la_ruta_elegida(make_query):
    fecha_limite = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    historial = make_query(
        execute_results=[
            SimpleNamespace(data=[{"id": "resguardo-1"}], count=None),
            SimpleNamespace(data=[], count=None),
        ]
    )
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion()]),
        "historial_reporte": historial,
        "voluntarios": make_query(data=[{"id": "voluntario-1"}]),
        "perfil_casa_temporal": make_query(
            data=[{"latitud": 19.4327, "longitud": -99.1333}]
        ),
        "planes_custodia_temporal": make_query(
            data=[{
                "id": "plan-1",
                "ruta_resguardo": "veterinaria_y_hogar",
                "fecha_limite_propuesta": fecha_limite,
            }]
        ),
    }
    supabase = _supabase_con_tablas(tablas)

    with patched_supabase_clients(reports, supabase):
        response = client.post(
            "/reports/reporte-1/hitos",
            json={
                "tipo_hito": "llegada_hogar_temporal",
                "foto_url": "https://pawalert.test/animal.jpg",
                "foto_entorno_url": "https://pawalert.test/entorno.jpg",
                "fecha_limite_resguardo": fecha_limite,
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 409
    assert "llegada a la veterinaria" in response.json()["detail"]
