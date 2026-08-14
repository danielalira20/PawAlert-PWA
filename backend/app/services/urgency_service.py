from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.models.urgency import RoadRiskResult, WeatherResult


FORMULA_VERSION = "urgency_v1"
WEIGHTS = {
    "condicion_ia": 0.35,
    "condicion_declarada": 0.20,
    "tiempo": 0.25,
    "clima": 0.10,
    "riesgo_vial": 0.10,
}
AI_CONDITION_SCORES = {"estable": 20, "herido": 70, "grave": 100}
DECLARED_CONDITION_SCORES = {"estable": 20, "herido": 60, "grave": 100}
PROVISIONAL_EXTERNAL_SCORE = 50

UrgencyLevel = Literal["verde", "amarillo", "rojo"]


@dataclass(frozen=True)
class UrgencyCalculation:
    score: float
    level: UrgencyLevel
    ai_condition_score: int | None
    declared_condition_score: int
    time_score: float
    weather_score: int | None
    road_risk_score: int | None
    applied_components: dict
    calculated_at: datetime
    next_recalculation_at: datetime
    formula_version: str = FORMULA_VERSION


def _require_aware(value: datetime, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include timezone information")
    return value.astimezone(timezone.utc)


def _condition_score(condition: str, scores: dict[str, int], source: str) -> int:
    normalized = condition.strip().lower()
    try:
        return scores[normalized]
    except KeyError:
        raise ValueError(f"Unsupported {source} condition: {condition}") from None


def _time_score(reported_at: datetime, calculated_at: datetime) -> float:
    elapsed_seconds = max(0.0, (calculated_at - reported_at).total_seconds())
    return round(min(100.0, elapsed_seconds / 3600 * 8), 2)


def _level_for(score: float) -> UrgencyLevel:
    if score >= 70:
        return "rojo"
    if score >= 40:
        return "amarillo"
    return "verde"


def _next_recalculation(calculated_at: datetime, level: UrgencyLevel) -> datetime:
    interval = {
        "verde": timedelta(minutes=60),
        "amarillo": timedelta(minutes=30),
        "rojo": timedelta(minutes=10),
    }[level]
    return calculated_at + interval


def _external_component(score: int | None, status: str) -> tuple[int, dict]:
    if score is not None:
        return score, {
            "score_usado": score,
            "provisional": False,
            "status": status,
        }
    return PROVISIONAL_EXTERNAL_SCORE, {
        "score_usado": PROVISIONAL_EXTERNAL_SCORE,
        "provisional": True,
        "status": status,
        "motivo": "senal_externa_no_disponible",
    }


def calculate_urgency(
    *,
    ai_condition: str | None,
    declared_condition: str,
    reported_at: datetime,
    weather: WeatherResult,
    road_risk: RoadRiskResult,
    calculated_at: datetime | None = None,
) -> UrgencyCalculation:
    """Calcula Urgency Score v1 sin consultar proveedores ni persistir datos."""
    now = _require_aware(
        calculated_at or datetime.now(timezone.utc), "calculated_at"
    )
    reported = _require_aware(reported_at, "reported_at")

    declared_score = _condition_score(
        declared_condition, DECLARED_CONDITION_SCORES, "declared"
    )
    ai_score = (
        _condition_score(ai_condition, AI_CONDITION_SCORES, "AI")
        if ai_condition is not None
        else None
    )

    ai_applied_score = ai_score if ai_score is not None else declared_score
    ai_is_provisional = ai_score is None
    declared_applied_score = declared_score
    automatically_escalated = (
        ai_score is not None and ai_score - declared_score > 40
    )
    if automatically_escalated:
        declared_applied_score = ai_score

    elapsed_score = _time_score(reported, now)
    weather_applied_score, weather_component = _external_component(
        weather.score, weather.status.value
    )
    road_applied_score, road_component = _external_component(
        road_risk.score, road_risk.status.value
    )

    components = {
        "condicion_ia": {
            "score_original": ai_score,
            "score_usado": ai_applied_score,
            "peso": WEIGHTS["condicion_ia"],
            "provisional": ai_is_provisional,
            "motivo": "ia_no_disponible" if ai_is_provisional else None,
        },
        "condicion_declarada": {
            "score_original": declared_score,
            "score_usado": declared_applied_score,
            "peso": WEIGHTS["condicion_declarada"],
            "escalado_por_ia": automatically_escalated,
        },
        "tiempo": {
            "score_usado": elapsed_score,
            "peso": WEIGHTS["tiempo"],
        },
        "clima": {
            **weather_component,
            "score_original": weather.score,
            "peso": WEIGHTS["clima"],
        },
        "riesgo_vial": {
            **road_component,
            "score_original": road_risk.score,
            "peso": WEIGHTS["riesgo_vial"],
        },
    }

    score = round(
        ai_applied_score * WEIGHTS["condicion_ia"]
        + declared_applied_score * WEIGHTS["condicion_declarada"]
        + elapsed_score * WEIGHTS["tiempo"]
        + weather_applied_score * WEIGHTS["clima"]
        + road_applied_score * WEIGHTS["riesgo_vial"],
        2,
    )
    level = _level_for(score)

    return UrgencyCalculation(
        score=score,
        level=level,
        ai_condition_score=ai_score,
        declared_condition_score=declared_score,
        time_score=elapsed_score,
        weather_score=weather.score,
        road_risk_score=road_risk.score,
        applied_components=components,
        calculated_at=now,
        next_recalculation_at=_next_recalculation(now, level),
    )
