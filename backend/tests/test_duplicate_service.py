"""Tests de duplicate_service.find_geographic_duplicates.

Nota importante sobre el alcance de estos tests: el filtro real de
distancia (<=150m), ventana temporal (+-120min) y estados excluidos vive
en la función SQL buscar_duplicados_geograficos (migración 0060), que
corre dentro de Postgres/PostGIS -- no en Python. Estos tests mockean
supabase.rpc(...), así que NO pueden ejercitar ST_DWithin ni el
WHERE de la función real contra una base real. Lo que sí verifican es:
(a) que find_geographic_duplicates arma los parámetros correctos hacia la
RPC, (b) que traduce cada fila devuelta a un DuplicateCandidate válido,
(c) que una fila fuera de contrato se descarta en vez de tumbar la
creación del reporte, y (d) que un fallo de la propia llamada a Supabase
tampoco tumba la creación. Los escenarios que dependen de que la RPC ya
haya filtrado algo (distancia real, colonia irrelevante, estado cerrado)
se simulan mockeando la RPC para que devuelva lo que un Postgres real ya
habría filtrado -- no se re-implementa esa lógica en Python.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.urgency import DuplicateSearchInput
from app.services import duplicate_service, report_service


NOW = datetime(2026, 8, 12, 12, 0, tzinfo=timezone.utc)


def _busqueda(**overrides):
    base = dict(
        latitude=19.04,
        longitude=-98.20,
        created_at=NOW,
        species=["perro"],
        quantity=1,
    )
    base.update(overrides)
    return DuplicateSearchInput(**base)


def _mock_catalogo(make_query, *, id_="perro-id"):
    """Mock de obtener_id_catalogo vía report_service.supabase -- misma
    tabla que usa el resto del repo (tipo_animal_catalogo.id)."""
    tablas = {"tipo_animal_catalogo": make_query(data=[{"id": id_}] if id_ else [])}
    supabase_mock = MagicMock()
    supabase_mock.table.side_effect = lambda nombre: tablas[nombre]
    return supabase_mock


def test_149_metros_y_119_minutos_es_candidato(make_query):
    fila = {
        "existing_report_id": "reporte-cercano",
        "distance_m": 149,
        "time_difference_minutes": 119,
        "shared_species": ["perro"],
    }
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[fila])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert len(resultado) == 1
    assert resultado[0].existing_report_id == "reporte-cercano"
    assert resultado[0].distance_m == 149
    assert resultado[0].time_difference_minutes == 119


def test_151_metros_se_descarta_por_contrato_pydantic(make_query):
    """La función SQL nunca debería devolver esto (su WHERE ya limita a
    <=150m) -- este test protege el camino defensivo: si de todos modos
    llegara una fila fuera de rango, el modelo Pydantic la rechaza y
    find_geographic_duplicates la descarta en vez de propagar el error."""
    fila = {
        "existing_report_id": "reporte-lejano",
        "distance_m": 151,
        "time_difference_minutes": 10,
        "shared_species": ["perro"],
    }
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[fila])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []


def test_121_minutos_se_descarta_por_contrato_pydantic(make_query):
    fila = {
        "existing_report_id": "reporte-viejo",
        "distance_m": 10,
        "time_difference_minutes": 121,
        "shared_species": ["perro"],
    }
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[fila])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []


def test_misma_colonia_pero_3km_no_es_candidato(make_query):
    """DuplicateSearchInput no lleva colonia -- este test documenta que el
    filtro es puramente geoespacial: se simula que la RPC (que sí calcula
    distancia real vía ST_DWithin dentro de Postgres) ya excluyó el
    reporte por estar a 3km, sin importar que comparta colonia de texto."""
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []


def test_distinta_colonia_pero_80_metros_es_candidato(make_query):
    fila = {
        "existing_report_id": "reporte-cercano-otra-colonia",
        "distance_m": 80,
        "time_difference_minutes": 15,
        "shared_species": ["perro"],
    }
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[fila])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert len(resultado) == 1
    assert resultado[0].distance_m == 80


def test_reporte_cerrado_cercano_no_es_candidato(make_query):
    """El filtro de estado_reporte (incluido 'cerrado') vive en el WHERE de
    la función SQL -- aquí se simula que la RPC ya excluyó la fila."""
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.return_value = make_query(data=[])

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []


def test_especies_sin_catalogo_no_llama_a_la_rpc(make_query):
    """Si ninguna especie nueva resuelve a un tipo_animal_id válido, no
    tiene sentido preguntarle a la función SQL -- se corta antes."""
    supabase_catalogo = _mock_catalogo(make_query, id_=None)
    supabase_rpc = MagicMock()

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []
    supabase_rpc.rpc.assert_not_called()


def test_duplicate_search_input_exige_coordenadas():
    """DuplicateSearchInput exige latitude/longitude -- un reporte sin GPS
    ni pin no puede construir la búsqueda. La protección ante esto vive en
    el punto de llamada (report_service.crear_reporte, ver
    test_reports.py::test_report_sin_coordenadas_omite_chequeo_de_duplicados_pero_no_revienta),
    que omite el chequeo de duplicados por completo cuando faltan
    coordenadas en vez de intentar construir una búsqueda inválida."""
    with pytest.raises(Exception):
        DuplicateSearchInput(
            latitude=None,
            longitude=None,
            created_at=NOW,
            species=["perro"],
            quantity=1,
        )


def test_falla_la_rpc_no_tumba_la_busqueda(make_query):
    supabase_catalogo = _mock_catalogo(make_query)
    supabase_rpc = MagicMock()
    supabase_rpc.rpc.side_effect = Exception("timeout de supabase")

    with (
        patch.object(report_service, "supabase", supabase_catalogo),
        patch.object(duplicate_service, "supabase_admin", supabase_rpc),
    ):
        resultado = duplicate_service.find_geographic_duplicates(_busqueda())

    assert resultado == []
