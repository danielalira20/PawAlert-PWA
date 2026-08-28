"""Cliente tolerante a fallos para el optimizador VROOM.

Envoltorio delgado sobre la API real de VROOM -- mismo patron que
app/services/osrm_service.py (fail-open, reintento solo ante fallos
transitorios, error_code explicito, nunca propaga la excepcion del
proveedor). Los modelos de aqui son internos de este cliente, no un
contrato compartido entre capas -- a diferencia de RouteMatrixResult
(dispatch.py), nadie mas los consume todavia.

El body SIEMPRE debe incluir `matrices` con al menos un perfil (ej. `car`):
sin ella, VROOM intenta contactar un router en localhost:5000 que no existe
en este despliegue y falla con un error de conexion (code=3). El campo
singular `matrix` esta deprecado por `docs/contrato-adaptador-vroom.md` y no
existe en este cliente -- usar `matrices.car` con `durations`, `distances` y
`costs`. location_index (jobs) y start_index (vehicles) referencian
posiciones dentro de esa matriz -- nunca coordenadas crudas.

Antes de llamar al proveedor se valida, en este orden: tamano maximo del
lote (VROOM_MAX_LOCATIONS), dimensiones de las matrices (cuadradas y
consistentes entre perfiles) e indices de vehicles/jobs (no negativos y
dentro de rango). Cualquier fallo de estas validaciones cae de forma
controlada -- nunca se le manda a VROOM un payload que ya sabemos invalido.
"""

import logging
from datetime import datetime, timezone
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 2


class VroomJob(BaseModel):
    id: int
    location_index: int
    priority: int = 0
    delivery: list[int] = Field(default_factory=list)
    skills: list[int] = Field(default_factory=list)


class VroomVehicle(BaseModel):
    id: int
    start_index: int
    capacity: list[int] = Field(default_factory=list)
    skills: list[int] = Field(default_factory=list)


class VroomProfileMatrix(BaseModel):
    # VROOM (rapidjson) exige IsUint() por celda -- entero no negativo exacto
    # -- y responde 400 {"code":2,"error":"Invalid matrix entry."} ante
    # cualquier valor con parte fraccionaria (input_parser.cpp:get_matrix en
    # VROOM-Project/vroom). int en vez de float aqui hace que un valor sin
    # redondear (p.ej. una duracion real de OSRM como 312.7) falle en la
    # construccion de este modelo, localmente y con un error claro, en vez de
    # descubrirse recien en la respuesta HTTP del proveedor.
    durations: list[list[int]]
    distances: list[list[int]]
    costs: list[list[int]]


class VroomOptimizationRequest(BaseModel):
    vehicles: list[VroomVehicle] = Field(min_length=1)
    jobs: list[VroomJob] = Field(min_length=1)
    matrices: dict[str, VroomProfileMatrix]


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


def _square_matrix_size(matrix: list[list[float]], label: str) -> int:
    rows = len(matrix)
    if rows == 0:
        raise ValueError(f"{label} matrix cannot be empty")
    if any(len(row) != rows for row in matrix):
        raise ValueError(f"{label} matrix must be square")
    return rows


def validate_square_matrices(matrices: dict[str, VroomProfileMatrix]) -> None:
    """Cada perfil debe tener durations/distances/costs cuadradas y del
    mismo tamano entre si, y todos los perfiles del dict deben compartir ese
    mismo tamano -- VROOM usa un unico espacio de indices para todos los
    perfiles de una misma solicitud."""
    if not matrices:
        raise ValueError("VROOM request requires at least one profile matrix")

    reference_size: int | None = None
    reference_profile: str | None = None
    for profile_name, profile_matrix in matrices.items():
        durations_size = _square_matrix_size(
            profile_matrix.durations, f"Profile '{profile_name}' durations"
        )
        distances_size = _square_matrix_size(
            profile_matrix.distances, f"Profile '{profile_name}' distances"
        )
        costs_size = _square_matrix_size(
            profile_matrix.costs, f"Profile '{profile_name}' costs"
        )
        if distances_size != durations_size or costs_size != durations_size:
            raise ValueError(
                f"Profile '{profile_name}' durations, distances and costs "
                "must share the same size"
            )
        if reference_size is None:
            reference_size = durations_size
            reference_profile = profile_name
        elif durations_size != reference_size:
            raise ValueError(
                f"Profile '{profile_name}' size ({durations_size}) does not "
                f"match profile '{reference_profile}' size ({reference_size})"
            )


def validate_references(request: VroomOptimizationRequest) -> None:
    """vehicle.start_index y job.location_index deben ser no negativos y
    caer dentro del espacio de indices de la matriz cuadrada compartida por
    todos los perfiles de la solicitud."""
    matrix_size = len(next(iter(request.matrices.values())).durations)
    for vehicle in request.vehicles:
        if not 0 <= vehicle.start_index < matrix_size:
            raise ValueError(
                f"Vehicle {vehicle.id} start_index {vehicle.start_index} is "
                f"out of range for a matrix of size {matrix_size}"
            )
    for job in request.jobs:
        if not 0 <= job.location_index < matrix_size:
            raise ValueError(
                f"Job {job.id} location_index {job.location_index} is out "
                f"of range for a matrix of size {matrix_size}"
            )


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
    """Optimiza vehicles/jobs contra matrices ya calculadas; nunca propaga
    fallos del proveedor ni le manda un payload que ya sabemos invalido."""
    calculated_at = datetime.now(timezone.utc)

    combined_locations = len(request.vehicles) + len(request.jobs)
    if combined_locations > settings.vroom_max_locations:
        logger.warning(
            "Lote de despacho excede VROOM_MAX_LOCATIONS: %s locations "
            "(limite %s)",
            combined_locations,
            settings.vroom_max_locations,
        )
        return _unavailable("request_too_large", calculated_at)

    try:
        validate_square_matrices(request.matrices)
        validate_references(request)
    except ValueError as error:
        logger.warning(
            "Solicitud VROOM invalida antes de llamar al proveedor: %s", error
        )
        return _unavailable("invalid_request", calculated_at)

    if not settings.vroom_base_url.strip():
        return _unavailable("not_configured", calculated_at)

    last_error = "provider_error"
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            response = _request_optimization(request)
        except httpx.TimeoutException as error:
            last_error = "timeout"
            logger.warning(
                "VROOM no respondio a tiempo (intento %s/%s): %s: %s",
                attempt,
                _MAX_ATTEMPTS,
                type(error).__name__,
                error,
            )
            continue
        except httpx.HTTPError as error:
            last_error = "provider_error"
            logger.warning(
                "Fallo de conexion llamando a VROOM (intento %s/%s): %s: %s",
                attempt,
                _MAX_ATTEMPTS,
                type(error).__name__,
                error,
            )
            continue

        if response.status_code == 200:
            try:
                return _parse_payload(response.json(), calculated_at)
            except (ValueError, _InvalidPayload):
                return _unavailable("invalid_response", calculated_at)

        last_error = "provider_error"
        logger.warning(
            "VROOM respondio con status inesperado (intento %s/%s): %s -- "
            "cuerpo: %s",
            attempt,
            _MAX_ATTEMPTS,
            response.status_code,
            response.text,
        )

    return _unavailable(last_error, calculated_at)
