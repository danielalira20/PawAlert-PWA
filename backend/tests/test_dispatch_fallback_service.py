from datetime import datetime, timezone

from app.models.dispatch import (
    CandidateRouteTier,
    DispatchCandidate,
    DispatchJob,
    DispatchOptimizationPass,
    DispatchOptimizationRequest,
    DispatchUrgency,
    DispatchVolunteer,
    RouteMatrixResult,
    RoutingPoint,
    RoutingStatus,
)
from app.services.dispatch_fallback_service import optimize_dispatch_fallback


NOW = datetime(2026, 8, 24, 12, 0, tzinfo=timezone.utc)


def prepared_request(
    urgency_by_report: dict[str, float],
    volunteer_roles: dict[str, str],
    candidate_specs: list[tuple[str, str, float, CandidateRouteTier]],
    durations: list[list[float | None]],
) -> DispatchOptimizationRequest:
    report_ids = list(urgency_by_report)
    volunteer_ids = list(volunteer_roles)
    candidates = [
        DispatchCandidate(
            report_id=report_id,
            volunteer_id=volunteer_id,
            matching_score=matching_score,
            offered=volunteer_roles[volunteer_id] == "voluntario_externo",
            route_tier=route_tier,
            automatic_eligible=(
                volunteer_roles[volunteer_id] == "voluntario_interno"
                and route_tier != CandidateRouteTier.manual_only
            ),
        )
        for report_id, volunteer_id, matching_score, route_tier
        in candidate_specs
    ]
    return DispatchOptimizationRequest(
        jobs=[
            DispatchJob(
                report_id=report_id,
                location=RoutingPoint(
                    id=report_id,
                    latitude=19.0 + index / 100,
                    longitude=-98.0,
                ),
                urgency=DispatchUrgency(
                    score=urgency,
                    level="rojo" if urgency >= 70 else "verde",
                    calculated_at=NOW,
                ),
            )
            for index, (report_id, urgency)
            in enumerate(urgency_by_report.items())
        ],
        volunteers=[
            DispatchVolunteer(
                volunteer_id=volunteer_id,
                location=RoutingPoint(
                    id=volunteer_id,
                    latitude=19.2 + index / 100,
                    longitude=-98.1,
                ),
                matching_score=max(
                    score
                    for _, candidate_volunteer_id, score, _ in candidate_specs
                    if candidate_volunteer_id == volunteer_id
                ),
                capacity=1,
                current_load=0,
                role=role,
                offered_report_ids=(
                    [
                        report_id
                        for report_id, candidate_volunteer_id, _, _
                        in candidate_specs
                        if candidate_volunteer_id == volunteer_id
                    ]
                    if role == "voluntario_externo"
                    else []
                ),
            )
            for index, (volunteer_id, role)
            in enumerate(volunteer_roles.items())
        ],
        candidates=candidates,
        travel_matrix=RouteMatrixResult(
            origin_ids=volunteer_ids,
            destination_ids=report_ids,
            durations_seconds=durations,
            distances_meters=[
                [None if value is None else value * 8 for value in row]
                for row in durations
            ],
            status=RoutingStatus.complete,
            calculated_at=NOW,
        ),
    )


def test_primary_window_uses_full_matching_score_before_eta():
    request = prepared_request(
        {"r1": 80},
        {
            "v-near": "voluntario_interno",
            "v-score": "voluntario_interno",
        },
        [
            ("r1", "v-near", 60, CandidateRouteTier.primary),
            ("r1", "v-score", 95, CandidateRouteTier.primary),
        ],
        [[100], [300]],
    )

    result = optimize_dispatch_fallback(request)

    assert result.assignments[0].volunteer_id == "v-score"
    assert result.assignments[0].arrival_seconds == 300
    assert result.optimization_pass == DispatchOptimizationPass.primary


def test_global_fallback_rearranges_candidates_to_cover_both_reports():
    request = prepared_request(
        {"r1": 90, "r2": 80},
        {"v1": "voluntario_interno", "v2": "voluntario_interno"},
        [
            ("r1", "v1", 100, CandidateRouteTier.primary),
            ("r1", "v2", 90, CandidateRouteTier.primary),
            ("r2", "v1", 95, CandidateRouteTier.primary),
        ],
        [[100, 100], [110, None]],
    )

    result = optimize_dispatch_fallback(request)

    assert [
        (assignment.report_id, assignment.volunteer_id)
        for assignment in result.assignments
    ] == [("r1", "v2"), ("r2", "v1")]
    assert result.unassigned_report_ids == []


def test_expanded_pass_wins_only_when_secondary_improves_coverage():
    request = prepared_request(
        {"r1": 90, "r2": 80},
        {"v1": "voluntario_interno", "v2": "voluntario_interno"},
        [
            ("r1", "v1", 95, CandidateRouteTier.primary),
            ("r1", "v2", 90, CandidateRouteTier.secondary),
            ("r2", "v1", 95, CandidateRouteTier.primary),
        ],
        [[100, 100], [500, None]],
    )

    result = optimize_dispatch_fallback(request)

    assert [
        (assignment.report_id, assignment.volunteer_id)
        for assignment in result.assignments
    ] == [("r1", "v2"), ("r2", "v1")]
    assert result.optimization_pass == DispatchOptimizationPass.expanded
    assert result.used_secondary is True


def test_secondary_does_not_displace_primary_for_the_same_coverage():
    request = prepared_request(
        {"r1": 80},
        {"v1": "voluntario_interno", "v2": "voluntario_interno"},
        [
            ("r1", "v1", 50, CandidateRouteTier.primary),
            ("r1", "v2", 100, CandidateRouteTier.secondary),
        ],
        [[100], [500]],
    )

    result = optimize_dispatch_fallback(request)

    assert result.assignments[0].volunteer_id == "v1"
    assert result.optimization_pass == DispatchOptimizationPass.primary
    assert result.used_secondary is False


def test_external_and_manual_only_candidates_remain_unassigned():
    request = prepared_request(
        {"r1": 80},
        {
            "v-manual": "voluntario_interno",
            "v-external": "voluntario_externo",
        },
        [
            ("r1", "v-manual", 90, CandidateRouteTier.manual_only),
            ("r1", "v-external", 95, CandidateRouteTier.primary),
        ],
        [[2000], [100]],
    )

    result = optimize_dispatch_fallback(request)

    assert result.assignments == []
    assert result.unassigned_report_ids == ["r1"]
    assert result.source == "local_fallback"


def test_equal_candidates_use_stable_identifier_tiebreaker():
    request = prepared_request(
        {"r1": 80},
        {"v2": "voluntario_interno", "v1": "voluntario_interno"},
        [
            ("r1", "v2", 90, CandidateRouteTier.primary),
            ("r1", "v1", 90, CandidateRouteTier.primary),
        ],
        [[100], [100]],
    )

    result = optimize_dispatch_fallback(request)

    assert result.assignments[0].volunteer_id == "v1"
