"""Decision unica para la validacion inicial de un reporte."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


ValidationOutcome = Literal["aprobado", "revision_manual", "duplicado_vinculable"]


@dataclass(frozen=True)
class InitialValidationDecision:
    outcome: ValidationOutcome
    reasons: list[dict]
    urgency_excluded: bool
    urgency_exclusion_reasons: list[dict]


def _reason(code: str, detail: str | None = None) -> dict:
    reason = {"codigo": code, "resultado": "revision_manual"}
    if detail:
        reason["detalle"] = detail
    return reason


def evaluate_initial_validation(
    *,
    has_photos: bool,
    gemini_technical_error: bool,
    gemini_error_detail: str | None,
    exif_mismatch: bool,
    phash_alert: bool,
    reporter_requires_prior_review: bool,
    linked_duplicate_report_id: str | None,
) -> InitialValidationDecision:
    """Combina las capas previas a cobertura sin ejecutar efectos operativos."""
    if linked_duplicate_report_id:
        reason = {
            "codigo": "duplicado_vinculado",
            "resultado": "no_operativo",
            "reporte_original_id": linked_duplicate_report_id,
        }
        return InitialValidationDecision(
            outcome="duplicado_vinculable",
            reasons=[reason],
            urgency_excluded=True,
            urgency_exclusion_reasons=[{"codigo": "duplicado_vinculado"}],
        )

    reasons: list[dict] = []
    if not has_photos:
        reasons.append(_reason("sin_evidencia_fotografica"))
    if gemini_technical_error:
        reasons.append(_reason("gemini_error_tecnico", gemini_error_detail))
    if exif_mismatch:
        reasons.append(_reason("exif_ubicacion_discrepante"))
    if phash_alert:
        reasons.append(_reason("phash_coincidencia"))
    if reporter_requires_prior_review:
        reasons.append(_reason("trust_score_revision_previa"))

    if reasons:
        return InitialValidationDecision(
            outcome="revision_manual",
            reasons=reasons,
            urgency_excluded=True,
            urgency_exclusion_reasons=[
                {"codigo": reason["codigo"]} for reason in reasons
            ],
        )

    return InitialValidationDecision(
        outcome="aprobado",
        reasons=[
            {
                "codigo": "validacion_inicial_aprobada",
                "resultado": "aprobado",
            }
        ],
        urgency_excluded=False,
        urgency_exclusion_reasons=[],
    )
