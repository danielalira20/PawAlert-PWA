"""Traduce el contrato de despacho de PawAlert y ejecuta VROOM."""

import logging
from datetime import datetime, timezone

from app.models.dispatch import (
    DispatchAssignment,
    DispatchCandidate,
    DispatchOptimizationRequest,
    DispatchOptimizationResult,
)
from app.services import vroom_service

logger = logging.getLogger(__name__)

_PROFILE = "car"
_UNUSED_ARC_PADDING = 86_400


def _matrix_value(value: float | None) -> int:
    if value is None or value < 0:
        raise ValueError("Prepared dispatch contains an unavailable route")
    return round(value)


def _candidate_map(
    request: DispatchOptimizationRequest,
) -> dict[tuple[str, str], DispatchCandidate]:
    return {
        (candidate.report_id, candidate.volunteer_id): candidate
        for candidate in request.candidates
    }


def _route_values(
    request: DispatchOptimizationRequest,
) -> tuple[dict[tuple[str, str], int], dict[tuple[str, str], int]]:
    durations: dict[tuple[str, str], int] = {}
    distances: dict[tuple[str, str], int] = {}
    matrix = request.travel_matrix
    for volunteer_index, volunteer_id in enumerate(matrix.origin_ids):
        for report_index, report_id in enumerate(matrix.destination_ids):
            pair = (report_id, volunteer_id)
            durations[pair] = _matrix_value(
                matrix.durations_seconds[volunteer_index][report_index]
            )
            distances[pair] = _matrix_value(
                matrix.distances_meters[volunteer_index][report_index]
            )
    return durations, distances


def _empty_square(size: int, unused_value: int) -> list[list[int]]:
    return [
        [0 if row == column else unused_value for column in range(size)]
        for row in range(size)
    ]


def build_vroom_request(
    request: DispatchOptimizationRequest,
) -> vroom_service.VroomOptimizationRequest:
    """Construye el payload VROOM sin ampliar ni recalcular candidatos."""
    volunteer_index = {
        volunteer.volunteer_id: index
        for index, volunteer in enumerate(request.volunteers)
    }
    report_index = {
        job.report_id: len(request.volunteers) + index
        for index, job in enumerate(request.jobs)
    }
    skill_by_report = {
        job.report_id: index + 1
        for index, job in enumerate(request.jobs)
    }
    candidates = _candidate_map(request)
    route_durations, route_distances = _route_values(request)

    max_duration = max(route_durations.values(), default=0)
    max_distance = max(route_distances.values(), default=0)
    rank_step = max_duration + 1
    size = len(request.volunteers) + len(request.jobs)
    unused_duration = max_duration + _UNUSED_ARC_PADDING
    unused_distance = max_distance + _UNUSED_ARC_PADDING
    unused_cost = rank_step * (len(request.volunteers) + 2) + unused_duration

    durations = _empty_square(size, unused_duration)
    distances = _empty_square(size, unused_distance)
    costs = _empty_square(size, unused_cost)

    candidates_by_report: dict[str, list[DispatchCandidate]] = {}
    for candidate in request.candidates:
        candidates_by_report.setdefault(candidate.report_id, []).append(candidate)

    candidate_rank: dict[tuple[str, str], int] = {}
    for report_id, report_candidates in candidates_by_report.items():
        ordered = sorted(
            report_candidates,
            key=lambda candidate: (
                -candidate.matching_score,
                route_durations[(report_id, candidate.volunteer_id)],
                candidate.volunteer_id,
            ),
        )
        candidate_rank.update(
            {
                (report_id, candidate.volunteer_id): rank
                for rank, candidate in enumerate(ordered)
            }
        )

    for pair in candidates:
        report_id, volunteer_id = pair
        origin = volunteer_index[volunteer_id]
        destination = report_index[report_id]
        duration = route_durations[pair]
        durations[origin][destination] = duration
        distances[origin][destination] = route_distances[pair]
        costs[origin][destination] = candidate_rank[pair] * rank_step + duration

    vehicles = []
    for index, volunteer in enumerate(request.volunteers):
        allowed_reports = [
            job.report_id
            for job in request.jobs
            if (job.report_id, volunteer.volunteer_id) in candidates
        ]
        vehicles.append(
            vroom_service.VroomVehicle(
                id=index + 1,
                start_index=index,
                capacity=[1],
                skills=[skill_by_report[report_id] for report_id in allowed_reports],
                profile=_PROFILE,
            )
        )

    jobs = [
        vroom_service.VroomJob(
            id=index + 1,
            location_index=report_index[job.report_id],
            service=job.service_seconds,
            priority=round(job.urgency.score),
            delivery=[1],
            skills=[skill_by_report[job.report_id]],
        )
        for index, job in enumerate(request.jobs)
    ]
    return vroom_service.VroomOptimizationRequest(
        vehicles=vehicles,
        jobs=jobs,
        matrices={
            _PROFILE: vroom_service.VroomProfileMatrix(
                durations=durations,
                distances=distances,
                costs=costs,
            )
        },
    )


