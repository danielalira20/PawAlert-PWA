from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import stats
from app.main import app


client = TestClient(app)


def test_stats_suma_cantidad_y_exige_asociaciones_verificadas(make_query):
    asociaciones = make_query(data=[], count=2)
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[
            {"id": "rep-1", "animal": [{"orden": 1, "cantidad": 5}]},
            {"id": "rep-2", "animal": [
                {"orden": 1, "cantidad": 1}, {"orden": 2, "cantidad": 2},
            ]},
        ], count=None),
        SimpleNamespace(data=[], count=12),
    ])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: asociaciones if nombre == "asociaciones" else reportes

    with patch.object(stats, "supabase", supabase):
        response = client.get("/stats/generales")

    assert response.status_code == 200
    assert response.json() == {
        "asociaciones_activas": 2,
        "reportes_atendidos": 12,
        "animales_rescatados": 8,
    }
    assert asociaciones.eq.call_args_list[0].args == ("activo", True)
    assert asociaciones.eq.call_args_list[1].args == ("verificado", True)
    reportes.eq.assert_called_once_with("estado_reporte", "cerrado")
    reportes.neq.assert_called_once_with("estado_reporte", "pendiente")


def test_stats_cantidad_nula_cuenta_como_un_animal(make_query):
    asociaciones = make_query(data=[], count=0)
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[{"id": "rep-1", "animal": [{"orden": 1, "cantidad": None}]}], count=None),
        SimpleNamespace(data=[], count=0),
    ])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: asociaciones if nombre == "asociaciones" else reportes

    with patch.object(stats, "supabase", supabase):
        response = client.get("/stats/generales")

    assert response.json()["animales_rescatados"] == 1


def test_stats_admin_requiere_autenticacion():
    response = client.get("/stats/admin")
    assert response.status_code == 401


def test_stats_admin_calcula_metricas(make_query):
    reportes_data = [
        {
            "id": "r1", "estado_reporte": "pendiente", "estado_moderacion": "aprobado",
            "latitud": 19.04, "longitud": -98.20, "urgency_nivel": "rojo",
            "municipio": "Puebla", "colonia": "Centro",
        },
        {
            "id": "r2", "estado_reporte": "sin_cobertura", "estado_moderacion": "aprobado",
            "latitud": 19.05, "longitud": -98.21, "urgency_nivel": "amarillo",
            "municipio": "Puebla", "colonia": "Centro",
        },
        {
            "id": "r3", "estado_reporte": "cerrado", "estado_moderacion": "aprobado",
            "latitud": 19.10, "longitud": -98.30, "urgency_nivel": None,
            "municipio": "Puebla", "colonia": "Norte",
        },
        {
            "id": "r4", "estado_reporte": "duplicado", "estado_moderacion": "rechazado",
            "latitud": None, "longitud": None, "urgency_nivel": None,
            "municipio": None, "colonia": None,
        },
    ]
    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=reportes_data, count=None),
        SimpleNamespace(data=[{"id": "r1", "created_at": "2026-08-01T00:00:00+00:00"}], count=None),
    ])
    propuestas_query = make_query(data=[
        {"reporte_id": "r1", "respondida_at": "2026-08-01T02:00:00+00:00"},
    ])
    necesidades_query = make_query(data=[
        {"categoria": "alimento"}, {"categoria": "alimento"}, {"categoria": "transporte"},
    ])
    tablas = {
        "reportes": reportes_query,
        "propuestas_asignacion": propuestas_query,
        "necesidades": necesidades_query,
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(stats, "supabase", supabase),
        patch.object(stats, "_verificar_admin", return_value={"id": "admin-1"}),
    ):
        response = client.get("/stats/admin", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    body = response.json()
    assert body["casos_activos_actuales"] == 2
    assert body["tiempo_promedio_aceptacion_horas"] == 2.0
    assert body["tasa_duplicados"] == 0.25
    assert body["tasa_fraude_detectado"] == 0.25
    assert body["recursos_mas_solicitados"][0] == {"categoria": "alimento", "cantidad": 2}
    assert {"municipio": "Puebla", "colonia": "Centro", "cantidad": 1} in (
        body["casos_sin_cobertura_por_zona"]
    )
    assert len(body["mapa_calor_activo"]) == 2
    assert len(body["mapa_calor_historico"]) == 1
