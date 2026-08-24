"""Prepara el contrato validado que consumira el adaptador de VROOM."""

import logging
from datetime import datetime, timezone

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.dispatch import (
    CandidateRouteTier,
    DispatchCandidate,
    DispatchExcludedItem,
    DispatchExclusionReason,
    DispatchExclusionScope,
    DispatchJob,
    DispatchOptimizationRequest,
    DispatchPreparationErrorCode,
    DispatchPreparationResult,
    DispatchPreparationStatus,
    DispatchRoutingPolicy,
    DispatchUrgency,
    DispatchVolunteer,
    RouteMatrixResult,
    RoutingPoint,
    RoutingStatus,
)
from app.services import coverage_service, matching
from app.services.dispatch_route_matrix_service import (
    calculate_dispatch_route_matrix,
)


logger = logging.getLogger(__name__)


class _PreparationFailure(Exception):
    def __init__(self, code: DispatchPreparationErrorCode):
        self.code = code
        super().__init__(code.value)


def _unique_ids(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _unavailable(
    code: DispatchPreparationErrorCode,
    prepared_at: datetime,
    excluded_items: list[DispatchExcludedItem] | None = None,
) -> DispatchPreparationResult:
    return DispatchPreparationResult(
        status=DispatchPreparationStatus.unavailable,
        error_code=code,
        prepared_at=prepared_at,
        excluded_items=excluded_items or [],
    )


def _catalog_key(value: object) -> str | None:
    if isinstance(value, dict):
        key = value.get("clave")
        return str(key) if key else None
    return str(value) if value else None


def _job_skills(report: dict) -> list[str]:
    skills = set()
    animals = report.get("animal") or []
    if isinstance(animals, dict):
        animals = [animals]
    for animal in animals:
        species = _catalog_key(
            animal.get("tipo_animal_catalogo") or animal.get("tipo_animal")
        )
        size = _catalog_key(
            animal.get("tamanio_catalogo") or animal.get("tamanio")
        )
        if species:
            skills.add(f"especie:{species}")
        if size:
            skills.add(f"tamanio:{size}")
    return sorted(skills)


def _volunteer_skills(capacity: dict) -> list[str]:
    species = {
        f"especie:{value}"
        for value in capacity.get("especies_manejo") or []
        if value
    }
    sizes = {
        f"tamanio:{value}"
        for value in capacity.get("tamanios_manejo") or []
        if value
    }
    return sorted(species | sizes)


def _report_location(report: dict) -> RoutingPoint:
    latest_latitude = report.get("ultima_latitud_confirmada")
    latest_longitude = report.get("ultima_longitud_confirmada")
    if latest_latitude is not None and latest_longitude is not None:
        latitude = latest_latitude
        longitude = latest_longitude
    else:
        latitude = report.get("latitud")
        longitude = report.get("longitud")
    if latitude is None or longitude is None:
        raise _PreparationFailure(
            DispatchPreparationErrorCode.missing_coordinates
        )
    try:
        return RoutingPoint(
            id=report["id"],
            latitude=float(latitude),
            longitude=float(longitude),
        )
    except (KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.missing_coordinates
        ) from None


def _load_reports(report_ids: list[str]) -> dict[str, dict]:
    result = (
        supabase_admin.table("reportes")
        .select(
            "id, asociacion_asignada_id, staff_asignado_id, "
            "estado_validacion_reporte, estado_reporte, estado_cobertura, "
            "latitud, longitud, ultima_latitud_confirmada, "
            "ultima_longitud_confirmada, urgency_score, urgency_nivel, "
            "urgency_calculado_at, urgency_excluido, "
            "animal(tipo_animal_catalogo(clave), tamanio_catalogo(clave))"
        )
        .in_("id", report_ids)
        .execute()
    )
    return {
        row["id"]: row
        for row in (result.data or [])
        if row.get("id")
    }


def _validate_report(report: dict) -> None:
    if (
        report.get("estado_validacion_reporte") != "aprobado"
        or report.get("estado_reporte") != "asignado"
        or report.get("estado_cobertura") != "abierto"
        or not report.get("asociacion_asignada_id")
        or report.get("staff_asignado_id") is not None
    ):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.report_not_operational
        )
    if (
        report.get("urgency_excluido")
        or report.get("urgency_score") is None
        or report.get("urgency_nivel") not in ("verde", "amarillo", "rojo")
        or report.get("urgency_calculado_at") is None
    ):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.urgency_unavailable
        )
    try:
        urgency_score = float(report["urgency_score"])
    except (TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.urgency_unavailable
        ) from None
    if not 0 <= urgency_score <= 100:
        raise _PreparationFailure(
            DispatchPreparationErrorCode.urgency_unavailable
        )


