"""Cliente tolerante a fallos para la matriz de tiempos de OSRM."""

import math
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.models.dispatch import (
    RouteGeometryPoint,
    RouteMatrixRequest,
    RouteMatrixResult,
    RouteRequest,
    RouteResult,
    RouteStep,
    RoutingErrorCode,
    RoutingMode,
    RoutingStatus,
)


_MAX_ATTEMPTS = 2
_PROFILE = "driving"


class _InvalidPayload(Exception):
    pass


class _NoRoute(Exception):
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


def _request_route(request: RouteRequest) -> httpx.Response:
    base_url = _route_base_url(request.mode).rstrip("/")
    coordinates = (
        f"{request.origin.longitude},{request.origin.latitude};"
        f"{request.destination.longitude},{request.destination.latitude}"
    )
    return httpx.get(
        f"{base_url}/route/v1/{request.mode.value}/{coordinates}",
        params={
            "alternatives": "false",
            "steps": "true" if request.include_steps else "false",
            "geometries": "geojson",
            "overview": "full",
        },
        timeout=settings.osrm_timeout_seconds,
    )


def _route_base_url(mode: RoutingMode) -> str:
    configured = {
        RoutingMode.driving: settings.osrm_driving_base_url,
        RoutingMode.cycling: settings.osrm_cycling_base_url,
        RoutingMode.walking: settings.osrm_walking_base_url,
    }[mode].strip()
    if mode == RoutingMode.driving and not configured:
        return settings.osrm_base_url.strip()
    return configured


def configured_route_modes() -> list[RoutingMode]:
    """Publica solo perfiles con una URL configurada en esta instancia."""
    return [mode for mode in RoutingMode if _route_base_url(mode)]


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
            normalized_value = float(value)
            if not math.isfinite(normalized_value):
                raise _InvalidPayload
            normalized_row.append(normalized_value)
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


def _unavailable_route(
    request: RouteRequest,
    error_code: RoutingErrorCode,
    calculated_at: datetime,
) -> RouteResult:
    return RouteResult(
        origin_id=request.origin.id,
        destination_id=request.destination.id,
        status=RoutingStatus.unavailable,
        error_code=error_code,
        calculated_at=calculated_at,
    )


def _parse_route_payload(
    payload: object,
    request: RouteRequest,
    calculated_at: datetime,
) -> RouteResult:
    if not isinstance(payload, dict):
        raise _InvalidPayload
    if payload.get("code") == "NoRoute":
        raise _NoRoute
    if payload.get("code") != "Ok":
        raise _InvalidPayload

    try:
        route = payload["routes"][0]
        coordinates = route["geometry"]["coordinates"]
        if not isinstance(coordinates, list):
            raise _InvalidPayload
        geometry = [
            RouteGeometryPoint(
                longitude=float(coordinate[0]),
                latitude=float(coordinate[1]),
            )
            for coordinate in coordinates
            if isinstance(coordinate, list) and len(coordinate) >= 2
        ]
        if len(geometry) != len(coordinates):
            raise _InvalidPayload
        return RouteResult(
            origin_id=request.origin.id,
            destination_id=request.destination.id,
            duration_seconds=float(route["duration"]),
            distance_meters=float(route["distance"]),
            geometry=geometry,
            steps=(
                _normalize_route_steps(route)
                if request.include_steps
                else []
            ),
            status=RoutingStatus.complete,
            calculated_at=calculated_at,
        )
    except (IndexError, KeyError, TypeError, ValueError):
        raise _InvalidPayload from None


def _normalize_route_steps(route: object) -> list[RouteStep]:
    """Normaliza maniobras útiles e ignora pasos opcionales malformados."""
    if not isinstance(route, dict):
        return []
    legs = route.get("legs")
    if not isinstance(legs, list):
        return []

    normalized: list[RouteStep] = []
    for leg in legs:
        if not isinstance(leg, dict) or not isinstance(leg.get("steps"), list):
            continue
        for step in leg["steps"]:
            if not isinstance(step, dict):
                continue
            maneuver = step.get("maneuver")
            if not isinstance(maneuver, dict):
                continue
            location = maneuver.get("location")
            if not isinstance(location, list) or len(location) < 2:
                continue

            raw_type = maneuver.get("type")
            raw_modifier = maneuver.get("modifier")
            raw_name = step.get("name")
            try:
                distance = float(step["distance"])
                duration = float(step["duration"])
                longitude = float(location[0])
                latitude = float(location[1])
                normalized.append(
                    RouteStep(
                        type=(
                            raw_type.strip()
                            if isinstance(raw_type, str) and raw_type.strip()
                            else "continue"
                        ),
                        modifier=(
                            raw_modifier.strip()
                            if isinstance(raw_modifier, str)
                            and raw_modifier.strip()
                            else None
                        ),
                        street_name=(
                            raw_name.strip()
                            if isinstance(raw_name, str) and raw_name.strip()
                            else None
                        ),
                        distance_meters=distance,
                        duration_seconds=duration,
                        location=(longitude, latitude),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
    return normalized


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


def get_route(request: RouteRequest) -> RouteResult:
    """Obtiene la ruta exacta tras confirmar cobertura, sin propagar fallos."""
    calculated_at = datetime.now(timezone.utc)
    if not _route_base_url(request.mode):
        return _unavailable_route(
            request, RoutingErrorCode.not_configured, calculated_at
        )

    last_error = RoutingErrorCode.provider_error
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_route(request)
        except httpx.TimeoutException:
            last_error = RoutingErrorCode.timeout
            continue
        except httpx.HTTPError:
            last_error = RoutingErrorCode.provider_error
            continue

        if response.status_code == 200:
            try:
                return _parse_route_payload(response.json(), request, calculated_at)
            except _NoRoute:
                return _unavailable_route(
                    request, RoutingErrorCode.no_route, calculated_at
                )
            except (ValueError, _InvalidPayload):
                return _unavailable_route(
                    request, RoutingErrorCode.invalid_response, calculated_at
                )

        last_error = RoutingErrorCode.provider_error

    return _unavailable_route(request, last_error, calculated_at)
