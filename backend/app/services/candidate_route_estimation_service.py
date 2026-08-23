"""Anade estimaciones viales a candidatos sin alterar su ranking."""

import logging
from datetime import datetime, timezone

from app.models.dispatch import RoutingErrorCode, RoutingStatus
from app.services.dispatch_route_matrix_service import (
    calculate_dispatch_route_matrix,
)


logger = logging.getLogger(__name__)


def _estimate(
    *,
    status: RoutingStatus,
    calculated_at: datetime,
    duration_seconds: float | None = None,
    distance_meters: float | None = None,
    error_code: RoutingErrorCode | None = None,
) -> dict:
    return {
        "status": status.value,
        "duration_seconds": duration_seconds,
        "distance_meters": distance_meters,
        "error_code": error_code.value if error_code else None,
        "calculated_at": calculated_at.isoformat(),
        "source": "osrm",
    }


def enrich_candidates_with_route_estimates(
    reporte_id: str,
    candidatos: list[dict],
) -> list[dict]:
    """Devuelve copias enriquecidas y nunca bloquea el matching por OSRM."""
    enriched = [dict(candidate) for candidate in candidatos]
    if not enriched:
        return enriched

    volunteer_ids = [
        str(candidate["voluntario_id"])
        for candidate in enriched
        if candidate.get("voluntario_id")
    ]
    if not volunteer_ids:
        calculated_at = datetime.now(timezone.utc)
        unavailable = _estimate(
            status=RoutingStatus.unavailable,
            error_code=RoutingErrorCode.missing_coordinates,
            calculated_at=calculated_at,
        )
        return [
            {**candidate, "ruta_estimada": dict(unavailable)}
            for candidate in enriched
        ]

    try:
        matrix = calculate_dispatch_route_matrix(volunteer_ids, [reporte_id])
    except Exception:
        logger.warning(
            "No se pudo construir la matriz OSRM del reporte %s",
            reporte_id,
            exc_info=True,
        )
        calculated_at = datetime.now(timezone.utc)
        unavailable = _estimate(
            status=RoutingStatus.unavailable,
            error_code=RoutingErrorCode.provider_error,
            calculated_at=calculated_at,
        )
        return [
            {**candidate, "ruta_estimada": dict(unavailable)}
            for candidate in enriched
        ]

    if matrix.status == RoutingStatus.unavailable:
        unavailable = _estimate(
            status=RoutingStatus.unavailable,
            error_code=matrix.error_code,
            calculated_at=matrix.calculated_at,
        )
        return [
            {**candidate, "ruta_estimada": dict(unavailable)}
            for candidate in enriched
        ]

    if reporte_id not in matrix.destination_ids:
        logger.warning(
            "La matriz OSRM no incluyo el reporte solicitado %s",
            reporte_id,
        )
        unavailable = _estimate(
            status=RoutingStatus.unavailable,
            error_code=RoutingErrorCode.invalid_response,
            calculated_at=matrix.calculated_at,
        )
        return [
            {**candidate, "ruta_estimada": dict(unavailable)}
            for candidate in enriched
        ]

    origin_indexes = {
        volunteer_id: index
        for index, volunteer_id in enumerate(matrix.origin_ids)
    }
    destination_index = matrix.destination_ids.index(reporte_id)
    result = []
    for candidate in enriched:
        origin_index = origin_indexes.get(str(candidate.get("voluntario_id")))
        if origin_index is None:
            estimate = _estimate(
                status=RoutingStatus.unavailable,
                error_code=RoutingErrorCode.missing_coordinates,
                calculated_at=matrix.calculated_at,
            )
        else:
            duration = matrix.durations_seconds[origin_index][destination_index]
            distance = matrix.distances_meters[origin_index][destination_index]
            if duration is None or distance is None:
                estimate = _estimate(
                    status=RoutingStatus.unavailable,
                    error_code=RoutingErrorCode.no_route,
                    calculated_at=matrix.calculated_at,
                )
            else:
                estimate = _estimate(
                    status=RoutingStatus.complete,
                    duration_seconds=duration,
                    distance_meters=distance,
                    calculated_at=matrix.calculated_at,
                )
        result.append({**candidate, "ruta_estimada": estimate})
    return result
