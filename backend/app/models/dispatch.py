"""Contratos entre matching, ruteo, ubicacion y coordinacion asincrona."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


# Esta es la formula vigente y aprobada. Urgency ordena casos para despacho,
# pero no sustituye ninguno de estos componentes del score del voluntario.
MATCHING_WEIGHTS = {
    "proximidad": 0.30,
    "disponibilidad": 0.25,
    "experiencia": 0.20,
    "movilidad": 0.15,
    "carga": 0.10,
}


class RoutingPoint(BaseModel):
    id: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteMatrixRequest(BaseModel):
    origins: list[RoutingPoint] = Field(min_length=1)
    destinations: list[RoutingPoint] = Field(min_length=1)


class RouteRequest(BaseModel):
    origin: RoutingPoint
    destination: RoutingPoint


class RoutingStatus(str, Enum):
    complete = "complete"
    unavailable = "unavailable"


class RoutingErrorCode(str, Enum):
    not_configured = "not_configured"
    timeout = "timeout"
    provider_error = "provider_error"
    invalid_response = "invalid_response"
    no_route = "no_route"
    request_too_large = "request_too_large"
    missing_coordinates = "missing_coordinates"


class RouteMatrixResult(BaseModel):
    origin_ids: list[str] = Field(min_length=1)
    destination_ids: list[str] = Field(min_length=1)
    durations_seconds: list[list[float | None]]
    distances_meters: list[list[float | None]]
    status: RoutingStatus
    calculated_at: datetime
    source: Literal["osrm"] = "osrm"
    error_code: RoutingErrorCode | None = None

    @model_validator(mode="after")
    def validate_matrix_dimensions(self):
        rows = len(self.origin_ids)
        columns = len(self.destination_ids)
        matrices = (self.durations_seconds, self.distances_meters)

        if len(set(self.origin_ids)) != rows:
            raise ValueError("Route matrix origins must be unique")
        if len(set(self.destination_ids)) != columns:
            raise ValueError("Route matrix destinations must be unique")

        if self.status == RoutingStatus.unavailable:
            if self.error_code is None:
                raise ValueError("Unavailable routing requires an error code")
            if any(matrix for matrix in matrices):
                raise ValueError("Unavailable routing cannot include matrices")
            return self

        if self.error_code is not None:
            raise ValueError("Complete routing cannot include an error code")
        if any(len(matrix) != rows for matrix in matrices):
            raise ValueError("Route matrix row count does not match origins")
        if any(
            len(row) != columns
            for matrix in matrices
            for row in matrix
        ):
            raise ValueError("Route matrix column count does not match destinations")
        if any(
            value is not None and value < 0
            for matrix in matrices
            for row in matrix
            for value in row
        ):
            raise ValueError("Route matrix values cannot be negative")
        return self


class RouteGeometryPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteResult(BaseModel):
    origin_id: str = Field(min_length=1)
    destination_id: str = Field(min_length=1)
    duration_seconds: float | None = Field(default=None, ge=0)
    distance_meters: float | None = Field(default=None, ge=0)
    geometry: list[RouteGeometryPoint] = Field(default_factory=list)
    status: RoutingStatus
    calculated_at: datetime
    source: Literal["osrm"] = "osrm"
    error_code: RoutingErrorCode | None = None

    @model_validator(mode="after")
    def validate_route_availability(self):
        if self.status == RoutingStatus.unavailable:
            if self.error_code is None:
                raise ValueError("Unavailable route requires an error code")
            if (
                self.duration_seconds is not None
                or self.distance_meters is not None
                or self.geometry
            ):
                raise ValueError("Unavailable route cannot include route data")
            return self

        if self.error_code is not None:
            raise ValueError("Complete route cannot include an error code")
        if self.duration_seconds is None or self.distance_meters is None:
            raise ValueError("Complete route requires duration and distance")
        if len(self.geometry) < 2:
            raise ValueError("Complete route requires a usable geometry")
        return self


UrgencyLevel = Literal["verde", "amarillo", "rojo"]


class DispatchUrgency(BaseModel):
    score: float = Field(ge=0, le=100)
    level: UrgencyLevel
    calculated_at: datetime


class DispatchJob(BaseModel):
    report_id: str = Field(min_length=1)
    location: RoutingPoint
    urgency: DispatchUrgency
    service_seconds: int = Field(default=1800, ge=0)
    required_skills: list[str] = Field(default_factory=list)


class DispatchVolunteer(BaseModel):
    volunteer_id: str = Field(min_length=1)
    location: RoutingPoint
    matching_score: float = Field(ge=0, le=100)
    capacity: int = Field(ge=1)
    current_load: int = Field(ge=0)
    skills: list[str] = Field(default_factory=list)
    role: Literal["voluntario_interno", "voluntario_externo"]
    offered_report_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_external_offer(self):
        if self.role == "voluntario_externo" and not self.offered_report_ids:
            raise ValueError(
                "External volunteers require at least one explicit offer"
            )
        if self.current_load >= self.capacity:
            raise ValueError("Volunteer has no available operational capacity")
        return self


class DispatchCandidate(BaseModel):
    report_id: str = Field(min_length=1)
    volunteer_id: str = Field(min_length=1)
    matching_score: float = Field(ge=0, le=100)
    offered: bool = False


class DispatchOptimizationRequest(BaseModel):
    jobs: list[DispatchJob] = Field(min_length=1)
    volunteers: list[DispatchVolunteer] = Field(min_length=1)
    candidates: list[DispatchCandidate] = Field(min_length=1)
    travel_matrix: RouteMatrixResult

    @model_validator(mode="after")
    def validate_dispatch_references(self):
        report_ids = {job.report_id for job in self.jobs}
        volunteers_by_id = {
            volunteer.volunteer_id: volunteer
            for volunteer in self.volunteers
        }
        if len(report_ids) != len(self.jobs):
            raise ValueError("Dispatch jobs must be unique")
        if len(volunteers_by_id) != len(self.volunteers):
            raise ValueError("Dispatch volunteers must be unique")
        if set(self.travel_matrix.destination_ids) != report_ids:
            raise ValueError("Route destinations must match dispatch jobs")
        if set(self.travel_matrix.origin_ids) != set(volunteers_by_id):
            raise ValueError("Route origins must match dispatch volunteers")

        candidate_reports = {candidate.report_id for candidate in self.candidates}
        if not candidate_reports.issubset(report_ids):
            raise ValueError("Candidate references an unknown report")
        candidate_pairs = {
            (candidate.report_id, candidate.volunteer_id)
            for candidate in self.candidates
        }
        if len(candidate_pairs) != len(self.candidates):
            raise ValueError("Dispatch candidates must be unique per report")
        for candidate in self.candidates:
            volunteer = volunteers_by_id.get(candidate.volunteer_id)
            if volunteer is None:
                raise ValueError("Candidate references an unknown volunteer")
            if volunteer.role == "voluntario_externo":
                if not candidate.offered:
                    raise ValueError("External candidate requires an explicit offer")
                if candidate.report_id not in volunteer.offered_report_ids:
                    raise ValueError("External offer does not match candidate report")
        for volunteer in self.volunteers:
            if volunteer.role == "voluntario_externo" and not set(
                volunteer.offered_report_ids
            ).issubset(report_ids):
                raise ValueError("External offer references an unknown report")
        return self


class DispatchPreparationStatus(str, Enum):
    ready = "ready"
    unavailable = "unavailable"


class DispatchPreparationErrorCode(str, Enum):
    report_not_operational = "report_not_operational"
    urgency_unavailable = "urgency_unavailable"
    no_candidates = "no_candidates"
    missing_coordinates = "missing_coordinates"
    routing_unavailable = "routing_unavailable"
    invalid_candidate_data = "invalid_candidate_data"
    data_source_error = "data_source_error"


class DispatchPreparationResult(BaseModel):
    status: DispatchPreparationStatus
    prepared_at: datetime
    request: DispatchOptimizationRequest | None = None
    error_code: DispatchPreparationErrorCode | None = None

    @model_validator(mode="after")
    def validate_preparation_result(self):
        if self.status == DispatchPreparationStatus.ready:
            if self.request is None or self.error_code is not None:
                raise ValueError("Ready preparation requires only a request")
        elif self.request is not None or self.error_code is None:
            raise ValueError("Unavailable preparation requires only an error")
        return self


class DispatchAssignment(BaseModel):
    report_id: str = Field(min_length=1)
    volunteer_id: str = Field(min_length=1)
    arrival_seconds: int = Field(ge=0)
    distance_meters: float = Field(ge=0)


class DispatchOptimizationResult(BaseModel):
    assignments: list[DispatchAssignment] = Field(default_factory=list)
    unassigned_report_ids: list[str] = Field(default_factory=list)
    source: Literal["vroom", "local_fallback"]
    calculated_at: datetime


class LocationSource(str, Enum):
    reporte_inicial = "reporte_inicial"
    confirmacion_reportante = "confirmacion_reportante"
    voluntario_asignado = "voluntario_asignado"
    voluntario_verificado = "voluntario_verificado"
    asociacion = "asociacion"
    administracion = "administracion"


class ObservedMobility(str, Enum):
    sin_movimiento = "sin_movimiento"
    limitada = "limitada"
    normal = "normal"
    corrio_se_alejo = "corrio_se_alejo"
    desconocida = "desconocida"


class ConfirmedReportLocation(BaseModel):
    report_id: str = Field(min_length=1)
    location: RoutingPoint
    confirmed_at: datetime
    source: LocationSource
    observed_mobility: ObservedMobility


class CoordinationEvent(str, Enum):
    ubicacion_confirmada = "ubicacion_confirmada"
    urgency_recalculada = "urgency_recalculada"
    matriz_ruta_calculada = "matriz_ruta_calculada"
    matching_optimizado = "matching_optimizado"
    nuevo_caso_cercano = "nuevo_caso_cercano"
    nueva_propuesta = "nueva_propuesta"
    propuesta_vencida = "propuesta_vencida"
    lista_espera_activada = "lista_espera_activada"
    actividad_voluntario_pendiente = "actividad_voluntario_pendiente"
    caso_liberado_por_inactividad = "caso_liberado_por_inactividad"


class AvistamientoCreate(BaseModel):
    animal_id: str = Field(min_length=1)
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)
    precision_metros: float | None = Field(default=None, ge=0)
    observado_at: datetime
    movilidad_observada: ObservedMobility | None = None
    direccion_observada: str | None = None
    comentario: str | None = None


class AvistamientoResult(BaseModel):
    id: str
    reporte_id: str
    animal_id: str
    fuente: LocationSource
    estado_validacion: Literal["pendiente", "validado", "rechazado"]
    registrado_at: datetime
