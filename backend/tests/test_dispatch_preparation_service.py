from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.models.dispatch import (
    DispatchPreparationErrorCode,
    DispatchPreparationStatus,
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingStatus,
)
from app.services import dispatch_preparation_service as service


NOW = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)


def report(report_id: str, **changes) -> dict:
    row = {
        "id": report_id,
        "asociacion_asignada_id": "aso-1",
        "staff_asignado_id": None,
        "estado_validacion_reporte": "aprobado",
        "estado_reporte": "asignado",
        "estado_cobertura": "abierto",
        "latitud": 19.10,
        "longitud": -98.10,
        "ultima_latitud_confirmada": None,
        "ultima_longitud_confirmada": None,
        "urgency_score": 75,
        "urgency_nivel": "rojo",
        "urgency_calculado_at": NOW.isoformat(),
        "urgency_excluido": False,
        "animal": [
            {
                "tipo_animal_catalogo": {"clave": "perro"},
                "tamanio_catalogo": {"clave": "mediano"},
            }
        ],
    }
    row.update(changes)
    return row


def candidate(volunteer_id: str, score: float, **changes) -> dict:
    row = {
        "voluntario_id": volunteer_id,
        "tipo": "voluntario_interno",
        "score": {"total": score},
        "max_casos_simultaneos": 2,
        "carga_actual": 0,
    }
    row.update(changes)
    return row


def capacity(volunteer_id: str, **changes) -> dict:
    row = {
        "voluntario_id": volunteer_id,
        "latitud": 19.01,
        "longitud": -98.01,
        "especies_manejo": ["perro", "gato"],
        "tamanios_manejo": ["pequeno", "mediano"],
    }
    row.update(changes)
    return row


def matrix(
    volunteer_ids: list[str],
    report_ids: list[str],
    **changes,
) -> RouteMatrixResult:
    rows = len(volunteer_ids)
    columns = len(report_ids)
    values = {
        "origin_ids": volunteer_ids,
        "destination_ids": report_ids,
        "durations_seconds": [
            [float(120 + row + column) for column in range(columns)]
            for row in range(rows)
        ],
        "distances_meters": [
            [float(900 + row + column) for column in range(columns)]
            for row in range(rows)
        ],
        "status": RoutingStatus.complete,
        "calculated_at": NOW,
    }
    values.update(changes)
    return RouteMatrixResult(**values)


def database(make_query, reports: list[dict], capacities: list[dict]):
    db = MagicMock()
    db.table.side_effect = lambda name: {
        "reportes": make_query(data=reports),
        "capacidades": make_query(data=capacities),
    }[name]
    return db


