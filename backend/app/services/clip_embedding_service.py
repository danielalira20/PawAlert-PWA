"""Cliente tolerante a fallos para un Inference Endpoint CLIP privado."""

from __future__ import annotations

import base64
import math
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.models.visual_similarity import (
    CLIP_EMBEDDING_DIMENSIONS,
    ClipEmbeddingResult,
)


_MAX_ATTEMPTS = 2
_SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


class _InvalidPayload(Exception):
    pass


def _unavailable(
    error_code: ExternalSignalErrorCode, calculated_at: datetime
) -> ClipEmbeddingResult:
    return ClipEmbeddingResult(
        status=ExternalSignalStatus.unavailable,
        model=settings.clip_model,
        calculated_at=calculated_at,
        error_code=error_code,
    )


def _error_code_for_status(status_code: int) -> ExternalSignalErrorCode:
    if status_code in (401, 403):
        return ExternalSignalErrorCode.unauthorized
    if status_code == 429:
        return ExternalSignalErrorCode.rate_limited
    return ExternalSignalErrorCode.provider_error


def _normalize(values: object) -> list[float]:
    if not isinstance(values, list) or len(values) != CLIP_EMBEDDING_DIMENSIONS:
        raise _InvalidPayload
    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        for value in values
    ):
        raise _InvalidPayload

    numeric = [float(value) for value in values]
    norm = math.sqrt(sum(value * value for value in numeric))
    if norm == 0:
        raise _InvalidPayload
    return [value / norm for value in numeric]


def _parse_payload(payload: object, calculated_at: datetime) -> ClipEmbeddingResult:
    if not isinstance(payload, dict):
        raise _InvalidPayload
    embedding = _normalize(payload.get("embedding"))
    return ClipEmbeddingResult(
        status=ExternalSignalStatus.complete,
        embedding=embedding,
        model=settings.clip_model,
        calculated_at=calculated_at,
    )


def _request_embedding(image_bytes: bytes, content_type: str) -> httpx.Response:
    return httpx.post(
        settings.clip_endpoint_url,
        headers={
            "Authorization": f"Bearer {settings.huggingface_token}",
            "Content-Type": "application/json",
        },
        json={
            "inputs": base64.b64encode(image_bytes).decode("ascii"),
            "content_type": content_type,
        },
        timeout=settings.clip_timeout_seconds,
    )


def _generate_clip_embedding(
    image_bytes: bytes,
    content_type: str,
    *,
    require_enabled: bool,
) -> ClipEmbeddingResult:
    calculated_at = datetime.now(timezone.utc)
    if not image_bytes:
        return _unavailable(ExternalSignalErrorCode.no_data, calculated_at)
    if content_type not in _SUPPORTED_CONTENT_TYPES:
        return _unavailable(ExternalSignalErrorCode.invalid_response, calculated_at)
    if (
        (require_enabled and not settings.clip_validation_enabled)
        or not settings.huggingface_token.strip()
        or not settings.clip_endpoint_url.strip()
    ):
        return _unavailable(ExternalSignalErrorCode.not_configured, calculated_at)

    last_error = ExternalSignalErrorCode.provider_error
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_embedding(image_bytes, content_type)
        except httpx.TimeoutException:
            last_error = ExternalSignalErrorCode.timeout
            continue
        except httpx.HTTPError:
            last_error = ExternalSignalErrorCode.provider_error
            continue

        if response.status_code == 200:
            try:
                return _parse_payload(response.json(), calculated_at)
            except (ValueError, _InvalidPayload):
                return _unavailable(
                    ExternalSignalErrorCode.invalid_response, calculated_at
                )

        last_error = _error_code_for_status(response.status_code)
        if last_error == ExternalSignalErrorCode.unauthorized:
            break

    return _unavailable(last_error, calculated_at)


def get_clip_embedding(image_bytes: bytes, content_type: str) -> ClipEmbeddingResult:
    """Genera un embedding normalizado sin propagar fallos del proveedor."""
    return _generate_clip_embedding(
        image_bytes,
        content_type,
        require_enabled=True,
    )


def probe_clip_embedding(image_bytes: bytes, content_type: str) -> ClipEmbeddingResult:
    """Comprueba el proveedor sin habilitar CLIP para reportes reales."""
    return _generate_clip_embedding(
        image_bytes,
        content_type,
        require_enabled=False,
    )
