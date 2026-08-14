from datetime import datetime, timedelta, timezone

import pytest

from app.models.urgency import (
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    RoadRiskResult,
    WeatherResult,
)
from app.services.urgency_service import calculate_urgency


NOW = datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)


def weather(score: int) -> WeatherResult:
    return WeatherResult(
        score=score,
        status=ExternalSignalStatus.complete,
        observed_at=NOW,
        evaluated_at=NOW,
    )


def road_risk(score: int) -> RoadRiskResult:
    return RoadRiskResult(
        score=score,
        status=ExternalSignalStatus.complete,
        road_type="primary" if score == 100 else None,
        distance_m=20 if score == 100 else None,
        calculated_at=NOW,
    )


def unavailable_weather() -> WeatherResult:
    return WeatherResult(
        status=ExternalSignalStatus.unavailable,
        evaluated_at=NOW,
        error_code=ExternalSignalErrorCode.timeout,
    )


def unavailable_road_risk() -> RoadRiskResult:
    return RoadRiskResult(
        status=ExternalSignalStatus.unavailable,
        calculated_at=NOW,
        error_code=ExternalSignalErrorCode.provider_error,
    )


def calculate(**overrides):
    values = {
        "ai_condition": "estable",
        "declared_condition": "estable",
        "reported_at": NOW,
        "weather": weather(0),
        "road_risk": road_risk(0),
        "calculated_at": NOW,
    }
    values.update(overrides)
    return calculate_urgency(**values)


def test_applies_documented_v1_formula():
    result = calculate(
        ai_condition="herido",
        declared_condition="herido",
        reported_at=NOW - timedelta(hours=5),
        weather=weather(50),
        road_risk=road_risk(100),
    )

    assert result.ai_condition_score == 70
    assert result.declared_condition_score == 60
    assert result.time_score == 40
    assert result.score == 61.5
    assert result.level == "amarillo"


@pytest.mark.parametrize(
    ("hours", "expected"),
    [(0, 0), (1, 8), (12.5, 100), (30, 100)],
)
def test_time_component_is_capped_at_one_hundred(hours, expected):
    result = calculate(reported_at=NOW - timedelta(hours=hours))
    assert result.time_score == expected


def test_future_report_date_never_produces_negative_time():
    result = calculate(reported_at=NOW + timedelta(minutes=10))
    assert result.time_score == 0


def test_ai_escalates_declared_component_when_difference_exceeds_forty():
    result = calculate(ai_condition="grave", declared_condition="estable")

    declared = result.applied_components["condicion_declarada"]
    assert declared["score_original"] == 20
    assert declared["score_usado"] == 100
    assert declared["escalado_por_ia"] is True
    assert result.score == 55


def test_difference_of_exactly_forty_does_not_escalate():
    result = calculate(ai_condition="grave", declared_condition="herido")
    assert result.applied_components["condicion_declarada"]["score_usado"] == 60


def test_missing_ai_uses_declared_condition_as_explicit_provisional_value():
    result = calculate(ai_condition=None, declared_condition="herido")

    component = result.applied_components["condicion_ia"]
    assert result.ai_condition_score is None
    assert component["score_usado"] == 60
    assert component["provisional"] is True


def test_external_failure_uses_neutral_provisional_value_instead_of_zero():
    result = calculate(
        weather=unavailable_weather(),
        road_risk=unavailable_road_risk(),
    )

    assert result.weather_score is None
    assert result.road_risk_score is None
    assert result.applied_components["clima"]["score_usado"] == 50
    assert result.applied_components["riesgo_vial"]["score_usado"] == 50
    assert result.score == 21


@pytest.mark.parametrize(
    ("score", "level", "minutes"),
    [(39.99, "verde", 60), (40, "amarillo", 30), (69.99, "amarillo", 30), (70, "rojo", 10)],
)
def test_operational_level_defines_next_recalculation(score, level, minutes):
    from app.services import urgency_service

    assert urgency_service._level_for(score) == level
    assert urgency_service._next_recalculation(NOW, level) == NOW + timedelta(
        minutes=minutes
    )


def test_rejects_unknown_conditions_and_naive_datetimes():
    with pytest.raises(ValueError, match="Unsupported declared condition"):
        calculate(declared_condition="desconocida")

    with pytest.raises(ValueError, match="timezone"):
        calculate(reported_at=datetime(2026, 8, 13, 12, 0))
