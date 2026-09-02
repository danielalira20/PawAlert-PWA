"""Contratos HTTP para la navegacion privada de un caso asignado."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class NavigationMode(str, Enum):
    driving = "driving"
    cycling = "cycling"
    walking = "walking"


class NavigationStatus(str, Enum):
    complete = "complete"
    unavailable = "unavailable"


class NavigationErrorCode(str, Enum):
    assignment_not_confirmed = "assignment_not_confirmed"
    report_not_navigable = "report_not_navigable"
    navigation_access_revoked = "navigation_access_revoked"
    navigation_not_found = "navigation_not_found"
    invalid_origin = "invalid_origin"
    stale_origin = "stale_origin"
    low_accuracy_origin = "low_accuracy_origin"
    mode_unavailable = "mode_unavailable"
    provider_timeout = "provider_timeout"
    provider_error = "provider_error"
    no_route = "no_route"
    recalculation_rate_limited = "recalculation_rate_limited"


class NavigationOriginRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float | None = Field(default=None, gt=0)
    captured_at: datetime


class NavigationRouteRequest(BaseModel):
    origin: NavigationOriginRequest
    mode: NavigationMode = NavigationMode.driving
    known_destination_revision: str | None = Field(
        default=None,
        min_length=1,
        max_length=160,
    )


class NavigationOrigin(BaseModel):
    source: Literal["device_gps", "registered_origin"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float | None = Field(default=None, gt=0)
    captured_at: datetime | None = None


class NavigationDestination(BaseModel):
    source: Literal["validated_sighting", "initial_report"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    confirmed_at: datetime | None = None
    revision: str = Field(min_length=1)


class NavigationGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]] = Field(min_length=2)


class NavigationStep(BaseModel):
    type: str
    modifier: str | None = None
    street_name: str | None = None
    distance_meters: float = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    location: tuple[float, float]


class NavigationRouteData(BaseModel):
    duration_seconds: float = Field(ge=0)
    distance_meters: float = Field(ge=0)
    geometry: NavigationGeometry
    steps: list[NavigationStep] = Field(default_factory=list)


class NavigationCapabilitiesResponse(BaseModel):
    contract_version: Literal[1] = 1
    navigation_enabled: bool
    available_modes: list[NavigationMode]
    foreground_tracking: Literal[True] = True
    background_tracking: Literal[False] = False
    voice_guidance: Literal[False] = False
    live_traffic: Literal[False] = False


class NavigationRouteResponse(BaseModel):
    contract_version: Literal[1] = 1
    status: NavigationStatus
    report_id: str = Field(min_length=1)
    mode: NavigationMode
    available_modes: list[NavigationMode]
    origin: NavigationOrigin
    destination: NavigationDestination
    route: NavigationRouteData | None
    calculated_at: datetime
    expires_at: datetime | None = None
    source: Literal["osrm"] = "osrm"
    warnings: list[str] = Field(default_factory=list)
    error_code: NavigationErrorCode | None = None
    retryable: bool | None = None

    @model_validator(mode="after")
    def validate_status_payload(self):
        if self.status == NavigationStatus.complete:
            if self.route is None or self.error_code is not None:
                raise ValueError("Complete navigation requires route data")
            if self.expires_at is None:
                raise ValueError("Complete navigation requires an expiration")
            return self

        if self.route is not None or self.error_code is None:
            raise ValueError("Unavailable navigation requires an error code")
        if self.expires_at is not None:
            raise ValueError("Unavailable navigation cannot expire")
        return self
