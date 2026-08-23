from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.urgency import (
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    RoadRiskResult,
    WeatherResult,
)
from app.services import urgency_service
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
    assert urgency_service._level_for(score) == level
    assert urgency_service._next_recalculation(NOW, level) == NOW + timedelta(
        minutes=minutes
    )


def test_rejects_unknown_conditions_and_naive_datetimes():
    with pytest.raises(ValueError, match="Unsupported declared condition"):
        calculate(declared_condition="desconocida")

    with pytest.raises(ValueError, match="timezone"):
        calculate(reported_at=datetime(2026, 8, 13, 12, 0))


def _report_row(**overrides):
    row = {
        "id": "reporte-1",
        "created_at": (NOW - timedelta(hours=5)).isoformat(),
        "latitud": 19.04,
        "longitud": -98.20,
        "estado_reporte": "asignado",
        "estado_validacion_reporte": "aprobado",
        "urgency_excluido": False,
        "animal": [
            {
                "condicion_estimada_ia": "estable",
                "condicion_catalogo": {"clave": "estable"},
            },
            {
                "condicion_estimada_ia": "herido",
                "condicion_catalogo": {"clave": "grave"},
            },
        ],
    }
    row.update(overrides)
    return row


def _admin_client(make_query, report, previous_road=None):
    evaluations = make_query(
        execute_results=[previous_road or [], [{"id": "evaluacion-1"}]]
    )
    tables = {
        "reportes": make_query(data=[report]),
        "reporte_urgency_evaluaciones": evaluations,
        "historial_reporte": make_query(data=[]),
    }
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client, tables


def test_evaluates_and_persists_multi_animal_report(make_query):
    client, tables = _admin_client(make_query, _report_row())

    with (
        patch.object(urgency_service, "_get_admin_client", return_value=client),
        patch(
            "app.services.weather_service.get_weather", return_value=weather(50)
        ) as get_weather,
        patch(
            "app.services.road_risk_service.get_road_risk",
            return_value=road_risk(100),
        ) as get_road,
    ):
        result = urgency_service.evaluate_report_urgency(
            "reporte-1", calculated_at=NOW
        )

    assert result.ai_condition_score == 70
    assert result.declared_condition_score == 100
    assert result.score == 69.5
    assert result.level == "amarillo"
    get_weather.assert_called_once_with(19.04, -98.20)
    get_road.assert_called_once_with(19.04, -98.20)

    evaluation = tables["reporte_urgency_evaluaciones"].insert.call_args.args[0]
    assert evaluation["clima_score"] == 50
    assert evaluation["clima_status"] == "complete"
    assert evaluation["riesgo_vial_score"] == 100
    assert evaluation["riesgo_vial_status"] == "complete"
    assert evaluation["componentes_aplicados"]["tiempo"]["score_usado"] == 40

    current = tables["reportes"].update.call_args.args[0]
    assert current["urgency_score"] == 69.5
    assert current["urgency_nivel"] == "amarillo"
    assert current["urgency_formula_version"] == "urgency_v1"


def test_apply_operational_confirmation_reduces_score_without_touching_clinical(
    make_query,
):
    tables = {
        "reportes": make_query(data=[{"urgency_score": 80.0, "urgency_nivel": "rojo"}]),
        "historial_reporte": make_query(data=[]),
    }
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]

    with patch.object(urgency_service, "_get_admin_client", return_value=client):
        urgency_service.apply_operational_confirmation("reporte-1")

    actualizacion = tables["reportes"].update.call_args.args[0]
    assert actualizacion["urgency_score_operativo"] == 56.0
    assert actualizacion["urgency_nivel_operativo"] == "amarillo"
    assert actualizacion["urgency_operativo_actualizado_at"] is not None
    assert "urgency_score" not in actualizacion
    assert "urgency_nivel" not in actualizacion

    evento = tables["historial_reporte"].insert.call_args.args[0]
    assert evento["tipo_evento"] == "urgency_operativo_actualizado"
    assert evento["datos_extra"]["score_clinico"] == 80.0
    assert evento["datos_extra"]["score_operativo"] == 56.0


def test_apply_operational_confirmation_noop_without_clinical_score(make_query):
    tables = {
        "reportes": make_query(data=[{"urgency_score": None, "urgency_nivel": None}]),
        "historial_reporte": make_query(data=[]),
    }
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]

    with patch.object(urgency_service, "_get_admin_client", return_value=client):
        urgency_service.apply_operational_confirmation("reporte-1")

    tables["reportes"].update.assert_not_called()
    tables["historial_reporte"].insert.assert_not_called()


def test_reuses_persisted_road_result_in_recalculations(make_query):
    previous = [
        {
            "riesgo_vial_score": 100,
            "riesgo_vial_status": "complete",
            "riesgo_vial_detalle": {
                "road_type": "trunk",
                "distance_m": 12,
                "calculated_at": (NOW - timedelta(hours=1)).isoformat(),
            },
            "calculado_at": (NOW - timedelta(hours=1)).isoformat(),
        }
    ]
    client, tables = _admin_client(make_query, _report_row(), previous)

    with (
        patch.object(urgency_service, "_get_admin_client", return_value=client),
        patch("app.services.weather_service.get_weather", return_value=weather(0)),
        patch("app.services.road_risk_service.get_road_risk") as get_road,
    ):
        urgency_service.evaluate_report_urgency("reporte-1", calculated_at=NOW)

    get_road.assert_not_called()
    evaluation = tables["reporte_urgency_evaluaciones"].insert.call_args.args[0]
    assert evaluation["riesgo_vial_score"] == 100
    assert evaluation["riesgo_vial_status"] == "cached"


def test_missing_coordinates_persist_unavailable_signals_with_provisional_score(
    make_query,
):
    client, tables = _admin_client(
        make_query, _report_row(latitud=None, longitud=None)
    )

    with (
        patch.object(urgency_service, "_get_admin_client", return_value=client),
        patch("app.services.weather_service.get_weather") as get_weather,
        patch("app.services.road_risk_service.get_road_risk") as get_road,
    ):
        result = urgency_service.evaluate_report_urgency(
            "reporte-1", calculated_at=NOW
        )

    get_weather.assert_not_called()
    get_road.assert_not_called()
    evaluation = tables["reporte_urgency_evaluaciones"].insert.call_args.args[0]
    assert evaluation["clima_score"] is None
    assert evaluation["riesgo_vial_score"] is None
    assert evaluation["componentes_aplicados"]["clima"]["score_usado"] == 50
    assert result.score == 64.5


@pytest.mark.parametrize(
    "report",
    [
        _report_row(estado_validacion_reporte="revision_manual"),
        _report_row(urgency_excluido=True),
        _report_row(estado_reporte="rescatado"),
        _report_row(estado_reporte="cerrado"),
    ],
)
def test_persistence_rejects_non_operational_reports(make_query, report):
    client, _ = _admin_client(make_query, report)
    with patch.object(urgency_service, "_get_admin_client", return_value=client):
        with pytest.raises(ValueError):
            urgency_service.evaluate_report_urgency("reporte-1", calculated_at=NOW)