def _build_job(report: dict) -> DispatchJob:
    _validate_report(report)
    try:
        urgency = DispatchUrgency(
            score=float(report["urgency_score"]),
            level=report["urgency_nivel"],
            calculated_at=report["urgency_calculado_at"],
        )
    except (KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.urgency_unavailable
        ) from None
    return DispatchJob(
        report_id=report["id"],
        location=_report_location(report),
        urgency=urgency,
        required_skills=_job_skills(report),
    )


def _exclude_report(
    report_id: str,
    code: DispatchPreparationErrorCode,
) -> DispatchExcludedItem:
    reasons = {
        DispatchPreparationErrorCode.report_not_operational: (
            DispatchExclusionReason.report_not_operational
        ),
        DispatchPreparationErrorCode.urgency_unavailable: (
            DispatchExclusionReason.urgency_unavailable
        ),
        DispatchPreparationErrorCode.missing_coordinates: (
            DispatchExclusionReason.missing_coordinates
        ),
    }
    reason = reasons.get(code)
    if reason is None:
        raise _PreparationFailure(code)
    return DispatchExcludedItem(
        scope=DispatchExclusionScope.report,
        reason=reason,
        report_id=report_id,
    )


def _prepare_jobs(
    report_ids: list[str],
    reports_by_id: dict[str, dict],
) -> tuple[list[DispatchJob], list[DispatchExcludedItem]]:
    jobs = []
    excluded_items = []
    for report_id in report_ids:
        report = reports_by_id.get(report_id)
        if report is None:
            excluded_items.append(
                _exclude_report(
                    report_id,
                    DispatchPreparationErrorCode.report_not_operational,
                )
            )
            continue
        try:
            jobs.append(_build_job(report))
        except _PreparationFailure as error:
            excluded_items.append(_exclude_report(report_id, error.code))
    return jobs, excluded_items


def _error_for_excluded_report(
    excluded_item: DispatchExcludedItem,
) -> DispatchPreparationErrorCode:
    return DispatchPreparationErrorCode(excluded_item.reason.value)


def _load_candidate_pairs(report_ids: list[str]) -> list[dict]:
    pairs = []
    for report_id in report_ids:
        internal = matching.obtener_candidatos(
            report_id,
            incluir_rutas=False,
        )["candidatos"]
        external = coverage_service.obtener_ofrecimientos_reporte(
            report_id,
            incluir_rutas=False,
        )
        for candidate in internal:
            pairs.append(
                {
                    **candidate,
                    "report_id": report_id,
                    "role": "voluntario_interno",
                    "offered": False,
                }
            )
        for candidate in external:
            pairs.append(
                {
                    **candidate,
                    "report_id": report_id,
                    "role": "voluntario_externo",
                    "offered": True,
                }
            )
    return pairs


def _load_capacities(volunteer_ids: list[str]) -> dict[str, dict]:
    result = (
        supabase_admin.table("capacidades")
        .select(
            "voluntario_id, latitud, longitud, especies_manejo, "
            "tamanios_manejo"
        )
        .in_("voluntario_id", volunteer_ids)
        .execute()
    )
    return {
        row["voluntario_id"]: row
        for row in (result.data or [])
        if row.get("voluntario_id")
    }


def _volunteer_location(
    volunteer_id: str,
    capacity: dict | None,
) -> RoutingPoint:
    if (
        capacity is None
        or capacity.get("latitud") is None
        or capacity.get("longitud") is None
    ):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.missing_coordinates
        )
    try:
        return RoutingPoint(
            id=volunteer_id,
            latitude=float(capacity["latitud"]),
            longitude=float(capacity["longitud"]),
        )
    except (KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.missing_coordinates
        ) from None