def test_prepares_multi_report_contract_with_pair_scores(make_query):
    reports = [
        report("rep-1"),
        report(
            "rep-2",
            urgency_score=45,
            urgency_nivel="amarillo",
            ultima_latitud_confirmada=19.25,
            ultima_longitud_confirmada=-98.25,
        ),
    ]
    capacities = [capacity("vol-int"), capacity("vol-ext")]
    internal_by_report = {
        "rep-1": [candidate("vol-int", 85)],
        "rep-2": [candidate("vol-int", 70)],
    }
    external_by_report = {
        "rep-1": [
            candidate(
                "vol-ext",
                90,
                tipo="voluntario_externo",
            )
        ],
        "rep-2": [],
    }
    route_matrix = matrix(["vol-int", "vol-ext"], ["rep-1", "rep-2"])

    with (
        patch.object(
            service,
            "supabase_admin",
            database(make_query, reports, capacities),
        ),
        patch.object(
            service.matching,
            "obtener_candidatos",
            side_effect=lambda report_id, **_kwargs: {
                "candidatos": internal_by_report[report_id]
            },
        ) as internal,
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            side_effect=lambda report_id, **_kwargs: external_by_report[report_id],
        ) as external,
        patch.object(
            service,
            "calculate_dispatch_route_matrix",
            return_value=route_matrix,
        ) as calculate_matrix,
    ):
        result = service.prepare_dispatch_optimization(["rep-1", "rep-2"])

    assert result.status == DispatchPreparationStatus.ready
    request = result.request
    assert request is not None
    assert request.jobs[1].location.latitude == 19.25
    assert request.jobs[0].urgency.score == 75
    assert request.jobs[0].required_skills == [
        "especie:perro",
        "tamanio:mediano",
    ]
    assert {
        (item.report_id, item.volunteer_id, item.matching_score, item.offered)
        for item in request.candidates
    } == {
        ("rep-1", "vol-int", 85, False),
        ("rep-2", "vol-int", 70, False),
        ("rep-1", "vol-ext", 90, True),
    }
    volunteers = {item.volunteer_id: item for item in request.volunteers}
    assert volunteers["vol-int"].matching_score == 85
    assert volunteers["vol-ext"].offered_report_ids == ["rep-1"]
    assert volunteers["vol-int"].skills == [
        "especie:gato",
        "especie:perro",
        "tamanio:mediano",
        "tamanio:pequeno",
    ]
    assert all(call.kwargs == {"incluir_rutas": False} for call in internal.call_args_list)
    assert all(call.kwargs == {"incluir_rutas": False} for call in external.call_args_list)
    calculate_matrix.assert_called_once_with(
        ["vol-int", "vol-ext"],
        ["rep-1", "rep-2"],
    )


def test_rejects_report_without_current_urgency(make_query):
    db = database(
        make_query,
        [report("rep-1", urgency_score=None, urgency_nivel=None)],
        [],
    )
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(service.matching, "obtener_candidatos") as matching,
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.status == DispatchPreparationStatus.unavailable
    assert result.error_code == DispatchPreparationErrorCode.urgency_unavailable
    assert result.request is None
    matching.assert_not_called()


def test_rejects_dispatch_without_candidates(make_query):
    db = database(make_query, [report("rep-1")], [])
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service.matching,
            "obtener_candidatos",
            return_value={"candidatos": []},
        ),
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ),
        patch.object(service, "calculate_dispatch_route_matrix") as route,
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.error_code == DispatchPreparationErrorCode.no_candidates
    route.assert_not_called()


def test_rejects_candidate_without_coordinates(make_query):
    db = database(
        make_query,
        [report("rep-1")],
        [capacity("vol-1", latitud=None)],
    )
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service.matching,
            "obtener_candidatos",
            return_value={"candidatos": [candidate("vol-1", 80)]},
        ),
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ),
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.error_code == DispatchPreparationErrorCode.missing_coordinates


def test_rejects_unavailable_route_matrix(make_query):
    db = database(
        make_query,
        [report("rep-1")],
        [capacity("vol-1")],
    )
    unavailable = matrix(
        ["vol-1"],
        ["rep-1"],
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        error_code=RoutingErrorCode.timeout,
    )
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service.matching,
            "obtener_candidatos",
            return_value={"candidatos": [candidate("vol-1", 80)]},
        ),
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ),
        patch.object(
            service,
            "calculate_dispatch_route_matrix",
            return_value=unavailable,
        ),
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.status == DispatchPreparationStatus.unavailable
    assert result.error_code == DispatchPreparationErrorCode.routing_unavailable


def test_rejects_partial_route_matrix(make_query):
    db = database(
        make_query,
        [report("rep-1")],
        [capacity("vol-1")],
    )
    partial = matrix(
        ["vol-1"],
        ["rep-1"],
        durations_seconds=[[None]],
        distances_meters=[[None]],
    )
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service.matching,
            "obtener_candidatos",
            return_value={"candidatos": [candidate("vol-1", 80)]},
        ),
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ),
        patch.object(
            service,
            "calculate_dispatch_route_matrix",
            return_value=partial,
        ),
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.error_code == DispatchPreparationErrorCode.routing_unavailable
