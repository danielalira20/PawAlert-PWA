import pytest

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
