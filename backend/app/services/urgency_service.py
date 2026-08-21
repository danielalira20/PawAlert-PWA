from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.models.urgency import (
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    RoadRiskResult,
    WeatherResult,
)
from app.models.report import ESTADOS_REPORTE_TERMINALES


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


def _parse_datetime(value: str | datetime, field_name: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _require_aware(parsed, field_name)


def _unavailable_weather(calculated_at: datetime) -> WeatherResult:
    return WeatherResult(
        status=ExternalSignalStatus.unavailable,
        evaluated_at=calculated_at,
        error_code=ExternalSignalErrorCode.no_data,
    )


def _unavailable_road_risk(calculated_at: datetime) -> RoadRiskResult:
    return RoadRiskResult(
        status=ExternalSignalStatus.unavailable,
        calculated_at=calculated_at,
        error_code=ExternalSignalErrorCode.no_data,
    )


def _get_weather(latitude: float | None, longitude: float | None, now: datetime) -> WeatherResult:
    if latitude is None or longitude is None:
        return _unavailable_weather(now)
    try:
        from app.services.weather_service import get_weather

        return get_weather(latitude, longitude)
    except Exception:
        return WeatherResult(
            status=ExternalSignalStatus.unavailable,
            evaluated_at=now,
            error_code=ExternalSignalErrorCode.provider_error,
        )


def _road_result_from_evaluation(row: dict) -> RoadRiskResult | None:
    status = row.get("riesgo_vial_status")
    if not status:
        return None
    detail = row.get("riesgo_vial_detalle") or {}
    calculated_at = _parse_datetime(
        detail.get("calculated_at") or row["calculado_at"], "calculated_at"
    )
    if status == ExternalSignalStatus.unavailable.value:
        error_code = detail.get("error_code") or ExternalSignalErrorCode.no_data.value
        return RoadRiskResult(
            status=ExternalSignalStatus.unavailable,
            calculated_at=calculated_at,
            error_code=error_code,
        )
    return RoadRiskResult(
        score=row.get("riesgo_vial_score"),
        status=ExternalSignalStatus.cached,
        road_type=detail.get("road_type"),
        distance_m=detail.get("distance_m"),
        calculated_at=calculated_at,
    )


def _get_road_risk(
    database,
    reporte_id: str,
    latitude: float | None,
    longitude: float | None,
    now: datetime,
) -> RoadRiskResult:
    previous = (
        database.table("reporte_urgency_evaluaciones")
        .select(
            "riesgo_vial_score, riesgo_vial_status, riesgo_vial_detalle, calculado_at"
        )
        .eq("reporte_id", reporte_id)
        .order("calculado_at", desc=True)
        .limit(1)
        .execute()
    )
    if previous.data:
        persisted = _road_result_from_evaluation(previous.data[0])
        if persisted is not None:
            return persisted

    if latitude is None or longitude is None:
        return _unavailable_road_risk(now)
    try:
        from app.services.road_risk_service import get_road_risk

        return get_road_risk(latitude, longitude)
    except Exception:
        return RoadRiskResult(
            status=ExternalSignalStatus.unavailable,
            calculated_at=now,
            error_code=ExternalSignalErrorCode.provider_error,
        )


def _animals_from_report(report: dict) -> list[dict]:
    animals = report.get("animal") or []
    return [animals] if isinstance(animals, dict) else animals


def _most_severe_condition(animals: list[dict], field: str, scores: dict[str, int]) -> str | None:
    conditions = []
    for animal in animals:
        if field == "condicion_declarada":
            condition = (animal.get("condicion_catalogo") or {}).get("clave")
        else:
            condition = animal.get("condicion_estimada_ia")
        if condition in scores:
            conditions.append(condition)
    return max(conditions, key=scores.get) if conditions else None


def _external_detail(result: WeatherResult | RoadRiskResult) -> dict:
    return result.model_dump(mode="json", exclude={"score", "status"})


def _get_admin_client():
    from app.db.supabase import supabase_admin

    return supabase_admin


def evaluate_report_urgency(
    reporte_id: str, *, calculated_at: datetime | None = None
) -> UrgencyCalculation:
    """Evalua un reporte aprobado y persiste resultado vigente e historial."""
    now = _require_aware(
        calculated_at or datetime.now(timezone.utc), "calculated_at"
    )
    database = _get_admin_client()
    query = (
        database.table("reportes")
        .select(
            "id, created_at, latitud, longitud, estado_reporte, "
            "estado_validacion_reporte, "
            "urgency_excluido, animal(condicion_estimada_ia, condicion_catalogo(clave))"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not query.data:
        raise ValueError("Report not found")

    report = query.data[0]
    if report.get("estado_validacion_reporte") != "aprobado":
        raise ValueError("Urgency can only be calculated for an approved report")
    if report.get("estado_reporte") in ESTADOS_REPORTE_TERMINALES:
        raise ValueError("Urgency cannot be calculated for a terminal report")
    if report.get("urgency_excluido"):
        raise ValueError("Report is excluded from urgency calculation")

    animals = _animals_from_report(report)
    declared_condition = _most_severe_condition(
        animals, "condicion_declarada", DECLARED_CONDITION_SCORES
    )
    if declared_condition is None:
        raise ValueError("Report has no valid declared animal condition")
    ai_condition = _most_severe_condition(
        animals, "condicion_ia", AI_CONDITION_SCORES
    )

    latitude = report.get("latitud")
    longitude = report.get("longitud")
    weather = _get_weather(latitude, longitude, now)
    road_risk = _get_road_risk(database, reporte_id, latitude, longitude, now)
    result = calculate_urgency(
        ai_condition=ai_condition,
        declared_condition=declared_condition,
        reported_at=_parse_datetime(report["created_at"], "created_at"),
        weather=weather,
        road_risk=road_risk,
        calculated_at=now,
    )

    evaluation_payload = {
        "reporte_id": reporte_id,
        "formula_version": result.formula_version,
        "score": result.score,
        "nivel": result.level,
        "condicion_ia_score": result.ai_condition_score,
        "condicion_declarada_score": result.declared_condition_score,
        "tiempo_score": result.time_score,
        "clima_score": result.weather_score,
        "clima_status": weather.status.value,
        "clima_detalle": _external_detail(weather),
        "riesgo_vial_score": result.road_risk_score,
        "riesgo_vial_status": road_risk.status.value,
        "riesgo_vial_detalle": _external_detail(road_risk),
        "componentes_aplicados": result.applied_components,
        "excluido": False,
        "razones_exclusion": [],
        "calculado_at": result.calculated_at.isoformat(),
        "proximo_recalculo_at": result.next_recalculation_at.isoformat(),
    }
    database.table("reporte_urgency_evaluaciones").insert(
        evaluation_payload
    ).execute()
    (
        database.table("reportes")
        .update(
            {
                "urgency_score": result.score,
                "urgency_nivel": result.level,
                "urgency_calculado_at": result.calculated_at.isoformat(),
                "urgency_proximo_recalculo_at": (
                    result.next_recalculation_at.isoformat()
                ),
                "urgency_formula_version": result.formula_version,
            }
        )
        .eq("id", reporte_id)
        .eq("estado_validacion_reporte", "aprobado")
        .eq("urgency_excluido", False)
        .execute()
    )

    if result.applied_components["condicion_declarada"]["escalado_por_ia"]:
        database.table("historial_reporte").insert(
            {
                "reporte_id": reporte_id,
                "tipo_evento": "urgency_escalado_por_ia",
                "descripcion": (
                    "La condicion estimada por IA fue mas grave que la "
                    "declarada y elevo el calculo de urgencia."
                ),
                "datos_extra": {
                    "condicion_declarada_score": result.declared_condition_score,
                    "condicion_ia_score": result.ai_condition_score,
                },
            }
        ).execute()

    return result
