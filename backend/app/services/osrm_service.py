"""Cliente tolerante a fallos para la matriz de tiempos de OSRM."""

from datetime import datetime, timezone

import httpx

from app.config import settings
from app.models.dispatch import (
    RouteMatrixRequest,
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingStatus,
)


_MAX_ATTEMPTS = 2
_PROFILE = "driving"


class _InvalidPayload(Exception):
    pass


def _unavailable(
    request: RouteMatrixRequest,
    error_code: RoutingErrorCode,
    calculated_at: datetime,
) -> RouteMatrixResult:
    return RouteMatrixResult(
        origin_ids=[point.id for point in request.origins],
        destination_ids=[point.id for point in request.destinations],
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        error_code=error_code,
        calculated_at=calculated_at,
    )


def _coordinate_string(request: RouteMatrixRequest) -> str:
    points = [*request.origins, *request.destinations]
    return ";".join(
        f"{point.longitude},{point.latitude}" for point in points
    )


def _matrix_indexes(request: RouteMatrixRequest) -> tuple[str, str]:
    origin_indexes = ";".join(str(index) for index in range(len(request.origins)))
    offset = len(request.origins)
    destination_indexes = ";".join(
        str(offset + index) for index in range(len(request.destinations))
    )
    return origin_indexes, destination_indexes


def _request_matrix(request: RouteMatrixRequest) -> httpx.Response:
    sources, destinations = _matrix_indexes(request)
    base_url = settings.osrm_base_url.rstrip("/")
    url = (
        f"{base_url}/table/v1/{_PROFILE}/"
        f"{_coordinate_string(request)}"
    )
    return httpx.get(
        url,
        params={
            "sources": sources,
            "destinations": destinations,
            "annotations": "duration,distance",
            "skip_waypoints": "true",
        },
        timeout=settings.osrm_timeout_seconds,
    )


def _normalize_matrix(payload: object) -> list[list[float | None]]:
    if not isinstance(payload, list):
        raise _InvalidPayload

    normalized: list[list[float | None]] = []
    for row in payload:
        if not isinstance(row, list):
            raise _InvalidPayload
        normalized_row = []
        for value in row:
            if value is None:
                normalized_row.append(None)
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise _InvalidPayload
            normalized_row.append(float(value))
        normalized.append(normalized_row)
    return normalized


def _parse_payload(
    payload: object,
    request: RouteMatrixRequest,
    calculated_at: datetime,
) -> RouteMatrixResult:
    if not isinstance(payload, dict) or payload.get("code") != "Ok":
        raise _InvalidPayload

    try:
        durations = _normalize_matrix(payload["durations"])
        distances = _normalize_matrix(payload["distances"])
        return RouteMatrixResult(
            origin_ids=[point.id for point in request.origins],
            destination_ids=[point.id for point in request.destinations],
            durations_seconds=durations,
            distances_meters=distances,
            status=RoutingStatus.complete,
            calculated_at=calculated_at,
        )
    except (KeyError, ValueError):
        raise _InvalidPayload from None


def get_route_matrix(request: RouteMatrixRequest) -> RouteMatrixResult:
    """Obtiene duraciones y distancias; nunca propaga fallos del proveedor."""
    calculated_at = datetime.now(timezone.utc)
    total_coordinates = len(request.origins) + len(request.destinations)
    if total_coordinates > settings.osrm_max_coordinates:
        return _unavailable(
            request, RoutingErrorCode.request_too_large, calculated_at
        )
    if not settings.osrm_base_url.strip():
        return _unavailable(
            request, RoutingErrorCode.not_configured, calculated_at
        )

    last_error = RoutingErrorCode.provider_error
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_matrix(request)
        except httpx.TimeoutException:
            last_error = RoutingErrorCode.timeout
            continue
        except httpx.HTTPError:
            last_error = RoutingErrorCode.provider_error
            continue

        if response.status_code == 200:
            try:
                return _parse_payload(response.json(), request, calculated_at)
            except (ValueError, _InvalidPayload):
                return _unavailable(
                    request, RoutingErrorCode.invalid_response, calculated_at
                )

        last_error = RoutingErrorCode.provider_error

    return _unavailable(request, last_error, calculated_at)
