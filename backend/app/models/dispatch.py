"""Contratos entre matching, ruteo, ubicacion y coordinacion asincrona."""

import math
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

DEFAULT_VROOM_CANDIDATE_WINDOW_MINUTES = 5
DEFAULT_VROOM_SECONDARY_MAX_ETA_MINUTES = 30


class RoutingPoint(BaseModel):
    id: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteMatrixRequest(BaseModel):
    origins: list[RoutingPoint] = Field(min_length=1)
    destinations: list[RoutingPoint] = Field(min_length=1)


class RoutingMode(str, Enum):
    driving = "driving"
    cycling = "cycling"
    walking = "walking"


class RouteRequest(BaseModel):
    origin: RoutingPoint
    destination: RoutingPoint
    mode: RoutingMode = RoutingMode.driving
    include_steps: bool = False


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
            value is not None and (not math.isfinite(value) or value < 0)
            for matrix in matrices
            for row in matrix
            for value in row
        ):
            raise ValueError(
                "Route matrix values must be finite and nonnegative"
            )
        return self


class RouteGeometryPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteStep(BaseModel):
    type: str = Field(min_length=1)
    modifier: str | None = None
    street_name: str | None = None
    distance_meters: float = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    location: tuple[float, float]

    @model_validator(mode="after")
    def validate_location(self):
        longitude, latitude = self.location
        if not (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180 <= longitude <= 180
            and -90 <= latitude <= 90
        ):
            raise ValueError("Route step requires a valid lon/lat location")
        return self


class RouteResult(BaseModel):
    origin_id: str = Field(min_length=1)
    destination_id: str = Field(min_length=1)
    duration_seconds: float | None = Field(default=None, ge=0)
    distance_meters: float | None = Field(default=None, ge=0)
    geometry: list[RouteGeometryPoint] = Field(default_factory=list)
    steps: list[RouteStep] = Field(default_factory=list)
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
                or self.steps
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
        if len(set(self.offered_report_ids)) != len(self.offered_report_ids):
            raise ValueError("External offers must be unique per report")
        if self.role == "voluntario_interno" and self.offered_report_ids:
            raise ValueError("Internal volunteers cannot contain external offers")
        if self.current_load >= self.capacity:
            raise ValueError("Volunteer has no available operational capacity")
        return self


class CandidateRouteTier(str, Enum):
    primary = "primary"
    secondary = "secondary"
    manual_only = "manual_only"


class DispatchRoutingPolicy(BaseModel):
    candidate_window_minutes: int = Field(
        default=DEFAULT_VROOM_CANDIDATE_WINDOW_MINUTES,
        ge=0,
    )
    secondary_max_eta_minutes: int = Field(
        default=DEFAULT_VROOM_SECONDARY_MAX_ETA_MINUTES,
        gt=0,
    )

    @model_validator(mode="after")
    def validate_route_windows(self):
        if self.secondary_max_eta_minutes <= self.candidate_window_minutes:
            raise ValueError(
                "Secondary ETA must be greater than the candidate window"
            )
        return self


class DispatchCandidate(BaseModel):
    report_id: str = Field(min_length=1)
    volunteer_id: str = Field(min_length=1)
    matching_score: float = Field(ge=0, le=100)
    offered: bool = False
    route_tier: CandidateRouteTier
    automatic_eligible: bool


