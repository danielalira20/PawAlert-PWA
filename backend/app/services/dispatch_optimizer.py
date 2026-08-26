"""Optimiza lotes de despacho ya preparados mediante VROOM."""

import logging
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
from app.services.dispatch_fallback_service import optimize_dispatch_fallback
from app.services.vroom_service import (
    VroomJob,
    VroomOptimizationRequest,
    VroomOptimizationResult,
    VroomProfileMatrix,
    VroomVehicle,
    get_optimization,
)

logger = logging.getLogger(__name__)

# Cualquier cruce de la matriz cuadrada que no corresponda a una pareja
# autorizada para el pass en curso (o que sea voluntario<->voluntario,
# reporte<->reporte, o reporte->voluntario) recibe este costo en vez de 0 o
# inf/NaN -- docs/contrato-adaptador-vroom.md, seccion "Matriz e indices de
# VROOM". Se calcula por lote: el mayor entre un piso absoluto (24h, muy por
# encima de cualquier ETA real de despacho) y un multiplo grande del mayor
# valor real presente en la matriz rectangular del lote, para que domine
# incluso lotes con ETAs manual_only inusualmente altos. `skills` ya es la
# barrera estructural que impide que VROOM elija estas parejas; el costo alto
# es una segunda barrera, no la unica.
_FORBIDDEN_PAIR_COST_FLOOR_SECONDS = 86_400
_FORBIDDEN_PAIR_COST_MULTIPLIER = 1_000

# VROOM (rapidjson) exige que cada celda de matrices.car sea IsUint(): un
# entero no negativo exacto -- ver input_parser.cpp:get_matrix en el repo de
# VROOM-Project/vroom. Un valor con parte fraccionaria (cualquier duracion o
# distancia real de OSRM, que casi nunca cae en un segundo/metro exacto) hace
# que VROOM responda 400 {"code":2,"error":"Invalid matrix entry."} -- HTTP
# 200 nunca llega a devolverse, asi que get_optimization ni siquiera entra a
# _parse_payload. round() se aplica en el punto exacto donde cada celda se
# escribe (ver _build_vroom_request y _forbidden_pair_cost), nunca antes: los
# valores reales (arrival_seconds, distance_meters en DispatchAssignment)
# deben seguir viniendo de travel_matrix sin redondear.

# El score decide "con todo su peso" entre candidatos primary del mismo
# reporte (docs/contrato-ranking-despacho.md), pero el mismo contrato prohibe
# convertirlo en un descuento continuo de minutos. Para lograr ambas cosas,
# el score domina LEXICOGRAFICAMENTE sobre la duracion real en el costo que
# ve VROOM: no se resta score de la duracion, se escala para que ninguna
# diferencia de duracion realista (acotada por secondary_max_eta_minutes,
# tipicamente <=1800s) pueda compensar una diferencia de score. Esto solo
# afecta el campo `costs` (la funcion objetivo de VROOM); `durations` y
# `distances` viajan sin modificar porque arrival_seconds/distance_meters
# deben reflejar el ETA/distancia real, no el costo ajustado por score.
_SCORE_COST_SCALE_SECONDS = 100_000

_VROOM_VEHICLE_CAPACITY = [1]
_VROOM_JOB_DELIVERY = [1]


def _forbidden_pair_cost(durations_seconds: list[list[float | None]]) -> int:
    real_values = [
        value
        for row in durations_seconds
        for value in row
        if value is not None
    ]
    largest_real_value = max(real_values, default=0.0)
    return round(
        max(
            float(_FORBIDDEN_PAIR_COST_FLOOR_SECONDS),
            largest_real_value * _FORBIDDEN_PAIR_COST_MULTIPLIER,
        )
    )


def _distance_lookup(
    request: DispatchOptimizationRequest,
) -> dict[tuple[str, str], float]:
    """(volunteer_id, report_id) -> distancia real de travel_matrix. Solo se
    construye para parejas en `candidates`; DispatchOptimizationRequest ya
    garantiza que esas celdas no son None."""
    origin_index = {
        volunteer_id: index
        for index, volunteer_id in enumerate(request.travel_matrix.origin_ids)
    }
    destination_index = {
        report_id: index
        for index, report_id in enumerate(request.travel_matrix.destination_ids)
    }
    lookup = {}
    for candidate in request.candidates:
        row = origin_index[candidate.volunteer_id]
        column = destination_index[candidate.report_id]
        lookup[(candidate.volunteer_id, candidate.report_id)] = (
            request.travel_matrix.distances_meters[row][column]
        )
    return lookup


