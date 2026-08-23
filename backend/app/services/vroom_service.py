"""Cliente tolerante a fallos para el optimizador VROOM.

Envoltorio delgado sobre la API real de VROOM -- mismo patron que
app/services/osrm_service.py (fail-open, reintento solo ante fallos
transitorios, error_code explicito, nunca propaga la excepcion del
proveedor). Los modelos de aqui son internos de este cliente, no un
contrato compartido entre capas -- a diferencia de RouteMatrixResult
(dispatch.py), nadie mas los consume todavia.

El request SIEMPRE debe incluir `matrix` ya calculada: sin ella, VROOM
intenta contactar un router en localhost:5000 que no existe en este
despliegue y falla con un error de conexion (code=3). location_index
(jobs) y start_index (vehicles) referencian posiciones dentro de esa
matriz -- nunca coordenadas crudas.
"""

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 2

# Limite conservador de jobs por lote -- ajustable segun el tiempo de
# respuesta real observado en Railway con lotes grandes.
_MAX_VROOM_JOBS = 50


class VroomJob(BaseModel):
    id: int
    location_index: int
    priority: int = 0
    skills: list[int] = Field(default_factory=list)


class VroomVehicle(BaseModel):
    id: int
    start_index: int
    skills: list[int] = Field(default_factory=list)


class VroomOptimizationRequest(BaseModel):
    vehicles: list[VroomVehicle] = Field(min_length=1)
    jobs: list[VroomJob] = Field(min_length=1)
    matrix: list[list[float]]


class VroomRouteStep(BaseModel):
    type: Literal["start", "job", "end"]
    location_index: int
    job_id: int | None = None
    arrival: int


class VroomRoute(BaseModel):
    vehicle_id: int
    steps: list[VroomRouteStep]


class VroomOptimizationResult(BaseModel):
    status: Literal["complete", "unavailable"]
    routes: list[VroomRoute] = Field(default_factory=list)
    unassigned_job_ids: list[int] = Field(default_factory=list)
    error_code: str | None = None
    calculated_at: datetime


class _InvalidPayload(Exception):
    pass


def _unavailable(error_code: str, calculated_at: datetime) -> VroomOptimizationResult:
    return VroomOptimizationResult(
        status="unavailable",
        error_code=error_code,
        calculated_at=calculated_at,
    )


def _request_optimization(request: VroomOptimizationRequest) -> httpx.Response:
    base_url = settings.vroom_base_url.rstrip("/")
    return httpx.post(
        base_url,
        json=request.model_dump(),
        timeout=settings.vroom_timeout_seconds,
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


def _parse_route(raw: object) -> VroomRoute:
    if not isinstance(raw, dict):
        raise _InvalidPayload
    try:
        steps_raw = raw["steps"]
        if not isinstance(steps_raw, list):
            raise _InvalidPayload
        return VroomRoute(
            vehicle_id=raw["vehicle"],
            steps=[_parse_step(step) for step in steps_raw],
        )
    except (KeyError, TypeError, ValueError):
        raise _InvalidPayload from None


def _parse_payload(
    payload: object, calculated_at: datetime
) -> VroomOptimizationResult:
    if not isinstance(payload, dict):
        raise _InvalidPayload

    code = payload.get("code")
    if not isinstance(code, int) or isinstance(code, bool):
        raise _InvalidPayload

    if code != 0:
        logger.warning(
            "VROOM devolvio un error logico (code=%s): %s",
            code,
            payload.get("error"),
        )
        return _unavailable("logical_error", calculated_at)

    try:
        routes_raw = payload["routes"]
        if not isinstance(routes_raw, list):
            raise _InvalidPayload
        routes = [_parse_route(route) for route in routes_raw]

        unassigned_raw = payload.get("unassigned") or []
        if not isinstance(unassigned_raw, list):
            raise _InvalidPayload
        unassigned_job_ids = [
            item["id"]
            for item in unassigned_raw
            if isinstance(item, dict) and "id" in item
        ]

        return VroomOptimizationResult(
            status="complete",
            routes=routes,
            unassigned_job_ids=unassigned_job_ids,
            calculated_at=calculated_at,
        )
    except (KeyError, TypeError, ValueError):
        raise _InvalidPayload from None


def get_optimization(
    request: VroomOptimizationRequest,
) -> VroomOptimizationResult:
    """Optimiza vehicles/jobs contra una matriz ya calculada; nunca
    propaga fallos del proveedor."""
    calculated_at = datetime.now(timezone.utc)
    if len(request.jobs) > _MAX_VROOM_JOBS:
        return _unavailable("request_too_large", calculated_at)
    if not settings.vroom_base_url.strip():
        return _unavailable("not_configured", calculated_at)

    last_error = "provider_error"
    for _attempt in range(_MAX_ATTEMPTS):
        try:
            response = _request_optimization(request)
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

        last_error = "provider_error"

    return _unavailable(last_error, calculated_at)
