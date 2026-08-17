import math
from datetime import datetime, timezone

import httpx

from app.models.urgency import (
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    RoadRiskResult,
    RoadType,
)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_REQUEST_TIMEOUT_SECONDS = 8.0
_MAX_ATTEMPTS = 2  # 1 intento + 1 reintento

_OVERPASS_QUERY_TEMPLATE = (
    "[out:json][timeout:8];\n"
    "(\n"
    '  way["highway"~"^(primary|trunk|motorway)(_link)?$"]'
    "(around:50,{lat},{lon});\n"
    ");\n"
    "out geom;"
)

# Identificación ante Overpass, requerida por su política de uso. No
# resuelve por sí sola el 406 intermitente de sus instancias espejo (eso
# ya lo cubre el reintento de _fetch_from_provider) -- es higiene aparte.
_REQUEST_HEADERS = {
    "Accept": "*/*",
    "User-Agent": "PawAlert-PWA/1.0 (contacto@pawalert.example)",
}

# Coordenadas redondeadas a 4 decimales (~11m de precisión, acorde al radio
# operativo de 50m) -> resultado de la última consulta a esa zona.
#
# A diferencia de weather_service.py (que expira caché por TTL), aquí NO
# hay expiración por tiempo: una vialidad primaria/troncal/autopista no
# aparece ni desaparece con el paso de horas o días de la forma en que
# cambia el clima. Una vez resuelta una coordenada, se sirve desde caché
# indefinidamente mientras el proceso esté vivo -- no existe un concepto
# de "caché vencida" para esta señal.
_cache: dict[tuple[float, float], RoadRiskResult] = {}

_ROAD_TYPE_NORMALIZATION: dict[str, RoadType] = {
    "primary": "primary",
    "primary_link": "primary",
    "trunk": "trunk",
    "trunk_link": "trunk",
    "motorway": "motorway",
    "motorway_link": "motorway",
}
_PRIORITY: dict[RoadType, int] = {"motorway": 3, "trunk": 2, "primary": 1}

_EARTH_RADIUS_M = 6371000.0


class _InvalidPayload(Exception):
    pass


def _project_meters(lat: float, lon: float, ref_lat: float) -> tuple[float, float]:
    """Proyección equirectangular local centrada en ref_lat -- suficiente
    para distancias de hasta unos pocos kilómetros (aquí, <=50m); evita
    depender de una librería geodésica solo para esto."""
    x = math.radians(lon) * math.cos(math.radians(ref_lat)) * _EARTH_RADIUS_M
    y = math.radians(lat) * _EARTH_RADIUS_M
    return x, y


