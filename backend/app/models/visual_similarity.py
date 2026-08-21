"""Contratos de la señal antifraude de similitud visual."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus


CLIP_EMBEDDING_DIMENSIONS = 512
DEFAULT_CLIP_MODEL = "openai/clip-vit-base-patch32"


class VisualSimilarityLevel(str, Enum):
    low = "low"
    gray = "gray"
    high = "high"


class VisualSimilaritySource(str, Enum):
    report = "report"
    external_catalog = "external_catalog"


class ClipEmbeddingResult(BaseModel):
    status: ExternalSignalStatus
    embedding: list[float] | None = None
    model: str = Field(min_length=1)
    dimensions: Literal[512] = CLIP_EMBEDDING_DIMENSIONS
    calculated_at: datetime
    source: Literal["huggingface"] = "huggingface"
    error_code: ExternalSignalErrorCode | None = None

    @model_validator(mode="after")
    def validate_availability(self):
        if self.status == ExternalSignalStatus.unavailable:
            if self.embedding is not None:
                raise ValueError("Unavailable CLIP cannot include an embedding")
            if self.error_code is None:
                raise ValueError("Unavailable CLIP requires an error code")
            return self

        if self.status != ExternalSignalStatus.complete:
            raise ValueError("CLIP embeddings only support complete or unavailable")
        if self.embedding is None:
            raise ValueError("Complete CLIP requires an embedding")
        if len(self.embedding) != CLIP_EMBEDDING_DIMENSIONS:
            raise ValueError("CLIP embedding must have exactly 512 dimensions")
        if not all(isinstance(value, (int, float)) for value in self.embedding):
            raise ValueError("CLIP embedding must contain only numeric values")
        if self.error_code is not None:
            raise ValueError("Complete CLIP cannot include an error code")
        return self


class VisualSimilarityCandidate(BaseModel):
    source: VisualSimilaritySource
    source_reference_id: str = Field(min_length=1)
    report_id: str | None = None
    animal_photo_id: str | None = None
    similarity: float = Field(ge=0, le=1)
    model: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_source_reference(self):
        if self.source == VisualSimilaritySource.report and not self.report_id:
            raise ValueError("Report similarity requires a report id")
        if self.source == VisualSimilaritySource.external_catalog and self.report_id:
            raise ValueError("External catalog similarity cannot claim a report")
        return self


class VisualSimilaritySearchResult(BaseModel):
    status: ExternalSignalStatus
    candidates: list[VisualSimilarityCandidate] = Field(default_factory=list)
    model: str = Field(min_length=1)
    calculated_at: datetime
    error_code: ExternalSignalErrorCode | None = None

    @model_validator(mode="after")
    def validate_availability(self):
        if self.status == ExternalSignalStatus.unavailable:
            if self.candidates:
                raise ValueError("Unavailable similarity cannot include candidates")
            if self.error_code is None:
                raise ValueError("Unavailable similarity requires an error code")
            return self

        if self.status != ExternalSignalStatus.complete:
            raise ValueError("Similarity search only supports complete or unavailable")
        if self.error_code is not None:
            raise ValueError("Complete similarity cannot include an error code")
        return self


class VisualSimilarityThresholds(BaseModel):
    gray: float = Field(default=0.88, ge=0, le=1)
    high: float = Field(default=0.94, ge=0, le=1)

    @model_validator(mode="after")
    def validate_order(self):
        if self.gray >= self.high:
            raise ValueError("Gray threshold must be lower than high threshold")
        return self

    def classify(self, similarity: float) -> VisualSimilarityLevel:
        if not 0 <= similarity <= 1:
            raise ValueError("Similarity must be between 0 and 1")
        if similarity >= self.high:
            return VisualSimilarityLevel.high
        if similarity >= self.gray:
            return VisualSimilarityLevel.gray
        return VisualSimilarityLevel.low
