"""Prepara el contrato validado que consumira el adaptador de VROOM."""

import logging
from datetime import datetime, timezone

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.dispatch import (
    CandidateRouteTier,
    DispatchCandidate,
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
) -> DispatchPreparationResult:
    return DispatchPreparationResult(
        status=DispatchPreparationStatus.unavailable,
        error_code=code,
        prepared_at=prepared_at,
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
    return RoutingPoint(
        id=report["id"],
        latitude=float(latitude),
        longitude=float(longitude),
    )


def _load_reports(report_ids: list[str]) -> list[dict]:
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
    by_id = {
        row["id"]: row
        for row in (result.data or [])
        if row.get("id")
    }
    if any(report_id not in by_id for report_id in report_ids):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.report_not_operational
        )
    return [by_id[report_id] for report_id in report_ids]


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
    if not pairs:
        raise _PreparationFailure(DispatchPreparationErrorCode.no_candidates)
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
    capacities = {
        row["voluntario_id"]: row
        for row in (result.data or [])
        if row.get("voluntario_id")
    }
    if any(
        volunteer_id not in capacities
        or capacities[volunteer_id].get("latitud") is None
        or capacities[volunteer_id].get("longitud") is None
        for volunteer_id in volunteer_ids
    ):
        raise _PreparationFailure(
            DispatchPreparationErrorCode.missing_coordinates
        )
    return capacities


def _build_volunteers(
    pairs: list[dict],
    capacities: dict[str, dict],
) -> list[DispatchVolunteer]:
    by_volunteer: dict[str, list[dict]] = {}
    for pair in pairs:
        volunteer_id = str(pair.get("voluntario_id") or "")
        if not volunteer_id:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            )
        by_volunteer.setdefault(volunteer_id, []).append(pair)

    volunteers = []
    for volunteer_id, volunteer_pairs in by_volunteer.items():
        first = volunteer_pairs[0]
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
        capacity = capacities[volunteer_id]
        offered_report_ids = _unique_ids(
            [
                pair["report_id"]
                for pair in volunteer_pairs
                if pair.get("offered")
            ]
        )
        try:
            volunteers.append(
                DispatchVolunteer(
                    volunteer_id=volunteer_id,
                    location=RoutingPoint(
                        id=volunteer_id,
                        latitude=float(capacity["latitud"]),
                        longitude=float(capacity["longitud"]),
                    ),
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
                    skills=_volunteer_skills(capacity),
                    role=role,
                    offered_report_ids=offered_report_ids,
                )
            )
        except (KeyError, TypeError, ValueError):
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            ) from None
    return volunteers


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

    try:
        reports = _load_reports(normalized_report_ids)
        for report in reports:
            _validate_report(report)
        jobs = [
            DispatchJob(
                report_id=report["id"],
                location=_report_location(report),
                urgency=DispatchUrgency(
                    score=float(report["urgency_score"]),
                    level=report["urgency_nivel"],
                    calculated_at=report["urgency_calculado_at"],
                ),
                required_skills=_job_skills(report),
            )
            for report in reports
        ]
        pairs = _load_candidate_pairs(normalized_report_ids)
        volunteer_ids = _unique_ids(
            [str(pair.get("voluntario_id") or "") for pair in pairs]
        )
        if not volunteer_ids:
            raise _PreparationFailure(
                DispatchPreparationErrorCode.invalid_candidate_data
            )
        capacities = _load_capacities(volunteer_ids)
        volunteers = _build_volunteers(pairs, capacities)
        matrix = calculate_dispatch_route_matrix(
            [volunteer.volunteer_id for volunteer in volunteers],
            normalized_report_ids,
        )
        if matrix.status != RoutingStatus.complete or any(
            value is None
            for values in (matrix.durations_seconds, matrix.distances_meters)
            for row in values
            for value in row
        ):
            raise _PreparationFailure(
                DispatchPreparationErrorCode.routing_unavailable
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
        )
    except _PreparationFailure as error:
        return _unavailable(error.code, prepared_at)
    except Exception:
        logger.exception("No se pudo preparar el despacho para VROOM")
        return _unavailable(
            DispatchPreparationErrorCode.data_source_error,
            prepared_at,
        )
