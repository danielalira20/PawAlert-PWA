"""Cliente HTTP tolerante a fallos para una instancia propia de VROOM."""

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx
from pydantic import BaseModel, Field, model_validator

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 2
_MAX_JOBS = 50

VroomErrorCode = Literal[
    "not_configured",
    "request_too_large",
    "timeout",
    "provider_error",
    "logical_error",
    "invalid_response",
]


class VroomJob(BaseModel):
    id: int = Field(ge=1)
    location_index: int = Field(ge=0)
    service: int = Field(default=0, ge=0)
    priority: int = Field(default=0, ge=0, le=100)
    delivery: list[int] = Field(default_factory=list)
    skills: list[int] = Field(default_factory=list)


class VroomVehicle(BaseModel):
    id: int = Field(ge=1)
    start_index: int = Field(ge=0)
    capacity: list[int] = Field(default_factory=list)
    skills: list[int] = Field(default_factory=list)
    profile: str = Field(default="car", min_length=1)


class VroomProfileMatrix(BaseModel):
    durations: list[list[int]] = Field(min_length=1)
    distances: list[list[int]] | None = None
    costs: list[list[int]] | None = None

    @model_validator(mode="after")
    def validate_square_matrices(self):
        size = len(self.durations)
        matrices = [self.durations]
        if self.distances is not None:
            matrices.append(self.distances)
        if self.costs is not None:
            matrices.append(self.costs)

        if any(len(matrix) != size for matrix in matrices):
            raise ValueError("VROOM matrices must have the same dimensions")
        if any(len(row) != size for matrix in matrices for row in matrix):
            raise ValueError("VROOM matrices must be square")
        if any(value < 0 for matrix in matrices for row in matrix for value in row):
            raise ValueError("VROOM matrix values cannot be negative")
        return self


class VroomOptimizationRequest(BaseModel):
    vehicles: list[VroomVehicle] = Field(min_length=1)
    jobs: list[VroomJob] = Field(min_length=1)
    matrices: dict[str, VroomProfileMatrix] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_references(self):
        if len({vehicle.id for vehicle in self.vehicles}) != len(self.vehicles):
            raise ValueError("VROOM vehicle ids must be unique")
        if len({job.id for job in self.jobs}) != len(self.jobs):
            raise ValueError("VROOM job ids must be unique")

        for vehicle in self.vehicles:
            matrix = self.matrices.get(vehicle.profile)
            if matrix is None:
                raise ValueError("Every vehicle profile requires a custom matrix")
            if vehicle.start_index >= len(matrix.durations):
                raise ValueError("Vehicle start index is outside its matrix")

        required_size = max(job.location_index for job in self.jobs) + 1
        for matrix in self.matrices.values():
            if required_size > len(matrix.durations):
                raise ValueError("Job location index is outside the matrix")
        return self


class VroomRouteStep(BaseModel):
    type: Literal["start", "job", "end"]
    location_index: int = Field(ge=0)
    job_id: int | None = None
    arrival: int = Field(ge=0)


class VroomRoute(BaseModel):
    vehicle_id: int
    steps: list[VroomRouteStep]


class VroomOptimizationResult(BaseModel):
    status: Literal["complete", "unavailable"]
    routes: list[VroomRoute] = Field(default_factory=list)
    unassigned_job_ids: list[int] = Field(default_factory=list)
    error_code: VroomErrorCode | None = None
    calculated_at: datetime

    @model_validator(mode="after")
    def validate_result(self):
        if self.status == "complete" and self.error_code is not None:
            raise ValueError("Complete VROOM result cannot include an error")
        if self.status == "unavailable" and self.error_code is None:
            raise ValueError("Unavailable VROOM result requires an error")
        return self


class _InvalidPayload(Exception):
    pass


def _unavailable(
    error_code: VroomErrorCode,
    calculated_at: datetime,
) -> VroomOptimizationResult:
    return VroomOptimizationResult(
        status="unavailable",
        error_code=error_code,
        calculated_at=calculated_at,
    )


def _parse_step(raw: object) -> VroomRouteStep:
    if not isinstance(raw, dict):
        raise _InvalidPayload
    step_type = raw.get("type")
    if step_type not in ("start", "job", "end"):
        raise _InvalidPayload
    try:
        return VroomRouteStep(
            type=step_type,
            location_index=raw["location_index"],
            job_id=raw.get("id") if step_type == "job" else None,
            arrival=raw["arrival"],
        )
    except (KeyError, TypeError, ValueError):
        raise _InvalidPayload from None


def _parse_payload(
    payload: object,
    calculated_at: datetime,
) -> VroomOptimizationResult:
    if not isinstance(payload, dict):
        raise _InvalidPayload

    code = payload.get("code")
    if not isinstance(code, int) or isinstance(code, bool):
        raise _InvalidPayload
    if code != 0:
        logger.warning("VROOM devolvio un error logico (code=%s)", code)
        return _unavailable("logical_error", calculated_at)

    routes_raw = payload.get("routes")
    if not isinstance(routes_raw, list):
        raise _InvalidPayload

    routes: list[VroomRoute] = []
    try:
        for raw_route in routes_raw:
            if not isinstance(raw_route, dict) or not isinstance(
                raw_route.get("steps"), list
            ):
                raise _InvalidPayload
            routes.append(
                VroomRoute(
                    vehicle_id=raw_route["vehicle"],
                    steps=[_parse_step(step) for step in raw_route["steps"]],
                )
            )

        unassigned_raw = payload.get("unassigned") or []
        if not isinstance(unassigned_raw, list):
            raise _InvalidPayload
        unassigned_job_ids = [
            item["id"]
            for item in unassigned_raw
            if isinstance(item, dict) and isinstance(item.get("id"), int)
        ]
    except (KeyError, TypeError, ValueError):
        raise _InvalidPayload from None

    return VroomOptimizationResult(
        status="complete",
        routes=routes,
        unassigned_job_ids=unassigned_job_ids,
        calculated_at=calculated_at,
    )


def get_optimization(
    request: VroomOptimizationRequest,
) -> VroomOptimizationResult:
    """Solicita una optimizacion sin propagar fallos del proveedor."""
    calculated_at = datetime.now(timezone.utc)
    if len(request.jobs) > _MAX_JOBS:
        return _unavailable("request_too_large", calculated_at)

    base_url = settings.vroom_base_url.strip().rstrip("/")
    if not base_url:
        return _unavailable("not_configured", calculated_at)

    last_error: VroomErrorCode = "provider_error"
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = httpx.post(
                base_url,
                json=request.model_dump(mode="json", exclude_none=True),
                timeout=settings.vroom_timeout_seconds,
            )
        except httpx.TimeoutException:
            last_error = "timeout"
            continue
        except httpx.HTTPError:
            last_error = "provider_error"
            continue

        if response.status_code == 200:
            try:
                return _parse_payload(response.json(), calculated_at)
            except (ValueError, _InvalidPayload):
                return _unavailable("invalid_response", calculated_at)

        if response.status_code == 429 or response.status_code >= 500:
            last_error = "provider_error"
            continue
        return _unavailable("provider_error", calculated_at)

    return _unavailable(last_error, calculated_at)
