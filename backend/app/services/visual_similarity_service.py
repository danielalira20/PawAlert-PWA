"""Persistencia y búsqueda de similitud visual, todavía sin decidir moderación."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import ValidationError

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.models.visual_similarity import (
    ClipEmbeddingResult,
    VisualSimilarityCandidate,
    VisualSimilaritySearchResult,
    VisualSimilaritySource,
    VisualSimilarityThresholds,
)
from app.services.clip_embedding_service import get_clip_embedding


_MAX_CANDIDATES = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _thresholds() -> VisualSimilarityThresholds:
    return VisualSimilarityThresholds(
        gray=settings.clip_gray_threshold,
        high=settings.clip_high_threshold,
    )


def _coerce_embedding(value: object) -> list[float]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list):
        raise ValueError("Stored embedding has an invalid format")
    return [float(item) for item in value]


def _existing_complete_embedding(
    animal_photo_id: str,
) -> tuple[str, ClipEmbeddingResult] | None:
    result = (
        supabase_admin.table("reporte_imagen_embeddings")
        .select("id, estado, embedding, modelo, calculado_at")
        .eq("animal_foto_id", animal_photo_id)
        .eq("modelo", settings.clip_model)
        .eq("estado", "complete")
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    row = result.data[0]
    try:
        embedding = ClipEmbeddingResult(
            status=ExternalSignalStatus.complete,
            embedding=_coerce_embedding(row["embedding"]),
            model=row["modelo"],
            calculated_at=row["calculado_at"],
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        return None
    return row["id"], embedding


def _persist_embedding(
    report_id: str,
    animal_photo_id: str,
    result: ClipEmbeddingResult,
) -> str | None:
    payload = {
        "reporte_id": report_id,
        "animal_foto_id": animal_photo_id,
        "modelo": result.model,
        "dimensiones": result.dimensions,
        "estado": result.status.value,
        "embedding": result.embedding,
        "error_codigo": result.error_code.value if result.error_code else None,
        "calculado_at": result.calculated_at.isoformat(),
        "updated_at": _now().isoformat(),
    }
    persisted = (
        supabase_admin.table("reporte_imagen_embeddings")
        .upsert(payload, on_conflict="animal_foto_id,modelo")
        .execute()
    )
    if persisted.data:
        return persisted.data[0]["id"]

    selected = (
        supabase_admin.table("reporte_imagen_embeddings")
        .select("id")
        .eq("animal_foto_id", animal_photo_id)
        .eq("modelo", result.model)
        .limit(1)
        .execute()
    )
    return selected.data[0]["id"] if selected.data else None


def _search_candidates(
    report_id: str,
    embedding: ClipEmbeddingResult,
) -> list[VisualSimilarityCandidate]:
    result = supabase_admin.rpc(
        "buscar_similitud_visual",
        {
            "p_embedding": embedding.embedding,
            "p_reporte_id": report_id,
            "p_modelo": embedding.model,
            "p_umbral": 0,
            "p_limite": _MAX_CANDIDATES,
        },
    ).execute()
    candidates: list[VisualSimilarityCandidate] = []
    for row in result.data or []:
        try:
            candidates.append(
                VisualSimilarityCandidate(
                    source=VisualSimilaritySource.report,
                    source_reference_id=row["embedding_id"],
                    report_id=row["reporte_id"],
                    animal_photo_id=row.get("animal_foto_id"),
                    similarity=row["similitud"],
                    model=row["modelo"],
                )
            )
        except (KeyError, TypeError, ValidationError):
            continue
    return candidates


def _replace_candidates(
    *,
    embedding_id: str,
    report_id: str,
    animal_photo_id: str,
    candidates: list[VisualSimilarityCandidate],
) -> None:
    (
        supabase_admin.table("reporte_imagen_coincidencias")
        .delete()
        .eq("embedding_consulta_id", embedding_id)
        .execute()
    )
    if not candidates:
        return

    thresholds = _thresholds()
    supabase_admin.table("reporte_imagen_coincidencias").insert(
        [
            {
                "embedding_consulta_id": embedding_id,
                "reporte_id": report_id,
                "animal_foto_id": animal_photo_id,
                "embedding_coincidente_id": candidate.source_reference_id,
                "reporte_coincidente_id": candidate.report_id,
                "animal_foto_coincidente_id": candidate.animal_photo_id,
                "similitud": candidate.similarity,
                "nivel": thresholds.classify(candidate.similarity).value,
                "modelo": candidate.model,
            }
            for candidate in candidates
        ]
    ).execute()


def analyze_visual_similarity(
    *,
    report_id: str,
    animal_photo_id: str,
    image_bytes: bytes,
    content_type: str,
) -> VisualSimilaritySearchResult:
    """Genera o reutiliza el embedding y conserva candidatos para auditoría."""
    existing = _existing_complete_embedding(animal_photo_id)
    if existing:
        embedding_id, embedding = existing
    else:
        embedding = get_clip_embedding(image_bytes, content_type)
        embedding_id = _persist_embedding(report_id, animal_photo_id, embedding)

    if embedding.status == ExternalSignalStatus.unavailable:
        return VisualSimilaritySearchResult(
            status=ExternalSignalStatus.unavailable,
            model=embedding.model,
            calculated_at=embedding.calculated_at,
            error_code=embedding.error_code,
        )
    if embedding_id is None:
        return VisualSimilaritySearchResult(
            status=ExternalSignalStatus.unavailable,
            model=embedding.model,
            calculated_at=_now(),
            error_code=ExternalSignalErrorCode.provider_error,
        )

    try:
        candidates = _search_candidates(report_id, embedding)
        _replace_candidates(
            embedding_id=embedding_id,
            report_id=report_id,
            animal_photo_id=animal_photo_id,
            candidates=candidates,
        )
    except Exception:
        return VisualSimilaritySearchResult(
            status=ExternalSignalStatus.unavailable,
            model=embedding.model,
            calculated_at=_now(),
            error_code=ExternalSignalErrorCode.provider_error,
        )

    return VisualSimilaritySearchResult(
        status=ExternalSignalStatus.complete,
        candidates=candidates,
        model=embedding.model,
        calculated_at=_now(),
    )
