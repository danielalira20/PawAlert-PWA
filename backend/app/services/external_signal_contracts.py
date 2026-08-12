from collections.abc import Callable

from app.models.urgency import (
    DuplicateCandidate,
    DuplicateSearchInput,
    RoadRiskResult,
    WeatherResult,
)


# Implementaciones esperadas:
# weather_service.get_weather(latitude, longitude) -> WeatherResult
# road_risk_service.get_road_risk(latitude, longitude) -> RoadRiskResult
# duplicate_service.find_geographic_duplicates(search) -> list[DuplicateCandidate]
WeatherProvider = Callable[[float, float], WeatherResult]
RoadRiskProvider = Callable[[float, float], RoadRiskResult]
DuplicateProvider = Callable[[DuplicateSearchInput], list[DuplicateCandidate]]
