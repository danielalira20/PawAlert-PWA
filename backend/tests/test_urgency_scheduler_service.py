import pytest
from unittest.mock import patch, MagicMock
from app.services.urgency_scheduler_service import run_due_urgency_recalculations, _clasificar
from app.services.urgency_service import UrgencyCalculation

def test_stale_cache_es_degraded():
    calc = UrgencyCalculation(
        score=50,
        level="verde",
        ai_condition_score=None,
        declared_condition_score=50,
        time_score=0,
        weather_score=None,
        road_risk_score=None,
        calculated_at=None,
        next_recalculation_at=None,
        applied_components={
            "clima": {"status": "stale_cache"},
            "riesgo_vial": {"status": "complete"}
        }
    )
    assert _clasificar(calc) == "degraded"

def test_unavailable_es_degraded():
    calc = UrgencyCalculation(
        score=50,
        level="verde",
        ai_condition_score=None,
        declared_condition_score=50,
        time_score=0,
        weather_score=None,
        road_risk_score=None,
        calculated_at=None,
        next_recalculation_at=None,
        applied_components={
            "clima": {"status": "complete"},
            "riesgo_vial": {"status": "unavailable"}
        }
    )
    assert _clasificar(calc) == "degraded"

def test_complete_y_cached_es_updated():
    calc = UrgencyCalculation(
        score=50,
        level="verde",
        ai_condition_score=None,
        declared_condition_score=50,
        time_score=0,
        weather_score=None,
        road_risk_score=None,
        calculated_at=None,
        next_recalculation_at=None,
        applied_components={
            "clima": {"status": "complete"},
            "riesgo_vial": {"status": "cached"}
        }
    )
    assert _clasificar(calc) == "updated"

@patch("app.services.urgency_scheduler_service._crear_run")
@patch("app.services.urgency_scheduler_service._claim_sublote")
@patch("app.services.urgency_scheduler_service._release_claim")
@patch("app.services.urgency_scheduler_service._finalizar_run")
@patch("app.services.urgency_scheduler_service.evaluate_report_urgency")
def test_lote_vacio(mock_eval, mock_fin, mock_rel, mock_claim, mock_crear):
    mock_crear.return_value = {"id": "run_1"}
    mock_claim.return_value = []
    
    res = run_due_urgency_recalculations()
    
    assert res == {}
    mock_eval.assert_not_called()
    mock_fin.assert_called_once()

@patch("app.services.urgency_scheduler_service._crear_run")
@patch("app.services.urgency_scheduler_service._claim_sublote")
@patch("app.services.urgency_scheduler_service._release_claim")
@patch("app.services.urgency_scheduler_service._finalizar_run")
@patch("app.services.urgency_scheduler_service.evaluate_report_urgency")
def test_un_reporte_falla_otros_continuan(mock_eval, mock_fin, mock_rel, mock_claim, mock_crear):
    mock_crear.return_value = {"id": "run_1"}
    # claim_sublote is called multiple times due to loop. We need side_effect.
    mock_claim.side_effect = [["rep1", "rep2"], []]
    
    def fake_eval(rep_id):
        if rep_id == "rep1":
            raise Exception("Failed")
        return UrgencyCalculation(
            score=50,
            level="verde",
            ai_condition_score=None,
            declared_condition_score=50,
            time_score=0,
            weather_score=None,
            road_risk_score=None,
            calculated_at=None,
            next_recalculation_at=None,
            applied_components={}
        )
    
    mock_eval.side_effect = fake_eval
    
    res = run_due_urgency_recalculations()
    
    assert res.get("failed") == 1
    assert res.get("updated") == 1
    assert res.get("examined") == 2
    assert mock_rel.call_count == 2
