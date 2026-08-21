from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.models.visual_similarity import (
    ClipEmbeddingResult,
    VisualSimilarityCandidate,
    VisualSimilarityLevel,
    VisualSimilaritySearchResult,
    VisualSimilaritySource,
    VisualSimilarityThresholds,
)


NOW = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
EMBEDDING = [0.0] * 512


def test_complete_clip_requires_exactly_512_numeric_dimensions():
    result = ClipEmbeddingResult(
        status=ExternalSignalStatus.complete,
        embedding=EMBEDDING,
        model="openai/clip-vit-base-patch32",
        calculated_at=NOW,
    )
    assert result.dimensions == 512

    with pytest.raises(ValidationError, match="exactly 512"):
        ClipEmbeddingResult(
            status=ExternalSignalStatus.complete,
            embedding=[0.0] * 511,
            model="openai/clip-vit-base-patch32",
            calculated_at=NOW,
        )


def test_unavailable_clip_has_no_embedding_and_requires_reason():
    result = ClipEmbeddingResult(
        status=ExternalSignalStatus.unavailable,
        model="openai/clip-vit-base-patch32",
        calculated_at=NOW,
        error_code=ExternalSignalErrorCode.timeout,
    )
    assert result.embedding is None

    with pytest.raises(ValidationError):
        ClipEmbeddingResult(
            status=ExternalSignalStatus.unavailable,
            embedding=EMBEDDING,
            model="openai/clip-vit-base-patch32",
            calculated_at=NOW,
            error_code=ExternalSignalErrorCode.timeout,
        )


def test_report_candidate_requires_report_reference():
    candidate = VisualSimilarityCandidate(
        source=VisualSimilaritySource.report,
        source_reference_id="embedding-1",
        report_id="report-1",
        animal_photo_id="photo-1",
        similarity=0.95,
        model="openai/clip-vit-base-patch32",
    )
    assert candidate.similarity == 0.95

    with pytest.raises(ValidationError, match="report and photo ids"):
        VisualSimilarityCandidate(
            source=VisualSimilaritySource.report,
            source_reference_id="embedding-1",
            similarity=0.95,
            model="openai/clip-vit-base-patch32",
        )


def test_unavailable_search_cannot_return_candidates():
    candidate = VisualSimilarityCandidate(
        source=VisualSimilaritySource.report,
        source_reference_id="embedding-1",
        report_id="report-1",
        animal_photo_id="photo-1",
        similarity=0.95,
        model="openai/clip-vit-base-patch32",
    )
    with pytest.raises(ValidationError):
        VisualSimilaritySearchResult(
            status=ExternalSignalStatus.unavailable,
            candidates=[candidate],
            model="openai/clip-vit-base-patch32",
            calculated_at=NOW,
            error_code=ExternalSignalErrorCode.provider_error,
        )


def test_thresholds_classify_low_gray_and_high():
    thresholds = VisualSimilarityThresholds(gray=0.88, high=0.94)
    assert thresholds.classify(0.87) == VisualSimilarityLevel.low
    assert thresholds.classify(0.88) == VisualSimilarityLevel.gray
    assert thresholds.classify(0.94) == VisualSimilarityLevel.high

    with pytest.raises(ValidationError, match="lower"):
        VisualSimilarityThresholds(gray=0.95, high=0.94)