class DispatchOptimizationRequest(BaseModel):
    jobs: list[DispatchJob] = Field(min_length=1)
    volunteers: list[DispatchVolunteer] = Field(min_length=1)
    candidates: list[DispatchCandidate] = Field(min_length=1)
    travel_matrix: RouteMatrixResult
    routing_policy: DispatchRoutingPolicy = Field(
        default_factory=DispatchRoutingPolicy
    )

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
        if any(job.location.id != job.report_id for job in self.jobs):
            raise ValueError("Dispatch job location id must match its report")
        if any(
            volunteer.location.id != volunteer.volunteer_id
            for volunteer in self.volunteers
        ):
            raise ValueError(
                "Dispatch volunteer location id must match its volunteer"
            )
        if set(self.travel_matrix.destination_ids) != report_ids:
            raise ValueError("Route destinations must match dispatch jobs")
        if set(self.travel_matrix.origin_ids) != set(volunteers_by_id):
            raise ValueError("Route origins must match dispatch volunteers")
        if self.travel_matrix.status != RoutingStatus.complete:
            raise ValueError("Dispatch requires a complete route matrix")

        candidate_reports = {candidate.report_id for candidate in self.candidates}
        if not candidate_reports.issubset(report_ids):
            raise ValueError("Candidate references an unknown report")
        candidate_pairs = {
            (candidate.report_id, candidate.volunteer_id)
            for candidate in self.candidates
        }
        if len(candidate_pairs) != len(self.candidates):
            raise ValueError("Dispatch candidates must be unique per report")
        candidate_volunteers = {
            candidate.volunteer_id for candidate in self.candidates
        }
        if candidate_volunteers != set(volunteers_by_id):
            raise ValueError("Every dispatch volunteer requires a candidate pair")
        for candidate in self.candidates:
            volunteer = volunteers_by_id.get(candidate.volunteer_id)
            if volunteer is None:
                raise ValueError("Candidate references an unknown volunteer")
            if volunteer.role == "voluntario_externo":
                if not candidate.offered:
                    raise ValueError("External candidate requires an explicit offer")
                if candidate.report_id not in volunteer.offered_report_ids:
                    raise ValueError("External offer does not match candidate report")
            elif candidate.offered:
                raise ValueError("Internal candidate cannot be marked as offered")

            expected_automatic_eligibility = (
                volunteer.role == "voluntario_interno"
                and candidate.route_tier != CandidateRouteTier.manual_only
            )
            if candidate.automatic_eligible != expected_automatic_eligibility:
                raise ValueError(
                    "Candidate automatic eligibility conflicts with role or route tier"
                )
        for volunteer in self.volunteers:
            volunteer_candidates = [
                candidate
                for candidate in self.candidates
                if candidate.volunteer_id == volunteer.volunteer_id
            ]
            expected_summary_score = max(
                candidate.matching_score for candidate in volunteer_candidates
            )
            if volunteer.matching_score != expected_summary_score:
                raise ValueError(
                    "Volunteer matching score must summarize its candidate pairs"
                )
            if volunteer.role == "voluntario_externo":
                candidate_offer_ids = {
                    candidate.report_id for candidate in volunteer_candidates
                }
                if set(volunteer.offered_report_ids) != candidate_offer_ids:
                    raise ValueError(
                        "External offers must match the candidate pairs exactly"
                    )

        if candidate_reports != report_ids:
            raise ValueError("Every dispatch job requires at least one candidate")

        origin_index = {
            volunteer_id: index
            for index, volunteer_id in enumerate(self.travel_matrix.origin_ids)
        }
        destination_index = {
            report_id: index
            for index, report_id in enumerate(self.travel_matrix.destination_ids)
        }
        candidates_by_report: dict[str, list[DispatchCandidate]] = {}
        for candidate in self.candidates:
            candidates_by_report.setdefault(candidate.report_id, []).append(candidate)

        window_seconds = self.routing_policy.candidate_window_minutes * 60
        maximum_seconds = self.routing_policy.secondary_max_eta_minutes * 60
        for report_id, report_candidates in candidates_by_report.items():
            durations = {}
            for candidate in report_candidates:
                row_index = origin_index[candidate.volunteer_id]
                column_index = destination_index[report_id]
                duration = self.travel_matrix.durations_seconds[row_index][
                    column_index
                ]
                distance = self.travel_matrix.distances_meters[row_index][
                    column_index
                ]
                if duration is None or distance is None:
                    raise ValueError("Dispatch candidate requires a usable route")
                durations[candidate.volunteer_id] = duration

            minimum_duration = min(durations.values())
            for candidate in report_candidates:
                duration = durations[candidate.volunteer_id]
                if duration > maximum_seconds:
                    expected_tier = CandidateRouteTier.manual_only
                elif duration <= minimum_duration + window_seconds:
                    expected_tier = CandidateRouteTier.primary
                else:
                    expected_tier = CandidateRouteTier.secondary
                if candidate.route_tier != expected_tier:
                    raise ValueError(
                        "Candidate route tier conflicts with the route matrix"
                    )
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
    request_too_large = "request_too_large"
    no_viable_routes = "no_viable_routes"
    invalid_candidate_data = "invalid_candidate_data"
    data_source_error = "data_source_error"


class DispatchExclusionReason(str, Enum):
    report_not_operational = "report_not_operational"
    urgency_unavailable = "urgency_unavailable"
    no_candidates = "no_candidates"
    missing_coordinates = "missing_coordinates"
    invalid_candidate_data = "invalid_candidate_data"
    data_source_error = "data_source_error"
    no_route = "no_route"


class DispatchExclusionScope(str, Enum):
    report = "report"
    volunteer = "volunteer"
    candidate_pair = "candidate_pair"