def _point_to_segment_distance_m(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _distance_to_way_m(latitude: float, longitude: float, geometry: list) -> float:
    """Distancia mínima punto-a-línea desde (latitude, longitude) hasta la
    geometría de la vía (lista de vértices {lat, lon} tal como la entrega
    Overpass con `out geom;`). math.inf si la geometría no trae puntos
    utilizables."""
    puntos_validos = [
        p for p in geometry
        if isinstance(p, dict) and "lat" in p and "lon" in p
    ]
    if not puntos_validos:
        return math.inf

    px, py = _project_meters(latitude, longitude, latitude)
    proyectados = [_project_meters(p["lat"], p["lon"], latitude) for p in puntos_validos]

    if len(proyectados) == 1:
        gx, gy = proyectados[0]
        return math.hypot(px - gx, py - gy)

    return min(
        _point_to_segment_distance_m(px, py, ax, ay, bx, by)
        for (ax, ay), (bx, by) in zip(proyectados, proyectados[1:])
    )


def _select_road(
    latitude: float, longitude: float, elements: list
) -> tuple[RoadType, float] | None:
    """Elige la vía admitida más cercana dentro del radio de 50 metros."""
    candidatos: list[tuple[RoadType, float]] = []
    for el in elements:
        if not isinstance(el, dict):
            continue
        highway = (el.get("tags") or {}).get("highway")
        road_type = _ROAD_TYPE_NORMALIZATION.get(highway)
        if road_type is None:
            continue
        geometry = el.get("geometry")
        if not isinstance(geometry, list):
            continue

        distancia = _distance_to_way_m(latitude, longitude, geometry)
        if distancia == math.inf or distancia > 50.0 + 1e-6:
            continue

        candidatos.append((road_type, min(distancia, 50.0)))

    if not candidatos:
        return None

    road_type, distancia_m = min(
        candidatos,
        key=lambda candidato: (candidato[1], -_PRIORITY[candidato[0]]),
    )
    return road_type, round(distancia_m, 2)


def _has_interpretable_road(latitude: float, longitude: float, elements: list) -> bool:
    """Distingue una vía válida fuera del radio de una respuesta inutilizable."""
    for el in elements:
        if not isinstance(el, dict):
            continue
        highway = (el.get("tags") or {}).get("highway")
        if highway not in _ROAD_TYPE_NORMALIZATION:
            continue
        geometry = el.get("geometry")
        if not isinstance(geometry, list):
            continue
        if _distance_to_way_m(latitude, longitude, geometry) != math.inf:
            return True
    return False


def _unavailable(error_code: ExternalSignalErrorCode, calculated_at: datetime) -> RoadRiskResult:
    return RoadRiskResult(
        score=None,
        status=ExternalSignalStatus.unavailable,
        calculated_at=calculated_at,
        error_code=error_code,
    )


def _error_code_for_status(status_code: int) -> ExternalSignalErrorCode:
    if status_code == 401:
        return ExternalSignalErrorCode.unauthorized
    if status_code == 429:
        return ExternalSignalErrorCode.rate_limited
    return ExternalSignalErrorCode.provider_error


def _parse_overpass_payload(
    payload: dict, latitude: float, longitude: float, calculated_at: datetime
) -> RoadRiskResult:
    try:
        elements = payload["elements"]
    except (KeyError, TypeError):
        raise _InvalidPayload from None
    if not isinstance(elements, list):
        raise _InvalidPayload

    seleccion = _select_road(latitude, longitude, elements)
    if seleccion is None:
        if elements and not _has_interpretable_road(latitude, longitude, elements):
            raise _InvalidPayload
        return RoadRiskResult(
            score=0,
            status=ExternalSignalStatus.complete,
            calculated_at=calculated_at,
        )

    road_type, distance_m = seleccion
    return RoadRiskResult(
        score=100,
        status=ExternalSignalStatus.complete,
        road_type=road_type,
        distance_m=distance_m,
        calculated_at=calculated_at,
    )


def _request_overpass(latitude: float, longitude: float) -> httpx.Response:
    query = _OVERPASS_QUERY_TEMPLATE.format(lat=latitude, lon=longitude)
    return httpx.post(
        OVERPASS_URL,
        data={"data": query},
        headers=_REQUEST_HEADERS,
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )


def _fetch_from_provider(latitude: float, longitude: float) -> RoadRiskResult:
    calculated_at = datetime.now(timezone.utc)

    last_error = ExternalSignalErrorCode.provider_error
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_overpass(latitude, longitude)
        except httpx.TimeoutException:
            last_error = ExternalSignalErrorCode.timeout
            continue
        except httpx.HTTPError:
            last_error = ExternalSignalErrorCode.provider_error
            continue

        if response.status_code == 200:
            try:
                return _parse_overpass_payload(response.json(), latitude, longitude, calculated_at)
            except (ValueError, _InvalidPayload):
                return _unavailable(ExternalSignalErrorCode.invalid_response, calculated_at)

        last_error = _error_code_for_status(response.status_code)

    return _unavailable(last_error, calculated_at)


def _cache_key(latitude: float, longitude: float) -> tuple[float, float]:
    return (round(latitude, 4), round(longitude, 4))


def get_road_risk(latitude: float, longitude: float) -> RoadRiskResult:
    key = _cache_key(latitude, longitude)

    cached = _cache.get(key)
    if cached is not None:
        now = datetime.now(timezone.utc)
        return cached.model_copy(
            update={"status": ExternalSignalStatus.cached, "calculated_at": now}
        )

    result = _fetch_from_provider(latitude, longitude)
    if result.status == ExternalSignalStatus.complete:
        _cache[key] = result
    return result
