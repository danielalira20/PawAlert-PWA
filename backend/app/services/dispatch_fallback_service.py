"""Fallback determinista para un lote de despacho previamente validado."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from app.models.dispatch import (
    CandidateRouteTier,
    DispatchAssignment,
    DispatchCandidate,
    DispatchOptimizationPass,
    DispatchOptimizationRequest,
    DispatchOptimizationResult,
)


CostVector = tuple[Decimal, int, int, int, Decimal, int]
_ZERO_COST: CostVector = (Decimal(0), 0, 0, 0, Decimal(0), 0)


@dataclass
class _Edge:
    to: int
    reverse_index: int
    capacity: int
    cost: CostVector


@dataclass(frozen=True)
class _CandidateRoute:
    candidate: DispatchCandidate
    duration_seconds: Decimal
    distance_meters: float
    rank: int
    stable_rank: int


@dataclass(frozen=True)
class _Solution:
    assignments: tuple[DispatchAssignment, ...]
    unassigned_report_ids: tuple[str, ...]
    urgency_sum: Decimal
    secondary_count: int
    candidate_rank_sum: int
    duration_sum: Decimal

    @property
    def quality(self) -> tuple[Decimal, int, int, int, Decimal]:
        return (
            self.urgency_sum,
            len(self.assignments),
            -self.secondary_count,
            -self.candidate_rank_sum,
            -self.duration_sum,
        )

    @property
    def stable_signature(self) -> tuple[tuple[str, str], ...]:
        return tuple(
            (assignment.report_id, assignment.volunteer_id)
            for assignment in self.assignments
        )


def _add_cost(left: CostVector, right: CostVector) -> CostVector:
    return (
        left[0] + right[0],
        left[1] + right[1],
        left[2] + right[2],
        left[3] + right[3],
        left[4] + right[4],
        left[5] + right[5],
    )


def _negate_cost(cost: CostVector) -> CostVector:
    return (-cost[0], -cost[1], -cost[2], -cost[3], -cost[4], -cost[5])


def _add_edge(
    graph: list[list[_Edge]],
    origin: int,
    destination: int,
    capacity: int,
    cost: CostVector,
) -> _Edge:
    forward = _Edge(
        to=destination,
        reverse_index=len(graph[destination]),
        capacity=capacity,
        cost=cost,
    )
    reverse = _Edge(
        to=origin,
        reverse_index=len(graph[origin]),
        capacity=0,
        cost=_negate_cost(cost),
    )
    graph[origin].append(forward)
    graph[destination].append(reverse)
    return forward


def _send_one_unit(
    graph: list[list[_Edge]], source: int, sink: int
) -> None:
    distances: list[CostVector | None] = [None] * len(graph)
    previous: list[tuple[int, int] | None] = [None] * len(graph)
    distances[source] = _ZERO_COST

    for _ in range(len(graph) - 1):
        changed = False
        for origin, edges in enumerate(graph):
            origin_distance = distances[origin]
            if origin_distance is None:
                continue
            for edge_index, edge in enumerate(edges):
                if edge.capacity == 0:
                    continue
                candidate_distance = _add_cost(origin_distance, edge.cost)
                if (
                    distances[edge.to] is None
                    or candidate_distance < distances[edge.to]
                ):
                    distances[edge.to] = candidate_distance
                    previous[edge.to] = (origin, edge_index)
                    changed = True
        if not changed:
            break

    if previous[sink] is None:
        raise ValueError("Dispatch fallback could not complete the local flow")

    node = sink
    while node != source:
        predecessor = previous[node]
        if predecessor is None:
            raise ValueError("Dispatch fallback flow is incomplete")
        origin, edge_index = predecessor
        edge = graph[origin][edge_index]
        edge.capacity -= 1
        graph[node][edge.reverse_index].capacity += 1
        node = origin


def _route_lookup(
    request: DispatchOptimizationRequest,
) -> dict[tuple[str, str], tuple[Decimal, float]]:
    origin_index = {
        volunteer_id: index
        for index, volunteer_id in enumerate(request.travel_matrix.origin_ids)
    }
    destination_index = {
        report_id: index
        for index, report_id in enumerate(
            request.travel_matrix.destination_ids
        )
    }
    routes = {}
    for candidate in request.candidates:
        row = origin_index[candidate.volunteer_id]
        column = destination_index[candidate.report_id]
        duration = request.travel_matrix.durations_seconds[row][column]
        distance = request.travel_matrix.distances_meters[row][column]
        if duration is None or distance is None:
            raise ValueError("Prepared candidate does not have a usable route")
        routes[(candidate.report_id, candidate.volunteer_id)] = (
            Decimal(str(duration)),
            distance,
        )
    return routes


def _eligible_routes(
    request: DispatchOptimizationRequest,
    optimization_pass: DispatchOptimizationPass,
) -> dict[str, list[_CandidateRoute]]:
    routes = _route_lookup(request)
    candidates_by_report: dict[str, list[DispatchCandidate]] = {}
    for candidate in request.candidates:
        if not candidate.automatic_eligible:
            continue
        if candidate.route_tier == CandidateRouteTier.manual_only:
            continue
        if (
            optimization_pass == DispatchOptimizationPass.primary
            and candidate.route_tier != CandidateRouteTier.primary
        ):
            continue
        candidates_by_report.setdefault(candidate.report_id, []).append(
            candidate
        )

    stable_pairs = sorted(
        (candidate.report_id, candidate.volunteer_id)
        for candidates in candidates_by_report.values()
        for candidate in candidates
    )
    stable_rank = {pair: index for index, pair in enumerate(stable_pairs)}
    eligible = {}
    for report_id, candidates in candidates_by_report.items():
        ordered = sorted(
            candidates,
            key=lambda candidate: (
                -candidate.matching_score,
                routes[(report_id, candidate.volunteer_id)][0],
                candidate.volunteer_id,
            ),
        )
        eligible[report_id] = [
            _CandidateRoute(
                candidate=candidate,
                duration_seconds=routes[(report_id, candidate.volunteer_id)][0],
                distance_meters=routes[(report_id, candidate.volunteer_id)][1],
                rank=rank,
                stable_rank=stable_rank[
                    (report_id, candidate.volunteer_id)
                ],
            )
            for rank, candidate in enumerate(ordered)
        ]
    return eligible


def _solve_pass(
    request: DispatchOptimizationRequest,
    optimization_pass: DispatchOptimizationPass,
) -> _Solution:
    jobs = sorted(request.jobs, key=lambda job: job.report_id)
    routes_by_report = _eligible_routes(request, optimization_pass)
    volunteers = sorted(
        {
            route.candidate.volunteer_id
            for routes in routes_by_report.values()
            for route in routes
        }
    )

    source = 0
    first_job = 1
    first_volunteer = first_job + len(jobs)
    first_dummy = first_volunteer + len(volunteers)
    sink = first_dummy + len(jobs)
    graph: list[list[_Edge]] = [[] for _ in range(sink + 1)]
    job_node = {
        job.report_id: first_job + index for index, job in enumerate(jobs)
    }
    volunteer_node = {
        volunteer_id: first_volunteer + index
        for index, volunteer_id in enumerate(volunteers)
    }
    urgency_by_report = {
        job.report_id: Decimal(str(job.urgency.score)) for job in jobs
    }
    candidate_edges: dict[tuple[str, str], tuple[_Edge, _CandidateRoute]] = {}

    for index, job in enumerate(jobs):
        node = job_node[job.report_id]
        _add_edge(graph, source, node, 1, _ZERO_COST)
        for route in routes_by_report.get(job.report_id, []):
            candidate = route.candidate
            secondary = int(
                candidate.route_tier == CandidateRouteTier.secondary
            )
            cost: CostVector = (
                -urgency_by_report[job.report_id],
                -1,
                secondary,
                route.rank,
                route.duration_seconds,
                route.stable_rank,
            )
            edge = _add_edge(
                graph,
                node,
                volunteer_node[candidate.volunteer_id],
                1,
                cost,
            )
            candidate_edges[(job.report_id, candidate.volunteer_id)] = (
                edge,
                route,
            )
        dummy_node = first_dummy + index
        _add_edge(graph, node, dummy_node, 1, _ZERO_COST)
        _add_edge(graph, dummy_node, sink, 1, _ZERO_COST)

    for volunteer_id in volunteers:
        _add_edge(graph, volunteer_node[volunteer_id], sink, 1, _ZERO_COST)

    for _ in jobs:
        _send_one_unit(graph, source, sink)

    assignments = []
    candidate_rank_sum = 0
    duration_sum = Decimal(0)
    secondary_count = 0
    for (report_id, volunteer_id), (edge, route) in sorted(
        candidate_edges.items()
    ):
        if edge.capacity != 0:
            continue
        assignments.append(
            DispatchAssignment(
                report_id=report_id,
                volunteer_id=volunteer_id,
                arrival_seconds=round(route.duration_seconds),
                distance_meters=route.distance_meters,
                route_tier=route.candidate.route_tier,
            )
        )
        candidate_rank_sum += route.rank
        duration_sum += route.duration_seconds
        secondary_count += int(
            route.candidate.route_tier == CandidateRouteTier.secondary
        )

    assigned_reports = {
        assignment.report_id for assignment in assignments
    }
    return _Solution(
        assignments=tuple(assignments),
        unassigned_report_ids=tuple(
            job.report_id
            for job in jobs
            if job.report_id not in assigned_reports
        ),
        urgency_sum=sum(
            (
                urgency_by_report[assignment.report_id]
                for assignment in assignments
            ),
            Decimal(0),
        ),
        secondary_count=secondary_count,
        candidate_rank_sum=candidate_rank_sum,
        duration_sum=duration_sum,
    )


def _expanded_is_better(primary: _Solution, expanded: _Solution) -> bool:
    if expanded.secondary_count == 0:
        return False
    if expanded.quality != primary.quality:
        return expanded.quality > primary.quality
    return expanded.stable_signature < primary.stable_signature


def optimize_dispatch_fallback(
    request: DispatchOptimizationRequest,
) -> DispatchOptimizationResult:
    """Resuelve el lote sin I/O cuando VROOM no responde.

    El request ya contiene la unica matriz OSRM autorizada. Este servicio no
    consulta matching, Supabase ni proveedores externos y nunca inventa ETA.
    """
    primary = _solve_pass(request, DispatchOptimizationPass.primary)
    expanded = _solve_pass(request, DispatchOptimizationPass.expanded)
    selected = (
        expanded if _expanded_is_better(primary, expanded) else primary
    )
    optimization_pass = (
        DispatchOptimizationPass.expanded
        if selected is expanded
        else DispatchOptimizationPass.primary
    )
    return DispatchOptimizationResult(
        assignments=list(selected.assignments),
        unassigned_report_ids=list(selected.unassigned_report_ids),
        source="local_fallback",
        calculated_at=datetime.now(timezone.utc),
        optimization_pass=optimization_pass,
        used_secondary=selected.secondary_count > 0,
    )
