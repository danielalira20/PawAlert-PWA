from datetime import datetime, timezone
from unittest.mock import patch

from app.models.dispatch import (
    DispatchCandidate,
    DispatchJob,
    DispatchOptimizationRequest,
    DispatchUrgency,
    DispatchVolunteer,
    RouteMatrixResult,
    RoutingPoint,
    RoutingStatus,
)
from app.services import dispatch_optimizer, vroom_service


NOW = datetime.now(timezone.utc)


def prepared_request() -> DispatchOptimizationRequest:
    return DispatchOptimizationRequest(
        jobs=[
            DispatchJob(
                report_id="r1",
                location=RoutingPoint(id="r1", latitude=19.4, longitude=-99.1),
                urgency=DispatchUrgency(
                    score=90,
                    level="rojo",
                    calculated_at=NOW,
                ),
            ),
            DispatchJob(
                report_id="r2",
                location=RoutingPoint(id="r2", latitude=19.5, longitude=-99.2),
                urgency=DispatchUrgency(
                    score=40,
                    level="verde",
                    calculated_at=NOW,
                ),
            ),
        ],
        volunteers=[
            DispatchVolunteer(
                volunteer_id="v1",
                location=RoutingPoint(id="v1", latitude=19.3, longitude=-99.1),
                matching_score=95,
                capacity=2,
                current_load=0,
                role="voluntario_interno",
            ),
            DispatchVolunteer(
                volunteer_id="v2",
                location=RoutingPoint(id="v2", latitude=19.6, longitude=-99.2),
                matching_score=85,
                capacity=1,
                current_load=0,
                role="voluntario_externo",
                offered_report_ids=["r1"],
            ),
        ],
        candidates=[
            DispatchCandidate(
                report_id="r1",
                volunteer_id="v1",
                matching_score=95,
            ),
            DispatchCandidate(
                report_id="r1",
                volunteer_id="v2",
                matching_score=85,
                offered=True,
            ),
            DispatchCandidate(
                report_id="r2",
                volunteer_id="v1",
                matching_score=80,
            ),
        ],
        travel_matrix=RouteMatrixResult(
            origin_ids=["v1", "v2"],
            destination_ids=["r1", "r2"],
            durations_seconds=[[600, 900], [300, 1200]],
            distances_meters=[[4000, 7000], [2000, 9000]],
            status=RoutingStatus.complete,
            calculated_at=NOW,
        ),
    )


def test_builds_square_matrix_and_candidate_skills():
    result = dispatch_optimizer.build_vroom_request(prepared_request())

    matrix = result.matrices["car"]
    assert len(matrix.durations) == 4
    assert all(len(row) == 4 for row in matrix.durations)
    assert matrix.durations[0][2:] == [600, 900]
    assert matrix.durations[1][2] == 300
    assert result.vehicles[0].skills == [1, 2]
    assert result.vehicles[1].skills == [1]
    assert result.jobs[0].priority == 90
    assert result.jobs[0].service == 1800


def test_matching_rank_precedes_route_time_in_costs():
    result = dispatch_optimizer.build_vroom_request(prepared_request())
    costs = result.matrices["car"].costs

    assert costs is not None
    assert costs[0][2] < costs[1][2]


def test_translates_valid_vroom_assignments():
    provider_result = vroom_service.VroomOptimizationResult(
        status="complete",
        routes=[
            vroom_service.VroomRoute(
                vehicle_id=1,
                steps=[
                    vroom_service.VroomRouteStep(
                        type="job",
                        job_id=2,
                        location_index=3,
                        arrival=900,
                    )
                ],
            ),
            vroom_service.VroomRoute(
                vehicle_id=2,
                steps=[
                    vroom_service.VroomRouteStep(
                        type="job",
                        job_id=1,
                        location_index=2,
                        arrival=300,
                    )
                ],
            ),
        ],
        calculated_at=NOW,
    )
    with patch.object(
        dispatch_optimizer.vroom_service,
        "get_optimization",
        return_value=provider_result,
    ):
        result = dispatch_optimizer.optimize_dispatch(prepared_request())

    assert result.source == "vroom"
    assert [(item.report_id, item.volunteer_id) for item in result.assignments] == [
        ("r2", "v1"),
        ("r1", "v2"),
    ]
    assert result.assignments[1].arrival_seconds == 300
    assert result.unassigned_report_ids == []


def test_provider_failure_uses_urgency_ordered_local_fallback():
    unavailable = vroom_service.VroomOptimizationResult(
        status="unavailable",
        error_code="timeout",
        calculated_at=NOW,
    )
    with patch.object(
        dispatch_optimizer.vroom_service,
        "get_optimization",
        return_value=unavailable,
    ):
        result = dispatch_optimizer.optimize_dispatch(prepared_request())

    assert result.source == "local_fallback"
    assert [(item.report_id, item.volunteer_id) for item in result.assignments] == [
        ("r1", "v1"),
    ]
    assert result.unassigned_report_ids == ["r2"]


def test_unauthorized_provider_assignment_falls_back_locally():
    invalid = vroom_service.VroomOptimizationResult(
        status="complete",
        routes=[
            vroom_service.VroomRoute(
                vehicle_id=2,
                steps=[
                    vroom_service.VroomRouteStep(
                        type="job",
                        job_id=2,
                        location_index=3,
                        arrival=1200,
                    )
                ],
            )
        ],
        calculated_at=NOW,
    )
    with patch.object(
        dispatch_optimizer.vroom_service,
        "get_optimization",
        return_value=invalid,
    ):
        result = dispatch_optimizer.optimize_dispatch(prepared_request())

    assert result.source == "local_fallback"
    assert result.assignments[0].report_id == "r1"


def test_provider_cannot_assign_two_jobs_to_the_same_volunteer():
    invalid = vroom_service.VroomOptimizationResult(
        status="complete",
        routes=[
            vroom_service.VroomRoute(
                vehicle_id=1,
                steps=[
                    vroom_service.VroomRouteStep(
                        type="job",
                        job_id=1,
                        location_index=2,
                        arrival=600,
                    ),
                    vroom_service.VroomRouteStep(
                        type="job",
                        job_id=2,
                        location_index=3,
                        arrival=1500,
                    ),
                ],
            )
        ],
        calculated_at=NOW,
    )
    with patch.object(
        dispatch_optimizer.vroom_service,
        "get_optimization",
        return_value=invalid,
    ):
        result = dispatch_optimizer.optimize_dispatch(prepared_request())

    assert result.source == "local_fallback"
    assert len(result.assignments) == 1