def _build_volunteer(
    volunteer_id: str,
    volunteer_pairs: list[dict],
    capacity: dict | None,
) -> DispatchVolunteer:
    location = _volunteer_location(volunteer_id, capacity)
    roles = {pair.get("role") for pair in volunteer_pairs}
    if len(roles) != 1:
        raise _PreparationFailure(
            DispatchPreparationErrorCode.invalid_candidate_data
        )
    role = roles.pop()
    if role not in ("voluntario_interno", "voluntario_externo"):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.invalid_candidate_data
        )
    offered_report_ids = _unique_ids(
        [
            pair["report_id"]
            for pair in volunteer_pairs
            if pair.get("offered")
        ]
    )
    try:
        return DispatchVolunteer(
            volunteer_id=volunteer_id,
            location=location,
            matching_score=max(
                float(pair["score"]["total"])
                for pair in volunteer_pairs
            ),
            capacity=min(
                int(pair.get("max_casos_simultaneos") or 0)
                for pair in volunteer_pairs
            ),
            current_load=max(
                int(pair.get("carga_actual") or 0)
                for pair in volunteer_pairs
            ),
            skills=_volunteer_skills(capacity or {}),
            role=role,
            offered_report_ids=offered_report_ids,
        )
    except (KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.invalid_candidate_data
        ) from None


def _exclude_volunteer(
    volunteer_id: str,
    code: DispatchPreparationErrorCode,
) -> DispatchExcludedItem:
    reasons = {
        DispatchPreparationErrorCode.missing_coordinates: (
            DispatchExclusionReason.missing_coordinates
        ),
        DispatchPreparationErrorCode.invalid_candidate_data: (
            DispatchExclusionReason.invalid_candidate_data
        ),
    }
    reason = reasons.get(code)
    if reason is None:
        raise _PreparationFailure(code)
    return DispatchExcludedItem(
        scope=DispatchExclusionScope.volunteer,
        reason=reason,
        volunteer_id=volunteer_id,
    )


def _prepare_volunteers(
    pairs: list[dict],
    capacities: dict[str, dict],
) -> tuple[
    list[DispatchVolunteer],
    list[dict],
    list[DispatchExcludedItem],
]:
    by_volunteer: dict[str, list[dict]] = {}
    for pair in pairs:
        volunteer_id = str(pair.get("voluntario_id") or "")
        if not volunteer_id:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            )
        by_volunteer.setdefault(volunteer_id, []).append(pair)

    volunteers = []
    excluded_items = []
    for volunteer_id, volunteer_pairs in by_volunteer.items():
        try:
            volunteers.append(
                _build_volunteer(
                    volunteer_id,
                    volunteer_pairs,
                    capacities.get(volunteer_id),
                )
            )
        except _PreparationFailure as error:
            excluded_items.append(_exclude_volunteer(volunteer_id, error.code))

    valid_volunteer_ids = {
        volunteer.volunteer_id for volunteer in volunteers
    }
    valid_pairs = [
        pair
        for pair in pairs
        if str(pair.get("voluntario_id") or "") in valid_volunteer_ids
    ]
    return volunteers, valid_pairs, excluded_items


def _exclude_jobs_without_candidates(
    jobs: list[DispatchJob],
    pairs: list[dict],
) -> tuple[list[DispatchJob], list[dict], list[DispatchExcludedItem]]:
    candidate_report_ids = {
        str(pair.get("report_id") or "")
        for pair in pairs
        if pair.get("voluntario_id")
    }
    retained_jobs = [
        job for job in jobs if job.report_id in candidate_report_ids
    ]
    retained_report_ids = {job.report_id for job in retained_jobs}
    retained_pairs = [
        pair for pair in pairs if pair.get("report_id") in retained_report_ids
    ]
    excluded_items = [
        DispatchExcludedItem(
            scope=DispatchExclusionScope.report,
            reason=DispatchExclusionReason.no_candidates,
            report_id=job.report_id,
        )
        for job in jobs
        if job.report_id not in candidate_report_ids
    ]
    return retained_jobs, retained_pairs, excluded_items


def _exclude_unroutable_candidate_pairs(
    pairs: list[dict],
    matrix: RouteMatrixResult,
) -> tuple[list[dict], list[DispatchExcludedItem]]:
    origin_index = {
        volunteer_id: index
        for index, volunteer_id in enumerate(matrix.origin_ids)
    }
    destination_index = {
        report_id: index
        for index, report_id in enumerate(matrix.destination_ids)
    }
    retained_pairs = []
    excluded_items = []
    try:
        for pair in pairs:
            report_id = str(pair["report_id"])
            volunteer_id = str(pair["voluntario_id"])
            row_index = origin_index[volunteer_id]
            column_index = destination_index[report_id]
            duration = matrix.durations_seconds[row_index][column_index]
            distance = matrix.distances_meters[row_index][column_index]
            if duration is None or distance is None:
                excluded_items.append(
                    DispatchExcludedItem(
                        scope=DispatchExclusionScope.candidate_pair,
                        reason=DispatchExclusionReason.no_route,
                        report_id=report_id,
                        volunteer_id=volunteer_id,
                    )
                )
                continue
            retained_pairs.append(pair)
    except (IndexError, KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.routing_unavailable
        ) from None
    return retained_pairs, excluded_items


