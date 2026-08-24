from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.models.dispatch import (
    CandidateRouteTier,
    DispatchExclusionReason,
    DispatchExclusionScope,
    DispatchPreparationErrorCode,
    DispatchPreparationStatus,
    DispatchRoutingPolicy,
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


def test_route_tier_boundaries_are_inclusive():
    policy = DispatchRoutingPolicy(
        candidate_window_minutes=5,
        secondary_max_eta_minutes=30,
    )

    assert service._route_tier(420, 120, policy) == CandidateRouteTier.primary
    assert service._route_tier(1800, 120, policy) == CandidateRouteTier.secondary
    assert service._route_tier(1801, 120, policy) == CandidateRouteTier.manual_only


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
    route_matrix = matrix(
        ["vol-int", "vol-ext"],
        ["rep-1", "rep-2"],
        durations_seconds=[[120, 600], [480, 700]],
    )

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
        (
            item.report_id,
            item.volunteer_id,
            item.matching_score,
            item.offered,
            item.route_tier,
            item.automatic_eligible,
        )
        for item in request.candidates
    } == {
        ("rep-1", "vol-int", 85, False, CandidateRouteTier.primary, True),
        ("rep-2", "vol-int", 70, False, CandidateRouteTier.primary, True),
        ("rep-1", "vol-ext", 90, True, CandidateRouteTier.secondary, False),
    }
    assert request.routing_policy.candidate_window_minutes == 5
    assert request.routing_policy.secondary_max_eta_minutes == 30
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
    assert [
        (item.scope, item.reason, item.report_id)
        for item in result.excluded_items
    ] == [
        (
            DispatchExclusionScope.report,
            DispatchExclusionReason.urgency_unavailable,
            "rep-1",
        )
    ]
    matching.assert_not_called()


def test_excludes_invalid_reports_without_losing_valid_batch(make_query):
    reports = [
        report("rep-valid"),
        report("rep-urgency", urgency_score=None, urgency_nivel=None),
        report("rep-location", latitud=200),
    ]
    db = database(
        make_query,
        reports,
        [capacity("vol-1")],
    )
    route_matrix = matrix(["vol-1"], ["rep-valid"])
    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service.matching,
            "obtener_candidatos",
            return_value={"candidatos": [candidate("vol-1", 80)]},
        ) as matching,
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ) as external,
        patch.object(
            service,
            "calculate_dispatch_route_matrix",
            return_value=route_matrix,
        ) as calculate_matrix,
    ):
        result = service.prepare_dispatch_optimization(
            ["rep-valid", "rep-missing", "rep-urgency", "rep-location"]
        )

    assert result.status == DispatchPreparationStatus.ready
    assert result.request is not None
    assert [job.report_id for job in result.request.jobs] == ["rep-valid"]
    assert [
        (item.report_id, item.reason)
        for item in result.excluded_items
    ] == [
        ("rep-missing", DispatchExclusionReason.report_not_operational),
        ("rep-urgency", DispatchExclusionReason.urgency_unavailable),
        ("rep-location", DispatchExclusionReason.missing_coordinates),
    ]
    matching.assert_called_once_with("rep-valid", incluir_rutas=False)
    external.assert_called_once_with("rep-valid", incluir_rutas=False)
    calculate_matrix.assert_called_once_with(["vol-1"], ["rep-valid"])


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
    assert [
        (item.scope, item.reason, item.report_id)
        for item in result.excluded_items
    ] == [
        (
            DispatchExclusionScope.report,
            DispatchExclusionReason.no_candidates,
            "rep-1",
        )
    ]
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
    assert [
        (item.scope, item.reason, item.volunteer_id)
        for item in result.excluded_items
    ] == [
        (
            DispatchExclusionScope.volunteer,
            DispatchExclusionReason.missing_coordinates,
            "vol-1",
        )
    ]


def test_excludes_invalid_volunteer_and_orphaned_report(make_query):
    reports = [report("rep-valid"), report("rep-orphaned")]
    capacities = [
        capacity("vol-valid"),
        capacity("vol-invalid", latitud=None),
    ]
    internal_by_report = {
        "rep-valid": [
            candidate("vol-valid", 85),
            candidate("vol-invalid", 70),
        ],
        "rep-orphaned": [candidate("vol-invalid", 75)],
    }
    route_matrix = matrix(["vol-valid"], ["rep-valid"])
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
        ),
        patch.object(
            service.coverage_service,
            "obtener_ofrecimientos_reporte",
            return_value=[],
        ),
        patch.object(
            service,
            "calculate_dispatch_route_matrix",
            return_value=route_matrix,
        ) as calculate_matrix,
    ):
        result = service.prepare_dispatch_optimization(
            ["rep-valid", "rep-orphaned"]
        )

    assert result.status == DispatchPreparationStatus.ready
    assert result.request is not None
    assert [job.report_id for job in result.request.jobs] == ["rep-valid"]
    assert [
        (item.scope, item.reason, item.report_id, item.volunteer_id)
        for item in result.excluded_items
    ] == [
        (
            DispatchExclusionScope.volunteer,
            DispatchExclusionReason.missing_coordinates,
            None,
            "vol-invalid",
        ),
        (
            DispatchExclusionScope.report,
            DispatchExclusionReason.no_candidates,
            "rep-orphaned",
            None,
        ),
    ]
    assert [
        volunteer.volunteer_id for volunteer in result.request.volunteers
    ] == ["vol-valid"]
    assert [
        (item.report_id, item.volunteer_id)
        for item in result.request.candidates
    ] == [("rep-valid", "vol-valid")]
    calculate_matrix.assert_called_once_with(["vol-valid"], ["rep-valid"])


def test_isolates_volunteer_with_inconsistent_roles():
    pairs = [
        {
            **candidate("vol-mixed", 80),
            "report_id": "rep-1",
            "role": "voluntario_interno",
            "offered": False,
        },
        {
            **candidate("vol-mixed", 75),
            "report_id": "rep-2",
            "role": "voluntario_externo",
            "offered": True,
        },
    ]

    volunteers, valid_pairs, exclusions = service._prepare_volunteers(
        pairs,
        {"vol-mixed": capacity("vol-mixed")},
    )

    assert volunteers == []
    assert valid_pairs == []
    assert [
        (item.scope, item.reason, item.volunteer_id)
        for item in exclusions
    ] == [
        (
            DispatchExclusionScope.volunteer,
            DispatchExclusionReason.invalid_candidate_data,
            "vol-mixed",
        )
    ]


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


def test_classifies_closest_candidate_over_absolute_limit_as_manual(make_query):
    db = database(
        make_query,
        [report("rep-1")],
        [capacity("vol-1")],
    )
    over_limit = matrix(
        ["vol-1"],
        ["rep-1"],
        durations_seconds=[[1801]],
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
            return_value=over_limit,
        ),
    ):
        result = service.prepare_dispatch_optimization(["rep-1"])

    assert result.status == DispatchPreparationStatus.ready
    assert result.request is not None
    prepared_candidate = result.request.candidates[0]
    assert prepared_candidate.route_tier == CandidateRouteTier.manual_only
    assert prepared_candidate.automatic_eligible is False
