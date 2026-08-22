"""Decision unica para la validacion inicial de un reporte."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.visual_similarity import VisualSimilarityLevel


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
    reporter_trust_check_error: bool,
    linked_duplicate_report_id: str | None,
    clip_level: VisualSimilarityLevel | None = None,
    clip_similarity: float | None = None,
    clip_matching_report_id: str | None = None,
    clip_error_code: str | None = None,
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
    advisory_reasons: list[dict] = []
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
    if reporter_trust_check_error:
        reasons.append(_reason("trust_score_no_disponible"))
    if clip_level == VisualSimilarityLevel.high:
        reason = _reason("clip_similitud_alta")
        reason["similitud"] = clip_similarity
        if clip_matching_report_id:
            reason["reporte_coincidente_id"] = clip_matching_report_id
        reasons.append(reason)
    elif clip_level == VisualSimilarityLevel.gray:
        reason = _reason("clip_zona_gris")
        reason["resultado"] = "revision_temporal"
        reason["similitud"] = clip_similarity
        if clip_matching_report_id:
            reason["reporte_coincidente_id"] = clip_matching_report_id
        reasons.append(reason)
    if clip_error_code:
        advisory_reasons.append(
            {
                "codigo": "clip_no_disponible",
                "resultado": "sin_bloqueo",
                "detalle": clip_error_code,
            }
        )

    if reasons:
        return InitialValidationDecision(
            outcome="revision_manual",
            reasons=reasons + advisory_reasons,
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
        ] + advisory_reasons,
        urgency_excluded=False,
        urgency_exclusion_reasons=[],
    )
