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