def _compact_route_matrix(
    matrix: RouteMatrixResult,
    volunteer_ids: list[str],
    report_ids: list[str],
) -> RouteMatrixResult:
    origin_index = {
        volunteer_id: index
        for index, volunteer_id in enumerate(matrix.origin_ids)
    }
    destination_index = {
        report_id: index
        for index, report_id in enumerate(matrix.destination_ids)
    }
    try:
        origin_indexes = [origin_index[item] for item in volunteer_ids]
        destination_indexes = [destination_index[item] for item in report_ids]
        return RouteMatrixResult(
            origin_ids=volunteer_ids,
            destination_ids=report_ids,
            durations_seconds=[
                [
                    matrix.durations_seconds[row_index][column_index]
                    for column_index in destination_indexes
                ]
                for row_index in origin_indexes
            ],
            distances_meters=[
                [
                    matrix.distances_meters[row_index][column_index]
                    for column_index in destination_indexes
                ]
                for row_index in origin_indexes
            ],
            status=matrix.status,
            calculated_at=matrix.calculated_at,
            source=matrix.source,
            error_code=matrix.error_code,
        )
    except (IndexError, KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.routing_unavailable
        ) from None


def _route_tier(
    duration_seconds: float,
    minimum_duration_seconds: float,
    policy: DispatchRoutingPolicy,
) -> CandidateRouteTier:
    if duration_seconds > policy.secondary_max_eta_minutes * 60:
        return CandidateRouteTier.manual_only
    if duration_seconds <= (
        minimum_duration_seconds + policy.candidate_window_minutes * 60
    ):
        return CandidateRouteTier.primary
    return CandidateRouteTier.secondary


def _build_candidate_contracts(
    pairs: list[dict],
    volunteers: list[DispatchVolunteer],
    matrix: RouteMatrixResult,
    policy: DispatchRoutingPolicy,
) -> list[DispatchCandidate]:
    try:
        origin_index = {
            volunteer_id: index
            for index, volunteer_id in enumerate(matrix.origin_ids)
        }
        destination_index = {
            report_id: index
            for index, report_id in enumerate(matrix.destination_ids)
        }
        roles = {
            volunteer.volunteer_id: volunteer.role
            for volunteer in volunteers
        }
        durations_by_report: dict[str, dict[str, float]] = {}
        for pair in pairs:
            report_id = pair["report_id"]
            volunteer_id = pair["voluntario_id"]
            duration = matrix.durations_seconds[origin_index[volunteer_id]][
                destination_index[report_id]
            ]
            if duration is None:
                raise _PreparationFailure(
                    DispatchPreparationErrorCode.routing_unavailable
                )
            durations_by_report.setdefault(report_id, {})[volunteer_id] = duration

        minimum_by_report = {
            report_id: min(durations.values())
            for report_id, durations in durations_by_report.items()
        }
        candidates = []
        for pair in pairs:
            report_id = pair["report_id"]
            volunteer_id = pair["voluntario_id"]
            tier = _route_tier(
                durations_by_report[report_id][volunteer_id],
                minimum_by_report[report_id],
                policy,
            )
            candidates.append(
                DispatchCandidate(
                    report_id=report_id,
                    volunteer_id=volunteer_id,
                    matching_score=float(pair["score"]["total"]),
                    offered=bool(pair.get("offered")),
                    route_tier=tier,
                    automatic_eligible=(
                        roles[volunteer_id] == "voluntario_interno"
                        and tier != CandidateRouteTier.manual_only
                    ),
                )
            )
        return candidates
    except (KeyError, TypeError, ValueError):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.invalid_candidate_data
        ) from None