def _duration_lookup(
    request: DispatchOptimizationRequest,
) -> dict[tuple[str, str], float]:
    """(volunteer_id, report_id) -> duracion real de travel_matrix. Mismo
    patron que _distance_lookup; usado por _rank_lookup para ordenar
    candidatos por (score, duracion, id)."""
    origin_index = {
        volunteer_id: index
        for index, volunteer_id in enumerate(request.travel_matrix.origin_ids)
    }
    destination_index = {
        report_id: index
        for index, report_id in enumerate(request.travel_matrix.destination_ids)
    }
    lookup = {}
    for candidate in request.candidates:
        row = origin_index[candidate.volunteer_id]
        column = destination_index[candidate.report_id]
        lookup[(candidate.volunteer_id, candidate.report_id)] = (
            request.travel_matrix.durations_seconds[row][column]
        )
    return lookup


def _rank_lookup(
    request: DispatchOptimizationRequest,
    allowed_tiers: frozenset[CandidateRouteTier],
    duration_by_pair: dict[tuple[str, str], float],
) -> dict[tuple[str, str], int]:
    """Espejo de dispatch_fallback_service._eligible_routes
    (dispatch_fallback_service.py:201-221): rank 0-based POR REPORTE, entre
    los candidatos automatic_eligible cuyo route_tier esta en allowed_tiers
    para este pass, ordenados por (-matching_score, duration_seconds,
    volunteer_id). El pool de candidatos -- y por lo tanto el rank de un
    mismo (volunteer_id, report_id) -- cambia entre pass primary y pass
    expanded (expanded suma los candidatos secondary al pool), asi que este
    lookup se recalcula por pass y nunca se reutiliza entre pasadas."""
    candidates_by_report: dict[str, list[DispatchCandidate]] = {}
    for candidate in request.candidates:
        if (
            not candidate.automatic_eligible
            or candidate.route_tier not in allowed_tiers
        ):
            continue
        candidates_by_report.setdefault(candidate.report_id, []).append(candidate)

    rank_by_pair: dict[tuple[str, str], int] = {}
    for report_id, candidates in candidates_by_report.items():
        ordered = sorted(
            candidates,
            key=lambda candidate: (
                -candidate.matching_score,
                duration_by_pair[(candidate.volunteer_id, candidate.report_id)],
                candidate.volunteer_id,
            ),
        )
        for rank, candidate in enumerate(ordered):
            rank_by_pair[(candidate.volunteer_id, report_id)] = rank
    return rank_by_pair


