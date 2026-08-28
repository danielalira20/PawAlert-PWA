"""Procesamiento idempotente de revisiones temporales por CLIP gris."""

from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException

from app.db.supabase import supabase_admin
from app.services.report_activation_service import (
    activar_reporte_por_vencimiento_clip,
)


logger = logging.getLogger(__name__)


def _claim_due(claim_token: str, limit: int) -> list[str]:
    result = supabase_admin.rpc(
        "claim_due_clip_gray_reports",
        {"p_claim_token": claim_token, "p_limit": limit},
    ).execute()
    return [row["reporte_id"] for row in (result.data or [])]


def _release_claim(reporte_id: str, claim_token: str) -> None:
    try:
        supabase_admin.rpc(
            "release_clip_gray_claim",
            {"p_reporte_id": reporte_id, "p_claim_token": claim_token},
        ).execute()
    except Exception as error:
        logger.error("No se pudo liberar claim CLIP %s: %s", reporte_id, error)


def procesar_vencimientos_clip(limit: int = 100) -> dict[str, int]:
    claim_token = str(uuid.uuid4())
    reportes = _claim_due(claim_token, limit)
    resultado = {
        "reclamados": len(reportes),
        "activados": 0,
        "omitidos": 0,
        "fallidos": 0,
    }

    for reporte_id in reportes:
        try:
            activar_reporte_por_vencimiento_clip(reporte_id)
            resultado["activados"] += 1
        except HTTPException as error:
            if error.status_code in (404, 409):
                resultado["omitidos"] += 1
            else:
                resultado["fallidos"] += 1
                logger.error("Fallo al activar revision CLIP %s", reporte_id)
        except Exception as error:
            resultado["fallidos"] += 1
            logger.error("Fallo al activar revision CLIP %s: %s", reporte_id, error)
        finally:
            _release_claim(reporte_id, claim_token)

    return resultado
