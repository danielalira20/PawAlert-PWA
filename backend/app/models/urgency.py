from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ExternalSignalStatus(str, Enum):
    complete = "complete"
    cached = "cached"
    stale_cache = "stale_cache"
    unavailable = "unavailable"


class ExternalSignalErrorCode(str, Enum):
    not_configured = "not_configured"
    timeout = "timeout"
    unauthorized = "unauthorized"
    rate_limited = "rate_limited"
    provider_error = "provider_error"
    invalid_response = "invalid_response"
    no_data = "no_data"


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class WeatherResult(BaseModel):
    score: int | None = None
    status: ExternalSignalStatus
    temperature_c: float | None = None
    precipitation_mm_h: float | None = Field(default=None, ge=0)
    condition_code: int | None = Field(default=None, ge=0)
    observed_at: datetime | None = None
    evaluated_at: datetime
    source: Literal["openweather"] = "openweather"
    error_code: ExternalSignalErrorCode | None = None

    @model_validator(mode="after")
    def validate_availability(self):
        if self.status == ExternalSignalStatus.unavailable:
            if self.score is not None:
                raise ValueError("Unavailable weather cannot include a score")
            if self.error_code is None:
                raise ValueError("Unavailable weather requires an error code")
            return self

        if self.score not in (0, 50, 100):
            raise ValueError("Weather score must be 0, 50 or 100")
        if self.observed_at is None:
            raise ValueError("Available weather requires an observation date")
        if self.error_code is not None:
            raise ValueError("Available weather cannot include an error code")
        return self


RoadType = Literal["primary", "trunk", "motorway"]


class RoadRiskResult(BaseModel):
    score: int | None = None
    status: ExternalSignalStatus
    road_type: RoadType | None = None
    distance_m: float | None = Field(default=None, ge=0, le=50)
    calculated_at: datetime
    source: Literal["osm"] = "osm"
    error_code: ExternalSignalErrorCode | None = None

    @model_validator(mode="after")
    def validate_availability(self):
        if self.status == ExternalSignalStatus.unavailable:
            if self.score is not None:
                raise ValueError("Unavailable road risk cannot include a score")
            if self.error_code is None:
                raise ValueError("Unavailable road risk requires an error code")
            if self.road_type is not None or self.distance_m is not None:
                raise ValueError("Unavailable road risk cannot claim a nearby road")
            return self

        if self.score not in (0, 100):
            raise ValueError("Road risk score must be 0 or 100")
        if self.error_code is not None:
            raise ValueError("Available road risk cannot include an error code")
        if self.score == 100 and (
            self.road_type is None or self.distance_m is None
        ):
            raise ValueError("Road risk 100 requires road type and distance")
        if self.score == 0 and (
            self.road_type is not None or self.distance_m is not None
        ):
            raise ValueError("Road risk 0 cannot include a nearby road")
        return self


class DuplicateSearchInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    created_at: datetime
    species: list[str] = Field(min_length=1)
    quantity: int = Field(ge=1)
    report_id: str | None = None

    @model_validator(mode="after")
    def normalize_species(self):
        normalized = list(
            dict.fromkeys(item.strip().lower() for item in self.species if item.strip())
        )
        if not normalized:
            raise ValueError("At least one valid species is required")
        self.species = normalized
        return self


class DuplicateCandidate(BaseModel):
    possible_duplicate: Literal[True] = True
    existing_report_id: str = Field(min_length=1)
    distance_m: float = Field(ge=0, le=150)
    time_difference_minutes: float = Field(ge=0, le=120)
    shared_species: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def normalize_shared_species(self):
        normalized = list(
            dict.fromkeys(
                item.strip().lower() for item in self.shared_species if item.strip()
            )
        )
        if not normalized:
            raise ValueError("A duplicate candidate requires a shared species")
        self.shared_species = normalized
        return self