def _build_vroom_request(
    request: DispatchOptimizationRequest,
    allowed_tiers: frozenset[CandidateRouteTier],
    volunteer_ids: list[str],
    report_ids: list[str],
    forbidden_cost: int,
) -> tuple[VroomOptimizationRequest, dict[int, str], dict[int, str]]:
    """Construye la matriz cuadrada (V+R)x(V+R) -- voluntarios 0..V-1,
    reportes V..V+R-1 -- y los skills que autorizan cada pareja para este
    pass. Siempre incluye TODOS los voluntarios/reportes del request (no solo
    los que tienen candidatos autorizados): si un pass no autoriza ninguna
    pareja para un reporte, ese reporte simplemente no tendra ningun
    voluntario con el skill requerido y VROOM lo reportara sin asignar --
    no hace falta un caso especial aqui."""
    volunteer_index = {vid: i for i, vid in enumerate(volunteer_ids)}
    report_index = {
        rid: len(volunteer_ids) + i for i, rid in enumerate(report_ids)
    }
    origin_index = {
        vid: i for i, vid in enumerate(request.travel_matrix.origin_ids)
    }
    destination_index = {
        rid: i for i, rid in enumerate(request.travel_matrix.destination_ids)
    }

    size = len(volunteer_ids) + len(report_ids)
    durations = [[forbidden_cost] * size for _ in range(size)]
    distances = [[forbidden_cost] * size for _ in range(size)]
    costs = [[forbidden_cost] * size for _ in range(size)]
    for index in range(size):
        durations[index][index] = 0
        distances[index][index] = 0
        costs[index][index] = 0

    skill_id_by_report = {rid: index + 1 for index, rid in enumerate(report_ids)}
    skills_by_volunteer: dict[str, set[int]] = {vid: set() for vid in volunteer_ids}

    for candidate in request.candidates:
        if (
            not candidate.automatic_eligible
            or candidate.route_tier not in allowed_tiers
        ):
            continue
        volunteer_id = candidate.volunteer_id
        report_id = candidate.report_id
        row = volunteer_index[volunteer_id]
        column = report_index[report_id]
        matrix_row = origin_index[volunteer_id]
        matrix_column = destination_index[report_id]
        duration = request.travel_matrix.durations_seconds[matrix_row][matrix_column]
        distance = request.travel_matrix.distances_meters[matrix_row][matrix_column]
        # VROOM exige enteros exactos (ver comentario junto a
        # _FORBIDDEN_PAIR_COST_MULTIPLIER) -- duration/distance de OSRM casi
        # nunca lo son, asi que se redondean solo aqui, al construir la
        # matriz que viaja a VROOM. arrival_seconds/distance_meters en
        # DispatchAssignment siguen viniendo de travel_matrix sin redondear.
        durations[row][column] = round(duration)
        distances[row][column] = round(distance)
        costs[row][column] = round(
            (100 - candidate.matching_score) * _SCORE_COST_SCALE_SECONDS
            + duration
        )
        skills_by_volunteer[volunteer_id].add(skill_id_by_report[report_id])

    vehicles = [
        VroomVehicle(
            id=index + 1,
            start_index=volunteer_index[volunteer_id],
            capacity=list(_VROOM_VEHICLE_CAPACITY),
            skills=sorted(skills_by_volunteer[volunteer_id]),
        )
        for index, volunteer_id in enumerate(volunteer_ids)
    ]
    job_by_report = {job.report_id: job for job in request.jobs}
    jobs = [
        VroomJob(
            id=index + 1,
            location_index=report_index[report_id],
            priority=int(round(job_by_report[report_id].urgency.score)),
            delivery=list(_VROOM_JOB_DELIVERY),
            skills=[skill_id_by_report[report_id]],
        )
        for index, report_id in enumerate(report_ids)
    ]

    vroom_request = VroomOptimizationRequest(
        vehicles=vehicles,
        jobs=jobs,
        matrices={
            "car": VroomProfileMatrix(
                durations=durations, distances=distances, costs=costs
            )
        },
    )
    vehicle_id_to_volunteer = {
        index + 1: volunteer_id for index, volunteer_id in enumerate(volunteer_ids)
    }
    job_id_to_report = {
        index + 1: report_id for index, report_id in enumerate(report_ids)
    }
    return vroom_request, vehicle_id_to_volunteer, job_id_to_report


def _translate_and_validate(
    vroom_result: VroomOptimizationResult,
    vehicle_id_to_volunteer: dict[int, str],
    job_id_to_report: dict[int, str],
    job_id_to_location_index: dict[int, int],
    candidates_by_pair: dict[tuple[str, str], DispatchCandidate],
    distance_by_pair: dict[tuple[str, str], float],
    allowed_tiers: frozenset[CandidateRouteTier],
) -> list[DispatchAssignment] | None:
    """Traduce la respuesta de VROOM validando cada regla del contrato
    (docs/contrato-adaptador-vroom.md). Devuelve None ante CUALQUIER
    inconsistencia -- el caller lo trata como si VROOM hubiera fallado, sin
    generar ninguna asignacion parcial de esa respuesta."""
    assignments: list[DispatchAssignment] = []
    seen_reports: set[str] = set()
    seen_volunteers: set[str] = set()

    for route in vroom_result.routes:
        volunteer_id = vehicle_id_to_volunteer.get(route.vehicle_id)
        if volunteer_id is None:
            return None
        for step in route.steps:
            if step.type != "job":
                continue
            report_id = job_id_to_report.get(step.job_id)
            if report_id is None:
                return None
            expected_location = job_id_to_location_index.get(step.job_id)
            if step.location_index != expected_location:
                return None
            candidate = candidates_by_pair.get((volunteer_id, report_id))
            if (
                candidate is None
                or not candidate.automatic_eligible
                or candidate.route_tier not in allowed_tiers
            ):
                return None
            if report_id in seen_reports or volunteer_id in seen_volunteers:
                return None
            distance = distance_by_pair.get((volunteer_id, report_id))
            if distance is None:
                return None
            seen_reports.add(report_id)
            seen_volunteers.add(volunteer_id)
            assignments.append(
                DispatchAssignment(
                    report_id=report_id,
                    volunteer_id=volunteer_id,
                    arrival_seconds=step.arrival,
                    distance_meters=distance,
                    route_tier=candidate.route_tier,
                )
            )
    return assignments