class DispatchExcludedItem(BaseModel):
    scope: DispatchExclusionScope
    reason: DispatchExclusionReason
    report_id: str | None = Field(default=None, min_length=1)
    volunteer_id: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_excluded_item_identifiers(self):
        if self.scope == DispatchExclusionScope.report:
            if self.report_id is None or self.volunteer_id is not None:
                raise ValueError("Report exclusion requires only a report id")
        elif self.scope == DispatchExclusionScope.volunteer:
            if self.volunteer_id is None or self.report_id is not None:
                raise ValueError(
                    "Volunteer exclusion requires only a volunteer id"
                )
        elif self.report_id is None or self.volunteer_id is None:
            raise ValueError(
                "Candidate-pair exclusion requires report and volunteer ids"
            )
        return self


class DispatchPreparationResult(BaseModel):
    status: DispatchPreparationStatus
    prepared_at: datetime
    request: DispatchOptimizationRequest | None = None
    error_code: DispatchPreparationErrorCode | None = None
    excluded_items: list[DispatchExcludedItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_preparation_result(self):
        exclusion_keys = [
            (item.scope, item.report_id, item.volunteer_id)
            for item in self.excluded_items
        ]
        if len(set(exclusion_keys)) != len(exclusion_keys):
            raise ValueError("Dispatch exclusions must be unique")
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
    route_tier: CandidateRouteTier = CandidateRouteTier.primary

    @model_validator(mode="after")
    def validate_automatic_route_tier(self):
        if self.route_tier == CandidateRouteTier.manual_only:
            raise ValueError("Manual-only candidates cannot be auto-assigned")
        return self


class DispatchOptimizationPass(str, Enum):
    primary = "primary"
    expanded = "expanded"


class DispatchOptimizationResult(BaseModel):
    assignments: list[DispatchAssignment] = Field(default_factory=list)
    unassigned_report_ids: list[str] = Field(default_factory=list)
    source: Literal["vroom", "local_fallback"]
    calculated_at: datetime
    optimization_pass: DispatchOptimizationPass = DispatchOptimizationPass.primary
    used_secondary: bool = False

    @model_validator(mode="after")
    def validate_optimization_result(self):
        assigned_reports = [item.report_id for item in self.assignments]
        assigned_volunteers = [item.volunteer_id for item in self.assignments]
        if len(set(assigned_reports)) != len(assigned_reports):
            raise ValueError("A report cannot have multiple dispatch assignments")
        if len(set(assigned_volunteers)) != len(assigned_volunteers):
            raise ValueError("A volunteer cannot receive multiple jobs in one dispatch")
        if len(set(self.unassigned_report_ids)) != len(self.unassigned_report_ids):
            raise ValueError("Unassigned dispatch reports must be unique")
        if set(assigned_reports) & set(self.unassigned_report_ids):
            raise ValueError("A report cannot be assigned and unassigned")

        has_secondary = any(
            item.route_tier == CandidateRouteTier.secondary
            for item in self.assignments
        )
        if self.used_secondary != has_secondary:
            raise ValueError("used_secondary must reflect the selected assignments")
        if has_secondary and self.optimization_pass != DispatchOptimizationPass.expanded:
            raise ValueError("Secondary assignments require the expanded pass")
        if (
            self.optimization_pass == DispatchOptimizationPass.expanded
            and not has_secondary
        ):
            raise ValueError("Expanded pass requires a secondary assignment")
        return self


class LocationSource(str, Enum):
    reporte_inicial = "reporte_inicial"
    confirmacion_reportante = "confirmacion_reportante"
    voluntario_asignado = "voluntario_asignado"
    voluntario_verificado = "voluntario_verificado"
    # Entrega C: testigo cercano al caso que no tiene ya un camino propio
    # arriba (voluntario_interno, donante_comunitario, patrocinador_
    # institucional, o el reportante viendo un caso que no es el suyo).
    # A diferencia de voluntario_verificado, se gana por trust_score en vez
    # de una ubicacion declarada, y nunca se auto-valida -- ver
    # avistamiento_service._resolver_fuente / _validar_condiciones_auto_validacion.
    testigo_cercano = "testigo_cercano"
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
    posible_duplicado_detectado = "posible_duplicado_detectado"
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
    # Evidencia fotografica opcional, subida antes via
    # POST /reports/{id}/avistamientos/foto. El body sigue siendo JSON: solo
    # viaja la referencia, no el archivo.
    evidencia_id: str | None = None


class AvistamientoResult(BaseModel):
    id: str
    reporte_id: str
    animal_id: str
    fuente: LocationSource
    estado_validacion: Literal[
        "pendiente", "validado", "rechazado", "superado_por_otro"
    ]
    registrado_at: datetime
