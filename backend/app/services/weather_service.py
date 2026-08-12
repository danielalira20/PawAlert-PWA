from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.models.urgency import (
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    WeatherResult,
)

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
_REQUEST_TIMEOUT_SECONDS = 5.0
_MAX_ATTEMPTS = 2  # 1 intento + 1 reintento
_CACHE_TTL = timedelta(minutes=15)

# Coordenadas redondeadas a 2 decimales -> última observación completa.
_cache: dict[tuple[float, float], WeatherResult] = {}

# Grupos de condition_code de OpenWeather:
# https://openweathermap.org/weather-conditions
_THUNDERSTORM_CODES = set(range(200, 233))
_HEAVY_OR_EXTREME_RAIN_CODES = {502, 503, 504, 511, 522, 531}
_MODERATE_RAIN_CODES = {501, 521}
_TORNADO_CODE = 781


class _InvalidPayload(Exception):
    pass


def _classify_temperature_score(temperature_c: float) -> int:
    if temperature_c < 5 or temperature_c > 35:
        return 100
    return 0


def _classify_condition_score(condition_code: int) -> int:
    if condition_code in _THUNDERSTORM_CODES:
        return 100
    if condition_code == _TORNADO_CODE:
        return 100
    if condition_code in _HEAVY_OR_EXTREME_RAIN_CODES:
        return 100
    if condition_code in _MODERATE_RAIN_CODES:
        return 50
    return 0


def _classify_score(temperature_c: float, condition_code: int) -> int:
    return max(
        _classify_temperature_score(temperature_c),
        _classify_condition_score(condition_code),
    )


def _unavailable(error_code: ExternalSignalErrorCode, evaluated_at: datetime) -> WeatherResult:
    return WeatherResult(
        score=None,
        status=ExternalSignalStatus.unavailable,
        evaluated_at=evaluated_at,
        error_code=error_code,
    )


def _error_code_for_status(status_code: int) -> ExternalSignalErrorCode:
    if status_code == 401:
        return ExternalSignalErrorCode.unauthorized
    if status_code == 429:
        return ExternalSignalErrorCode.rate_limited
    return ExternalSignalErrorCode.provider_error


def _parse_payload(payload: dict, evaluated_at: datetime) -> WeatherResult:
    try:
        temperature_c = float(payload["main"]["temp"])
        condition_code = int(payload["weather"][0]["id"])
        observed_at = datetime.fromtimestamp(payload["dt"], tz=timezone.utc)
        precipitation_mm_h = float(
            payload.get("rain", {}).get("1h")
            or payload.get("snow", {}).get("1h")
            or 0
        )
    except (KeyError, IndexError, TypeError, ValueError):
        raise _InvalidPayload from None

    return WeatherResult(
        score=_classify_score(temperature_c, condition_code),
        status=ExternalSignalStatus.complete,
        temperature_c=temperature_c,
        precipitation_mm_h=precipitation_mm_h,
        condition_code=condition_code,
        observed_at=observed_at,
        evaluated_at=evaluated_at,
    )


def _request_current_weather(latitude: float, longitude: float) -> httpx.Response:
    params = {
        "lat": latitude,
        "lon": longitude,
        "appid": settings.openweather_api_key,
        "units": "metric",
    }
    return httpx.get(OPENWEATHER_URL, params=params, timeout=_REQUEST_TIMEOUT_SECONDS)


def _fetch_from_provider(latitude: float, longitude: float) -> WeatherResult:
    evaluated_at = datetime.now(timezone.utc)

    if not settings.openweather_api_key:
        return _unavailable(ExternalSignalErrorCode.not_configured, evaluated_at)

    last_error = ExternalSignalErrorCode.provider_error
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_current_weather(latitude, longitude)
        except httpx.TimeoutException:
            last_error = ExternalSignalErrorCode.timeout
            continue
        except httpx.HTTPError:
            last_error = ExternalSignalErrorCode.provider_error
            continue

        if response.status_code == 200:
            try:
                return _parse_payload(response.json(), evaluated_at)
            except _InvalidPayload:
                return _unavailable(ExternalSignalErrorCode.invalid_response, evaluated_at)

        last_error = _error_code_for_status(response.status_code)

    return _unavailable(last_error, evaluated_at)


def _cache_key(latitude: float, longitude: float) -> tuple[float, float]:
    return (round(latitude, 2), round(longitude, 2))


def _store_in_cache(key: tuple[float, float], result: WeatherResult) -> None:
    if result.status == ExternalSignalStatus.complete:
        _cache[key] = result


def _get_fresh_cache(key: tuple[float, float], now: datetime) -> WeatherResult | None:
    cached = _cache.get(key)
    if cached is None or cached.observed_at is None:
        return None
    if now - cached.observed_at <= _CACHE_TTL:
        return cached
    return None


def get_weather(latitude: float, longitude: float) -> WeatherResult:
    now = datetime.now(timezone.utc)
    key = _cache_key(latitude, longitude)

    fresh = _get_fresh_cache(key, now)
    if fresh is not None:
        return fresh.model_copy(
            update={"status": ExternalSignalStatus.cached, "evaluated_at": now}
        )

    result = _fetch_from_provider(latitude, longitude)
    _store_in_cache(key, result)
    return result