def _solve_pass(
    request: DispatchOptimizationRequest,
    allowed_tiers: frozenset[CandidateRouteTier],
    candidates_by_pair: dict[tuple[str, str], DispatchCandidate],
    distance_by_pair: dict[tuple[str, str], float],
    volunteer_ids: list[str],
    report_ids: list[str],
    forbidden_cost: int,
    pass_label: str,
) -> list[DispatchAssignment] | None:
    """None = VROOM no disponible o su respuesta no paso la validacion --
    fallo total para este pass. Lista (posiblemente vacia) = VROOM respondio
    de forma valida."""
    vroom_request, vehicle_id_to_volunteer, job_id_to_report = _build_vroom_request(
        request, allowed_tiers, volunteer_ids, report_ids, forbidden_cost
    )
    vroom_result = get_optimization(vroom_request)
    if vroom_result.status != "complete":
        logger.warning(
            "VROOM no completo la pasada %s (error_code=%s)",
            pass_label,
            vroom_result.error_code,
        )
        return None
    job_id_to_location_index = {
        job.id: job.location_index for job in vroom_request.jobs
    }
    return _translate_and_validate(
        vroom_result,
        vehicle_id_to_volunteer,
        job_id_to_report,
        job_id_to_location_index,
        candidates_by_pair,
        distance_by_pair,
        allowed_tiers,
    )


def _unassigned_report_ids(
    report_ids: list[str], assignments: list[DispatchAssignment]
) -> list[str]:
    assigned = {assignment.report_id for assignment in assignments}
    return [report_id for report_id in report_ids if report_id not in assigned]


def _quality(
    assignments: list[DispatchAssignment],
    urgency_by_report: dict[str, Decimal],
    rank_by_pair: dict[tuple[str, str], int],
) -> tuple[Decimal, int, int, int, Decimal]:
    """Espejo exacto de dispatch_fallback_service._Solution.quality
    (dispatch_fallback_service.py:47-55), incluido `candidate_rank_sum`
    (calculo del rank: lineas 201-221; agregacion por asignacion: linea
    312). `rank_by_pair` debe venir de _rank_lookup calculado para el MISMO
    pass que produjo `assignments` -- el rank no es transferible entre
    pasadas."""
    urgency_sum = sum(
        (urgency_by_report[assignment.report_id] for assignment in assignments),
        Decimal(0),
    )
    secondary_count = sum(
        1
        for assignment in assignments
        if assignment.route_tier == CandidateRouteTier.secondary
    )
    candidate_rank_sum = sum(
        rank_by_pair[(assignment.volunteer_id, assignment.report_id)]
        for assignment in assignments
    )
    duration_sum = sum(
        (Decimal(assignment.arrival_seconds) for assignment in assignments),
        Decimal(0),
    )
    return (
        urgency_sum,
        len(assignments),
        -secondary_count,
        -candidate_rank_sum,
        -duration_sum,
    )


def _stable_signature(
    assignments: list[DispatchAssignment],
) -> tuple[tuple[str, str], ...]:
    return tuple(
        sorted(
            (assignment.report_id, assignment.volunteer_id)
            for assignment in assignments
        )
    )


