# Grupos de condition_code de OpenWeather:
# https://openweathermap.org/weather-conditions
_THUNDERSTORM_CODES = set(range(200, 233))
_HEAVY_OR_EXTREME_RAIN_CODES = {502, 503, 504, 511, 522, 531}
_MODERATE_RAIN_CODES = {501, 521}
_TORNADO_CODE = 781


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
