"""Fase 1 — corrección de qué hitos generan avistamiento automático.

Decisión de producto: un avistamiento representa información sobre dónde
buscar a un animal que SIGUE PERDIDO. Solo `animal_encontrado` cumple eso;
`llegada_veterinaria`, `llegue_refugio`, `animal_bajo_resguardo` y
`llegada_hogar_temporal` ocurren cuando el animal YA fue encontrado, así que
dejan de generar avistamiento.

Como el recálculo de duplicados/Urgency (find_geographic_duplicates /
evaluate_report_urgency) se dispara DESDE `_confirmar_avistamiento`, que solo
corre si se creó el avistamiento, comprobar que `registrar_avistamiento_desde_hito`
no se invoca para esos 4 hitos cubre también que ese recálculo no ocurre.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.services import avistamiento_service, red_aliados_service, report_service

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}


def _usuario_externo():
    return {
        "id": "usuario-externo-1",
        "asociacion_id": None,
        "roles": {"nombre": "voluntario_externo"},
    }


def _reporte_en_atencion_externo():
    return {
        "id": "reporte-1",
        "estado_reporte": "en_atencion",
        "estado_cobertura": "en_atencion",
        "staff_asignado_id": "usuario-externo-1",
        "asociacion_asignada_id": "asociacion-1",
        "latitud": 19.4326,
        "longitud": -99.1332,
    }


def _supabase(tablas, *, auth_id="auth-1"):
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id=auth_id)
    )
    return supabase


@patch.object(avistamiento_service, "registrar_avistamiento_desde_hito")
def test_animal_encontrado_si_genera_avistamiento(derivado, make_query):
    """Regresión: el único hito que debe seguir generando avistamiento."""
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(
            execute_results=[
                SimpleNamespace(
                    data=[
                        {
                            "id": "rep-1",
                            "estado_reporte": "en_camino",
                            "staff_asignado_id": "staff-1",
                            "asociacion_asignada_id": "aso-1",
                        }
                    ],
                    count=None,
                ),
                SimpleNamespace(data=[{"id": "rep-1"}], count=None),
                SimpleNamespace(
                    data=[
                        {
                            "animal": [
                                {"orden": 1, "condicion_catalogo": {"clave": "estable"}}
                            ]
                        }
                    ],
                    count=None,
                ),
            ]
        ),
        "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
        "animal": make_query(data=[{"id": "animal-1"}]),
    }
    supabase = _supabase(tablas, auth_id="auth-staff-1")

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial"),
        patch.object(red_aliados_service, "_nivel_urgencia_efectivo", return_value=None),
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={
                "tipo_hito": "animal_encontrado",
                "condicion_observada": "Igual que en el reporte",
                "latitud": 19.4327,
                "longitud": -99.1333,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    derivado.assert_called_once_with(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="staff-1",
        latitud=19.4327,
        longitud=-99.1333,
        tipo_hito="animal_encontrado",
        evidencia_id=None,
    )


@patch.object(avistamiento_service, "registrar_avistamiento_desde_hito")
def test_llegada_veterinaria_no_genera_avistamiento(derivado, make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(
            data=[
                {
                    "id": "rep-1",
                    "estado_reporte": "en_atencion",
                    "staff_asignado_id": "staff-1",
                    "asociacion_asignada_id": "aso-1",
                }
            ]
        ),
        "contribuciones": make_query(
            data=[{"id": "contrib-1", "oferta_proactiva_id": "oferta-1"}]
        ),
        "ofertas_proactivas": make_query(data=[{"perfil_apoyo_id": "perfil-1"}]),
    }
    supabase = _supabase(tablas, auth_id="auth-staff-1")
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "latitud": 19.04,
                "longitud": -98.19,
                "calle": "Av. Test",
                "colonia": "Centro",
                "municipio": "Puebla",
                "referencia": None,
            }
        ]
    )

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial"),
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={
                "tipo_hito": "llegada_veterinaria",
                "foto_url": "https://x/foto.jpg",
                "latitud": 19.04,
                "longitud": -98.19,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    derivado.assert_not_called()


@patch.object(avistamiento_service, "registrar_avistamiento_desde_hito")
def test_llegue_refugio_no_genera_avistamiento(derivado, make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(
            execute_results=[
                SimpleNamespace(
                    data=[
                        {
                            "id": "rep-1",
                            "estado_reporte": "en_atencion",
                            "staff_asignado_id": "staff-1",
                            "asociacion_asignada_id": "aso-1",
                        }
                    ],
                    count=None,
                ),
                SimpleNamespace(data=[{"id": "rep-1"}], count=None),
            ]
        ),
        "reporte_estados": make_query(data=[{"id": "estado-rescatado"}]),
        "asociaciones": make_query(data=[{"latitud": 19.04, "longitud": -98.19}]),
    }
    supabase = _supabase(tablas, auth_id="auth-staff-1")

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial"),
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={
                "tipo_hito": "llegue_refugio",
                "foto_url": "https://x/foto-refugio.jpg",
                "latitud": 19.04,
                "longitud": -98.19,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    derivado.assert_not_called()


@patch.object(avistamiento_service, "registrar_avistamiento_desde_hito")
def test_animal_bajo_resguardo_no_genera_avistamiento(derivado, make_query):
    fecha_limite = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion_externo()]),
        "voluntarios": make_query(data=[{"id": "voluntario-1"}]),
        "planes_custodia_temporal": make_query(data=[]),
    }
    supabase = _supabase(tablas, auth_id="auth-externo-1")

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(reports, "supabase_admin", supabase),
        patch.object(report_service, "registrar_historial"),
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
    derivado.assert_not_called()


@patch.object(avistamiento_service, "registrar_avistamiento_desde_hito")
def test_llegada_hogar_temporal_no_genera_avistamiento(derivado, make_query):
    fecha_limite = (datetime.now(timezone.utc) + timedelta(days=9)).isoformat()
    tablas = {
        "usuarios": make_query(data=[_usuario_externo()]),
        "reportes": make_query(data=[_reporte_en_atencion_externo()]),
        "historial_reporte": make_query(data=[{"id": "resguardo-1"}]),
        "voluntarios": make_query(data=[{"id": "voluntario-1"}]),
        "perfil_casa_temporal": make_query(
            data=[{"latitud": 19.4327, "longitud": -99.1333}]
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
    supabase = _supabase(tablas, auth_id="auth-externo-1")

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(reports, "supabase_admin", supabase),
        patch.object(report_service, "registrar_historial"),
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
    derivado.assert_not_called()
