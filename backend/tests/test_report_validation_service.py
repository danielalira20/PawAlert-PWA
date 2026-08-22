import pytest

from app.models.visual_similarity import VisualSimilarityLevel
from app.services.report_validation_service import evaluate_initial_validation


def _evaluate(**overrides):
    inputs = {
        "has_photos": True,
        "gemini_technical_error": False,
        "gemini_error_detail": None,
        "exif_mismatch": False,
        "phash_alert": False,
        "reporter_requires_prior_review": False,
        "reporter_trust_check_error": False,
        "linked_duplicate_report_id": None,
    }
    inputs.update(overrides)
    return evaluate_initial_validation(**inputs)


def test_all_clean_signals_approve_initial_validation():
    decision = _evaluate()

    assert decision.outcome == "aprobado"
    assert decision.urgency_excluded is False
    assert decision.urgency_exclusion_reasons == []
    assert decision.reasons == [
        {"codigo": "validacion_inicial_aprobada", "resultado": "aprobado"}
    ]


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"has_photos": False}, "sin_evidencia_fotografica"),
        (
            {
                "gemini_technical_error": True,
                "gemini_error_detail": "timeout",
            },
            "gemini_error_tecnico",
        ),
        ({"exif_mismatch": True}, "exif_ubicacion_discrepante"),
        ({"phash_alert": True}, "phash_coincidencia"),
        ({"reporter_requires_prior_review": True}, "trust_score_revision_previa"),
        ({"reporter_trust_check_error": True}, "trust_score_no_disponible"),
    ],
)
def test_each_risk_signal_sends_report_to_manual_review(overrides, expected_code):
    decision = _evaluate(**overrides)

    assert decision.outcome == "revision_manual"
    assert decision.urgency_excluded is True
    assert [reason["codigo"] for reason in decision.reasons] == [expected_code]
    assert decision.urgency_exclusion_reasons == [{"codigo": expected_code}]


def test_manual_review_accumulates_all_reasons():
    decision = _evaluate(
        gemini_technical_error=True,
        gemini_error_detail="proveedor no disponible",
        exif_mismatch=True,
        phash_alert=True,
        reporter_requires_prior_review=True,
    )

    assert [reason["codigo"] for reason in decision.reasons] == [
        "gemini_error_tecnico",
        "exif_ubicacion_discrepante",
        "phash_coincidencia",
        "trust_score_revision_previa",
    ]
    assert decision.reasons[0]["detalle"] == "proveedor no disponible"


def test_linked_duplicate_is_terminal_and_does_not_enter_manual_review():
    decision = _evaluate(
        linked_duplicate_report_id="reporte-original",
        exif_mismatch=True,
        phash_alert=True,
    )

    assert decision.outcome == "duplicado_vinculable"
    assert decision.urgency_excluded is True
    assert decision.reasons == [
        {
            "codigo": "duplicado_vinculado",
            "resultado": "no_operativo",
            "reporte_original_id": "reporte-original",
        }
    ]


@pytest.mark.parametrize(
    ("level", "expected_code", "expected_result"),
    [
        (VisualSimilarityLevel.high, "clip_similitud_alta", "revision_manual"),
        (VisualSimilarityLevel.gray, "clip_zona_gris", "revision_temporal"),
    ],
)
def test_clip_risk_stops_initial_activation(level, expected_code, expected_result):
    decision = _evaluate(
        clip_level=level,
        clip_similarity=0.95 if level == VisualSimilarityLevel.high else 0.9,
        clip_matching_report_id="reporte-coincidente",
    )

    assert decision.outcome == "revision_manual"
    assert decision.urgency_excluded is True
    assert decision.reasons == [
        {
            "codigo": expected_code,
            "resultado": expected_result,
            "similitud": 0.95 if level == VisualSimilarityLevel.high else 0.9,
            "reporte_coincidente_id": "reporte-coincidente",
        }
    ]


def test_clip_unavailable_is_recorded_without_blocking_report():
    decision = _evaluate(clip_error_code="timeout")

    assert decision.outcome == "aprobado"
    assert decision.urgency_excluded is False
    assert decision.reasons == [
        {"codigo": "validacion_inicial_aprobada", "resultado": "aprobado"},
        {
            "codigo": "clip_no_disponible",
            "resultado": "sin_bloqueo",
            "detalle": "timeout",
        },
    ]


def test_clip_unavailable_does_not_become_urgency_exclusion_with_other_risk():
    decision = _evaluate(phash_alert=True, clip_error_code="provider_error")

    assert decision.outcome == "revision_manual"
    assert decision.urgency_exclusion_reasons == [
        {"codigo": "phash_coincidencia"}
    ]
    assert decision.reasons[-1]["codigo"] == "clip_no_disponible"