def _expanded_is_better(
    request: DispatchOptimizationRequest,
    primary_assignments: list[DispatchAssignment],
    expanded_assignments: list[DispatchAssignment],
    urgency_by_report: dict[str, Decimal],
    duration_by_pair: dict[tuple[str, str], float],
) -> bool:
    """docs/contrato-adaptador-vroom.md, seccion "Dos soluciones sobre el
    lote completo", mas el criterio candidate_rank_sum que agrega
    dispatch_fallback_service._Solution.quality (dispatch_fallback_service.py
    :47-55) entre "menos secondary" y "menor costo vial total": B solo
    reemplaza a A si mejora prioridad cubierta, cobertura, cantidad de
    secondary, ranking promedio de candidatos elegidos o costo vial total,
    en ese orden; un empate total se resuelve por identificadores estables.

    El rank se recalcula por pass (_rank_lookup) porque el pool de
    candidatos elegibles de primary y expanded es distinto -- nunca se
    reutiliza el ranking de una pasada para evaluar la otra."""
    if not any(
        assignment.route_tier == CandidateRouteTier.secondary
        for assignment in expanded_assignments
    ):
        return False
    primary_rank_by_pair = _rank_lookup(
        request, frozenset({CandidateRouteTier.primary}), duration_by_pair
    )
    expanded_rank_by_pair = _rank_lookup(
        request,
        frozenset({CandidateRouteTier.primary, CandidateRouteTier.secondary}),
        duration_by_pair,
    )
    primary_quality = _quality(
        primary_assignments, urgency_by_report, primary_rank_by_pair
    )
    expanded_quality = _quality(
        expanded_assignments, urgency_by_report, expanded_rank_by_pair
    )
    if expanded_quality != primary_quality:
        return expanded_quality > primary_quality
    return _stable_signature(expanded_assignments) < _stable_signature(
        primary_assignments
    )


def _finalize_vroom(
    assignments: list[DispatchAssignment],
    unassigned_report_ids: list[str],
    optimization_pass: DispatchOptimizationPass,
    calculated_at: datetime,
) -> DispatchOptimizationResult:
    return DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="vroom",
        calculated_at=calculated_at,
        optimization_pass=optimization_pass,
        used_secondary=any(
            assignment.route_tier == CandidateRouteTier.secondary
            for assignment in assignments
        ),
    )


def optimize_dispatch(
    request: DispatchOptimizationRequest,
) -> DispatchOptimizationResult:
    """Optimiza un lote ya preparado con VROOM (dos pasadas, primary y
    expanded) y cae a dispatch_fallback_service.optimize_dispatch_fallback
    cuando VROOM no responde en cualquiera de los intentos hechos, o cuando
    su respuesta no pasa la validacion de _translate_and_validate.

    Funcion pura sobre `request`: no consulta matching, Supabase,
    coverage_service ni OSRM (docs/contrato-adaptador-vroom.md).
    """
    calculated_at = datetime.now(timezone.utc)
    volunteer_ids = list(request.travel_matrix.origin_ids)
    report_ids = list(request.travel_matrix.destination_ids)
    candidates_by_pair = {
        (candidate.volunteer_id, candidate.report_id): candidate
        for candidate in request.candidates
    }
    distance_by_pair = _distance_lookup(request)
    duration_by_pair = _duration_lookup(request)
    urgency_by_report = {
        job.report_id: Decimal(str(job.urgency.score)) for job in request.jobs
    }
    forbidden_cost = _forbidden_pair_cost(request.travel_matrix.durations_seconds)

    primary_assignments = _solve_pass(
        request,
        frozenset({CandidateRouteTier.primary}),
        candidates_by_pair,
        distance_by_pair,
        volunteer_ids,
        report_ids,
        forbidden_cost,
        "primary",
    )
    if primary_assignments is None:
        logger.warning(
            "VROOM no disponible o respuesta invalida en la pasada primary; "
            "usando fallback local"
        )
        return optimize_dispatch_fallback(request)

    primary_unassigned = _unassigned_report_ids(report_ids, primary_assignments)
    if not primary_unassigned:
        return _finalize_vroom(
            primary_assignments,
            primary_unassigned,
            DispatchOptimizationPass.primary,
            calculated_at,
        )

    expanded_assignments = _solve_pass(
        request,
        frozenset({CandidateRouteTier.primary, CandidateRouteTier.secondary}),
        candidates_by_pair,
        distance_by_pair,
        volunteer_ids,
        report_ids,
        forbidden_cost,
        "expanded",
    )
    if expanded_assignments is None:
        logger.warning(
            "VROOM no disponible o respuesta invalida en la pasada expanded; "
            "usando fallback local"
        )
        return optimize_dispatch_fallback(request)

    if _expanded_is_better(
        request,
        primary_assignments,
        expanded_assignments,
        urgency_by_report,
        duration_by_pair,
    ):
        return _finalize_vroom(
            expanded_assignments,
            _unassigned_report_ids(report_ids, expanded_assignments),
            DispatchOptimizationPass.expanded,
            calculated_at,
        )
    return _finalize_vroom(
        primary_assignments,
        primary_unassigned,
        DispatchOptimizationPass.primary,
        calculated_at,
    )