def _fallback_local(
    request: DispatchOptimizationRequest,
) -> DispatchOptimizationResult:
    """Seleccion determinista si VROOM no esta disponible."""
    route_durations, route_distances = _route_values(request)
    candidates_by_report: dict[str, list[DispatchCandidate]] = {}
    for candidate in request.candidates:
        candidates_by_report.setdefault(candidate.report_id, []).append(candidate)

    assignments = []
    assigned_volunteers: set[str] = set()
    unassigned_report_ids = []
    ordered_jobs = sorted(
        request.jobs,
        key=lambda job: (-job.urgency.score, job.report_id),
    )
    for job in ordered_jobs:
        candidates = sorted(
            candidates_by_report.get(job.report_id, []),
            key=lambda candidate: (
                -candidate.matching_score,
                route_durations[(job.report_id, candidate.volunteer_id)],
                candidate.volunteer_id,
            ),
        )
        selected = next(
            (
                candidate
                for candidate in candidates
                if candidate.volunteer_id not in assigned_volunteers
            ),
            None,
        )
        if selected is None:
            unassigned_report_ids.append(job.report_id)
            continue
        assigned_volunteers.add(selected.volunteer_id)
        pair = (job.report_id, selected.volunteer_id)
        assignments.append(
            DispatchAssignment(
                report_id=job.report_id,
                volunteer_id=selected.volunteer_id,
                arrival_seconds=route_durations[pair],
                distance_meters=route_distances[pair],
            )
        )

    return DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="local_fallback",
        calculated_at=datetime.now(timezone.utc),
    )


def _translate_vroom_result(
    request: DispatchOptimizationRequest,
    result: vroom_service.VroomOptimizationResult,
) -> DispatchOptimizationResult:
    volunteer_by_id = {
        index + 1: volunteer.volunteer_id
        for index, volunteer in enumerate(request.volunteers)
    }
    report_by_id = {
        index + 1: job.report_id
        for index, job in enumerate(request.jobs)
    }
    location_index_by_report = {
        job.report_id: len(request.volunteers) + index
        for index, job in enumerate(request.jobs)
    }
    candidates = _candidate_map(request)
    route_durations, route_distances = _route_values(request)
    assignments = []
    assigned_reports: set[str] = set()
    assigned_volunteers: set[str] = set()

    for route in result.routes:
        volunteer_id = volunteer_by_id.get(route.vehicle_id)
        if volunteer_id is None or volunteer_id in assigned_volunteers:
            raise ValueError("VROOM returned an unknown or repeated vehicle")
        route_job_count = 0
        for step in route.steps:
            if step.type != "job" or step.job_id is None:
                continue
            route_job_count += 1
            if route_job_count > 1:
                raise ValueError("VROOM exceeded the per-run volunteer capacity")
            report_id = report_by_id.get(step.job_id)
            pair = (report_id or "", volunteer_id)
            if report_id is None or pair not in candidates:
                raise ValueError("VROOM returned an unauthorized assignment")
            if step.location_index != location_index_by_report[report_id]:
                raise ValueError("VROOM returned an inconsistent job location")
            if report_id in assigned_reports:
                raise ValueError("VROOM returned a repeated job")
            assigned_reports.add(report_id)
            assigned_volunteers.add(volunteer_id)
            assignments.append(
                DispatchAssignment(
                    report_id=report_id,
                    volunteer_id=volunteer_id,
                    arrival_seconds=route_durations[pair],
                    distance_meters=route_distances[pair],
                )
            )

    known_reports = {job.report_id for job in request.jobs}
    unassigned_from_provider = {
        report_by_id[job_id]
        for job_id in result.unassigned_job_ids
        if job_id in report_by_id
    }
    unassigned = sorted(
        (known_reports - assigned_reports) | unassigned_from_provider
    )
    return DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned,
        source="vroom",
        calculated_at=result.calculated_at,
    )


def optimize_dispatch(
    request: DispatchOptimizationRequest,
) -> DispatchOptimizationResult:
    """Optimiza un contrato preparado y siempre devuelve un resultado local."""
    try:
        vroom_request = build_vroom_request(request)
        result = vroom_service.get_optimization(vroom_request)
        if result.status == "complete":
            return _translate_vroom_result(request, result)
    except Exception:
        logger.exception("Respuesta VROOM invalida; usando fallback local")
    return _fallback_local(request)
