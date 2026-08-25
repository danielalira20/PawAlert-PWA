"""Optimizador batch de despacho con VROOM (Fase 2).

Agrupa varios reportes elegibles en una sola corrida de VROOM, en vez de
asignar reporte por reporte: eso permite que el mismo voluntario nunca
reciba dos casos nuevos en la misma corrida (capacity=[1] por vehiculo,
delivery=[1] por job -- ver decision de diseno en el prompt de Fase 2), algo
que el flujo secuencial anterior no podia garantizar cuando un voluntario
calificaba para varios reportes a la vez.

Ante cualquier fallo (matriz no disponible, VROOM no disponible, excepcion
inesperada) cae a un fallback local reporte-por-reporte equivalente al
comportamiento previo de escalamiento.py, con la salvedad de que tambien
evita repetir voluntario dentro del mismo lote.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from app.db.supabase import supabase_admin
from app.models.dispatch import (
    CandidateRouteTier,
    DispatchAssignment,
    DispatchCandidate,
    DispatchOptimizationPass,
    DispatchOptimizationRequest,
    DispatchOptimizationResult,
    RoutingStatus,
)
from app.services import matching
from app.services.dispatch_fallback_service import optimize_dispatch_fallback
from app.services.dispatch_route_matrix_service import (
    calculate_dispatch_route_matrix,
)
from app.services.vroom_service import (
    VroomJob,
    VroomOptimizationRequest,
    VroomOptimizationResult,
    VroomProfileMatrix,
    VroomVehicle,
    get_optimization,
)

logger = logging.getLogger(__name__)

_TOP_N_CANDIDATOS = 5

VoluntarioInfo = dict[str, dict]


def optimizar_lote_reportes(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo]:
    """Optimiza la asignacion de un lote de reportes con VROOM.

    Devuelve el resultado del despacho junto con un mapa
    ``{voluntario_id: {"usuario_id": ..., "nombre": ...}}`` recolectado
    mientras se armaba el pool de candidatos -- el caller (escalamiento.py)
    lo necesita para completar los datos que pide
    ``coverage_service.reservar_cobertura`` por cada asignacion, sin repetir
    ninguna consulta.
    """
    try:
        resultado = _optimizar_con_vroom(reporte_ids)
    except Exception:
        logger.exception(
            "Fallo inesperado optimizando el lote con VROOM; usando fallback local"
        )
        resultado = None

    if resultado is not None:
        return resultado

    return _fallback_local(reporte_ids)


def _optimizar_con_vroom(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo] | None:
    reporte_ids = list(dict.fromkeys(reporte_ids))
    candidatos_por_reporte: dict[str, list[dict]] = {}
    voluntarios_info: VoluntarioInfo = {}

    for reporte_id in reporte_ids:
        candidatos = matching.obtener_candidatos(reporte_id)["candidatos"]
        candidatos = candidatos[:_TOP_N_CANDIDATOS]
        candidatos_por_reporte[reporte_id] = candidatos
        for candidato in candidatos:
            voluntarios_info[candidato["voluntario_id"]] = {
                "usuario_id": candidato["usuario_id"],
                "nombre": candidato["nombre"],
            }

    voluntario_ids = list(dict.fromkeys(
        candidato["voluntario_id"]
        for candidatos in candidatos_por_reporte.values()
        for candidato in candidatos
    ))
    voluntario_ids_validos = _filtrar_con_coordenadas(voluntario_ids)

    matrix_result = calculate_dispatch_route_matrix(
        voluntario_ids_validos, reporte_ids
    )
    if matrix_result.status != RoutingStatus.complete:
        return None

    request = _construir_request_vroom(
        reporte_ids,
        candidatos_por_reporte,
        voluntario_ids_validos,
        matrix_result.durations_seconds,
    )
    vroom_result = get_optimization(request)
    if vroom_result.status != "complete":
        return None

    resultado = _traducir_resultado_vroom(
        vroom_result, matrix_result, reporte_ids, voluntario_ids_validos
    )
    return resultado, voluntarios_info


def _filtrar_con_coordenadas(voluntario_ids: list[str]) -> list[str]:
    """Descarta (con log) voluntarios sin coordenadas validas en
    `capacidades` -- calculate_dispatch_route_matrix es todo-o-nada ante
    datos faltantes, asi que hay que filtrar antes de llamarla."""
    if not voluntario_ids:
        return []

    resultado = (
        supabase_admin.table("capacidades")
        .select("voluntario_id, latitud, longitud")
        .in_("voluntario_id", voluntario_ids)
        .execute()
    )
    con_coordenadas = {
        fila["voluntario_id"]
        for fila in (resultado.data or [])
        if fila.get("latitud") is not None and fila.get("longitud") is not None
    }

    descartados = [vid for vid in voluntario_ids if vid not in con_coordenadas]
    if descartados:
        logger.warning(
            "Excluyendo del lote de despacho a voluntarios sin coordenadas "
            "validas en capacidades: %s",
            descartados,
        )

    return [vid for vid in voluntario_ids if vid in con_coordenadas]


def _cargar_urgency_scores(reporte_ids: list[str]) -> dict[str, float | None]:
    resultado = (
        supabase_admin.table("reportes")
        .select("id, urgency_score")
        .in_("id", reporte_ids)
        .execute()
    )
    return {
        fila["id"]: fila.get("urgency_score")
        for fila in (resultado.data or [])
    }


def _construir_request_vroom(
    reporte_ids: list[str],
    candidatos_por_reporte: dict[str, list[dict]],
    voluntario_ids_validos: list[str],
    matrix: list[list[float | None]],
) -> VroomOptimizationRequest:
    job_index_by_reporte = {rid: i for i, rid in enumerate(reporte_ids)}
    skill_id_by_reporte = {rid: i + 1 for i, rid in enumerate(reporte_ids)}
    vehicle_index_by_voluntario = {
        vid: i for i, vid in enumerate(voluntario_ids_validos)
    }

    skills_by_voluntario: dict[str, set[int]] = {
        vid: set() for vid in voluntario_ids_validos
    }
    for reporte_id, candidatos in candidatos_por_reporte.items():
        skill_id = skill_id_by_reporte[reporte_id]
        for candidato in candidatos:
            vid = candidato["voluntario_id"]
            if vid in skills_by_voluntario:
                skills_by_voluntario[vid].add(skill_id)

    urgencias = _cargar_urgency_scores(reporte_ids)

    vehicles = [
        VroomVehicle(
            id=vehicle_index_by_voluntario[vid] + 1,
            start_index=vehicle_index_by_voluntario[vid],
            capacity=[1],
            skills=sorted(skills_by_voluntario[vid]),
        )
        for vid in voluntario_ids_validos
    ]
    jobs = [
        VroomJob(
            id=job_index_by_reporte[rid] + 1,
            location_index=job_index_by_reporte[rid],
            priority=int(urgencias.get(rid) or 0),
            delivery=[1],
            skills=[skill_id_by_reporte[rid]],
        )
        for rid in reporte_ids
    ]
    return VroomOptimizationRequest(vehicles=vehicles, jobs=jobs, matrix=matrix)


def _traducir_resultado_vroom(
    vroom_result,
    matrix_result,
    reporte_ids: list[str],
    voluntario_ids_validos: list[str],
) -> DispatchOptimizationResult:
    job_id_a_reporte = {i + 1: rid for i, rid in enumerate(reporte_ids)}
    vehicle_id_a_voluntario = {
        i + 1: vid for i, vid in enumerate(voluntario_ids_validos)
    }
    indice_por_voluntario = {
        vid: i for i, vid in enumerate(voluntario_ids_validos)
    }
    indice_por_reporte = {rid: i for i, rid in enumerate(reporte_ids)}

    assignments = []
    for route in vroom_result.routes:
        voluntario_id = vehicle_id_a_voluntario.get(route.vehicle_id)
        if voluntario_id is None:
            continue
        origen = indice_por_voluntario[voluntario_id]
        for step in route.steps:
            if step.type != "job" or step.job_id is None:
                continue
            reporte_id = job_id_a_reporte.get(step.job_id)
            if reporte_id is None:
                continue
            destino = indice_por_reporte[reporte_id]
            distancia = matrix_result.distances_meters[origen][destino]
            assignments.append(
                DispatchAssignment(
                    report_id=reporte_id,
                    volunteer_id=voluntario_id,
                    arrival_seconds=step.arrival,
                    distance_meters=distancia or 0.0,
                )
            )

    unassigned_report_ids = [
        job_id_a_reporte[job_id]
        for job_id in vroom_result.unassigned_job_ids
        if job_id in job_id_a_reporte
    ]

    return DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="vroom",
        calculated_at=datetime.now(timezone.utc),
    )


def _fallback_local(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo]:
    """Ranking simple reporte por reporte (candidatos[0]), sin agrupar ni
    optimizar rutas. A diferencia del loop original de escalamiento.py, si
    procesa varios reportes en la misma corrida evita repetir voluntario
    entre ellos -- aqui no hay reserva inmediata entre reportes que lo evite
    por si sola como en el flujo secuencial anterior."""
    voluntarios_info: VoluntarioInfo = {}
    assignments: list[DispatchAssignment] = []
    unassigned_report_ids: list[str] = []
    usados: set[str] = set()

    for reporte_id in reporte_ids:
        try:
            candidatos = matching.obtener_candidatos(reporte_id)["candidatos"]
        except Exception:
            logger.exception(
                "Fallback local: no se pudo evaluar candidatos para el "
                "reporte %s",
                reporte_id,
            )
            unassigned_report_ids.append(reporte_id)
            continue

        for candidato in candidatos:
            voluntarios_info[candidato["voluntario_id"]] = {
                "usuario_id": candidato["usuario_id"],
                "nombre": candidato["nombre"],
            }

        elegido = next(
            (c for c in candidatos if c["voluntario_id"] not in usados), None
        )
        if elegido is None:
            unassigned_report_ids.append(reporte_id)
            continue

        usados.add(elegido["voluntario_id"])
        assignments.append(
            DispatchAssignment(
                report_id=reporte_id,
                volunteer_id=elegido["voluntario_id"],
                arrival_seconds=0,
                distance_meters=0.0,
            )
        )

    resultado = DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="local_fallback",
        calculated_at=datetime.now(timezone.utc),
    )
    return resultado, voluntarios_info


# ---------------------------------------------------------------------------
# Fase 3: optimize_dispatch(request) -- funcion pura sobre un
# DispatchOptimizationRequest ya preparado. No consulta matching, Supabase,
# coverage_service ni OSRM (docs/contrato-adaptador-vroom.md, seccion
# "Responsabilidades" de `dispatch_optimizer`). Coexiste con
# optimizar_lote_reportes() de arriba -- esa sigue siendo la que llama
# escalamiento.py hasta que Daniela la reescriba en Fase 5.
# ---------------------------------------------------------------------------

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


def _forbidden_pair_cost(durations_seconds: list[list[float | None]]) -> float:
    real_values = [
        value
        for row in durations_seconds
        for value in row
        if value is not None
    ]
    largest_real_value = max(real_values, default=0.0)
    return max(
        float(_FORBIDDEN_PAIR_COST_FLOOR_SECONDS),
        largest_real_value * _FORBIDDEN_PAIR_COST_MULTIPLIER,
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


def _build_vroom_request(
    request: DispatchOptimizationRequest,
    allowed_tiers: frozenset[CandidateRouteTier],
    volunteer_ids: list[str],
    report_ids: list[str],
    forbidden_cost: float,
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
        durations[index][index] = 0.0
        distances[index][index] = 0.0
        costs[index][index] = 0.0

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
        durations[row][column] = duration
        distances[row][column] = distance
        costs[row][column] = (
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
    candidates_by_pair: dict[tuple[str, str], DispatchCandidate],
    distance_by_pair: dict[tuple[str, str], float],
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
            candidate = candidates_by_pair.get((volunteer_id, report_id))
            if candidate is None or not candidate.automatic_eligible:
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
    forbidden_cost: float,
) -> list[DispatchAssignment] | None:
    """None = VROOM no disponible o su respuesta no paso la validacion --
    fallo total para este pass. Lista (posiblemente vacia) = VROOM respondio
    de forma valida."""
    vroom_request, vehicle_id_to_volunteer, job_id_to_report = _build_vroom_request(
        request, allowed_tiers, volunteer_ids, report_ids, forbidden_cost
    )
    vroom_result = get_optimization(vroom_request)
    if vroom_result.status != "complete":
        return None
    return _translate_and_validate(
        vroom_result,
        vehicle_id_to_volunteer,
        job_id_to_report,
        candidates_by_pair,
        distance_by_pair,
    )


def _unassigned_report_ids(
    report_ids: list[str], assignments: list[DispatchAssignment]
) -> list[str]:
    assigned = {assignment.report_id for assignment in assignments}
    return [report_id for report_id in report_ids if report_id not in assigned]


def _quality(
    assignments: list[DispatchAssignment],
    urgency_by_report: dict[str, Decimal],
) -> tuple[Decimal, int, int, Decimal]:
    """Espejo de dispatch_fallback_service._Solution.quality, sin el criterio
    adicional `candidate_rank_sum` que ese modulo agrega -- ese criterio no
    esta en el texto de docs/contrato-adaptador-vroom.md (ver aviso en el
    resumen de la implementacion)."""
    urgency_sum = sum(
        (urgency_by_report[assignment.report_id] for assignment in assignments),
        Decimal(0),
    )
    secondary_count = sum(
        1
        for assignment in assignments
        if assignment.route_tier == CandidateRouteTier.secondary
    )
    duration_sum = sum(
        (Decimal(assignment.arrival_seconds) for assignment in assignments),
        Decimal(0),
    )
    return (urgency_sum, len(assignments), -secondary_count, -duration_sum)


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
    primary_assignments: list[DispatchAssignment],
    expanded_assignments: list[DispatchAssignment],
    urgency_by_report: dict[str, Decimal],
) -> bool:
    """docs/contrato-adaptador-vroom.md, seccion "Dos soluciones sobre el
    lote completo": B solo reemplaza a A si mejora prioridad cubierta,
    cobertura, cantidad de secondary o costo vial total, en ese orden; un
    empate total se resuelve por identificadores estables."""
    if not any(
        assignment.route_tier == CandidateRouteTier.secondary
        for assignment in expanded_assignments
    ):
        return False
    primary_quality = _quality(primary_assignments, urgency_by_report)
    expanded_quality = _quality(expanded_assignments, urgency_by_report)
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
    )
    if expanded_assignments is None:
        logger.warning(
            "VROOM no disponible o respuesta invalida en la pasada expanded; "
            "usando fallback local"
        )
        return optimize_dispatch_fallback(request)

    if _expanded_is_better(
        primary_assignments, expanded_assignments, urgency_by_report
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