def prepare_dispatch_optimization(
    report_ids: list[str],
) -> DispatchPreparationResult:
    """Prepara multiples trabajos sin invocar todavia a VROOM."""
    prepared_at = datetime.now(timezone.utc)
    normalized_report_ids = _unique_ids(report_ids)
    if not normalized_report_ids:
        return _unavailable(
            DispatchPreparationErrorCode.report_not_operational,
            prepared_at,
        )

    excluded_items: list[DispatchExcludedItem] = []
    try:
        reports_by_id = _load_reports(normalized_report_ids)
        jobs, excluded_items = _prepare_jobs(
            normalized_report_ids,
            reports_by_id,
        )
        if not jobs:
            return _unavailable(
                _error_for_excluded_report(excluded_items[0]),
                prepared_at,
                excluded_items,
            )
        operational_report_ids = [job.report_id for job in jobs]
        pairs = _load_candidate_pairs(operational_report_ids)
        jobs, pairs, reports_without_candidates = (
            _exclude_jobs_without_candidates(jobs, pairs)
        )
        excluded_items.extend(reports_without_candidates)
        if not jobs:
            return _unavailable(
                DispatchPreparationErrorCode.no_candidates,
                prepared_at,
                excluded_items,
            )
        volunteer_ids = _unique_ids(
            [str(pair.get("voluntario_id") or "") for pair in pairs]
        )
        if not volunteer_ids:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            )
        capacities = _load_capacities(volunteer_ids)
        volunteers, pairs, excluded_volunteers = _prepare_volunteers(
            pairs,
            capacities,
        )
        excluded_items.extend(excluded_volunteers)
        if not volunteers:
            error_code = (
                DispatchPreparationErrorCode(
                    excluded_volunteers[0].reason.value
                )
                if excluded_volunteers
                else DispatchPreparationErrorCode.invalid_candidate_data
            )
            return _unavailable(error_code, prepared_at, excluded_items)
        jobs, pairs, reports_without_valid_candidates = (
            _exclude_jobs_without_candidates(jobs, pairs)
        )
        excluded_items.extend(reports_without_valid_candidates)
        if not jobs:
            return _unavailable(
                DispatchPreparationErrorCode.no_candidates,
                prepared_at,
                excluded_items,
            )
        operational_report_ids = [job.report_id for job in jobs]
        matrix = calculate_dispatch_route_matrix(
            [volunteer.volunteer_id for volunteer in volunteers],
            operational_report_ids,
        )
        if matrix.status != RoutingStatus.complete:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.routing_unavailable
            )
        pairs, pairs_without_routes = _exclude_unroutable_candidate_pairs(
            pairs,
            matrix,
        )
        excluded_items.extend(pairs_without_routes)
        if not pairs:
            return _unavailable(
                DispatchPreparationErrorCode.no_viable_routes,
                prepared_at,
                excluded_items,
            )
        jobs, pairs, reports_without_routes = _exclude_jobs_without_candidates(
            jobs,
            pairs,
        )
        excluded_items.extend(reports_without_routes)
        if not jobs:
            return _unavailable(
                DispatchPreparationErrorCode.no_viable_routes,
                prepared_at,
                excluded_items,
            )
        volunteers, pairs, unexpected_exclusions = _prepare_volunteers(
            pairs,
            capacities,
        )
        if unexpected_exclusions:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            )
        operational_report_ids = [job.report_id for job in jobs]
        matrix = _compact_route_matrix(
            matrix,
            [volunteer.volunteer_id for volunteer in volunteers],
            operational_report_ids,
        )
        routing_policy = DispatchRoutingPolicy(
            candidate_window_minutes=settings.vroom_candidate_window_minutes,
            secondary_max_eta_minutes=(
                settings.vroom_secondary_max_eta_minutes
            ),
        )
        candidates = _build_candidate_contracts(
            pairs,
            volunteers,
            matrix,
            routing_policy,
        )
        request = DispatchOptimizationRequest(
            jobs=jobs,
            volunteers=volunteers,
            candidates=candidates,
            travel_matrix=matrix,
            routing_policy=routing_policy,
        )
        return DispatchPreparationResult(
            status=DispatchPreparationStatus.ready,
            request=request,
            prepared_at=prepared_at,
            excluded_items=excluded_items,
        )
    except _PreparationFailure as error:
        return _unavailable(error.code, prepared_at, excluded_items)
    except Exception:
        logger.exception("No se pudo preparar el despacho para VROOM")
        return _unavailable(
            DispatchPreparationErrorCode.data_source_error,
            prepared_at,
            excluded_items,
        )
