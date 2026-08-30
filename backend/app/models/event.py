from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


EventType = Literal[
    "vacunacion",
    "esterilizacion",
    "feria_adopcion",
    "identificacion",
    "acopio",
    "capacitacion",
    "bienestar_animal",
    "otro",
]
EventAccessMode = Literal[
    "sin_registro",
    "registro_externo",
    "contacto_institucional",
]
EventCapacityState = Literal["no_aplica", "disponible", "agotado"]
EventProfessionalDataState = Literal["no_aplica", "declarado", "verificado"]
EventState = Literal[
    "borrador",
    "publicado",
    "pausado",
    "cancelado",
    "finalizado",
    "archivado",
    "suspendido_admin",
]


class EventWriteData(BaseModel):
    """Campos editables del evento; identidad y estados nunca vienen del cliente."""

    model_config = ConfigDict(extra="forbid")

    responsable_operativo_usuario_id: UUID | None = None
    tipo: EventType | None = None
    categoria_otro: str | None = Field(default=None, max_length=120)
    titulo: str | None = Field(default=None, max_length=180)
    descripcion: str | None = Field(default=None, max_length=4000)
    inicia_at: datetime | None = None
    termina_at: datetime | None = None
    zona_horaria: str | None = Field(default=None, max_length=100)
    lugar_nombre: str | None = Field(default=None, max_length=200)
    direccion_publica: str | None = Field(default=None, max_length=500)
    municipio: str | None = Field(default=None, max_length=120)
    estado_ubicacion: str | None = Field(default=None, max_length=120)
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)
    modalidad_acceso: EventAccessMode | None = None
    enlace_registro_externo: str | None = Field(default=None, max_length=1000)
    instrucciones_contacto: str | None = Field(default=None, max_length=1000)
    especies_objetivo: list[str] | None = Field(default=None, max_length=30)
    publico_objetivo: str | None = Field(default=None, max_length=1000)
    requisitos_asistencia: str | None = Field(default=None, max_length=4000)
    servicios_detalle: str | None = Field(default=None, max_length=4000)
    condiciones_excluidas: list[str] | None = Field(default=None, max_length=50)
    documentos_requeridos: list[str] | None = Field(default=None, max_length=30)
    contacto_institucional_nombre: str | None = Field(default=None, max_length=200)
    contacto_institucional_telefono: str | None = Field(default=None, max_length=30)
    contacto_institucional_email: str | None = Field(default=None, max_length=255)
    es_gratuito: bool | None = None
    costo_centavos: int | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    detalle_costos: str | None = Field(default=None, max_length=1000)
    cupo_total: int | None = Field(default=None, gt=0)
    cupo_estado: EventCapacityState | None = None
    responsable_profesional: str | None = Field(default=None, max_length=250)
    cedula_profesional: str | None = Field(default=None, max_length=100)
    institucion_profesional: str | None = Field(default=None, max_length=250)
    datos_profesionales_estado: EventProfessionalDataState | None = None
    accesibilidad: str | None = Field(default=None, max_length=2000)
    transporte: str | None = Field(default=None, max_length=2000)

    @field_validator(
        "categoria_otro",
        "titulo",
        "descripcion",
        "zona_horaria",
        "lugar_nombre",
        "direccion_publica",
        "municipio",
        "estado_ubicacion",
        "enlace_registro_externo",
        "instrucciones_contacto",
        "publico_objetivo",
        "requisitos_asistencia",
        "servicios_detalle",
        "contacto_institucional_nombre",
        "contacto_institucional_telefono",
        "contacto_institucional_email",
        "moneda",
        "detalle_costos",
        "responsable_profesional",
        "cedula_profesional",
        "institucion_profesional",
        "accesibilidad",
        "transporte",
    )
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("especies_objetivo", "condiciones_excluidas", "documentos_requeridos")
    @classmethod
    def normalize_string_lists(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            raise ValueError("Envía una lista vacía para limpiar este campo")
        normalized = [item.strip() for item in value if item.strip()]
        if len(normalized) != len(set(normalized)):
            raise ValueError("La lista no admite elementos duplicados")
        return normalized

    @field_validator("inicia_at", "termina_at")
    @classmethod
    def require_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("La fecha debe incluir zona horaria")
        return value

    @field_validator("zona_horaria")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Selecciona una zona horaria IANA válida") from error
        return value

    @field_validator("moneda")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @model_validator(mode="after")
    def validate_intrinsic_consistency(self):
        if (
            self.inicia_at is not None
            and self.termina_at is not None
            and self.inicia_at >= self.termina_at
        ):
            raise ValueError("La fecha de inicio debe ser anterior al término")
        if self.es_gratuito is True and (self.costo_centavos or 0) != 0:
            raise ValueError("Un evento gratuito no puede indicar un costo")
        if (
            "cupo_total" in self.model_fields_set
            and "cupo_estado" in self.model_fields_set
            and self.cupo_total is None
            and self.cupo_estado not in (None, "no_aplica")
        ):
            raise ValueError("Un evento sin cupo total debe usar no_aplica")
        return self


class EventDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    datos: EventWriteData = Field(default_factory=EventWriteData)
    idempotency_key: str = Field(min_length=8, max_length=200)


class EventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    datos: EventWriteData
    idempotency_key: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def require_changes(self):
        if not self.datos.model_fields_set:
            raise ValueError("Indica al menos un campo para actualizar")
        return self


class EventAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(min_length=8, max_length=200)


class EventPause(EventAction):
    motivo: str = Field(min_length=1, max_length=1000)

    @field_validator("motivo")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Indica por qué se pausará el evento")
        return normalized


class EventCancel(EventAction):
    motivo_publico: str = Field(min_length=1, max_length=1000)

    @field_validator("motivo_publico")
    @classmethod
    def normalize_public_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Indica un motivo público para cancelar")
        return normalized


class EventOperationResponse(BaseModel):
    id: UUID
    estado: EventState
    version_publica: int = Field(ge=0)
    updated_at: datetime
    event_id: UUID
    reintento: bool


class EventSavedOperationResponse(BaseModel):
    id: UUID | None = None
    evento_id: UUID
    guardado: bool
    event_id: UUID | None = None
    reintento: bool


class EventImageOperationResponse(BaseModel):
    id: UUID
    estado: EventState
    version_publica: int = Field(ge=0)
    updated_at: datetime
    event_id: UUID
    reintento: bool
    imagen_url: str | None = None
    imagen_url_expira_at: datetime | None = None
    imagen_mime_type: str | None = None
    imagen_size_bytes: int | None = Field(default=None, ge=1)
    imagen_texto_alternativo: str | None = None
    storage_cleanup_pending: bool = False


class EventAssociationPublic(BaseModel):
    id: UUID
    nombre: str
    logo_url: str | None = None
    acerca_de: str | None = None


class EventPublicSummary(BaseModel):
    id: UUID
    tipo: EventType
    categoria_otro: str | None = None
    titulo: str
    descripcion: str
    inicia_at: datetime
    termina_at: datetime
    zona_horaria: str
    municipio: str
    estado_ubicacion: str
    especies_objetivo: list[str]
    es_gratuito: bool
    costo_centavos: int | None = None
    moneda: str
    cupo_total: int | None = None
    cupo_estado: EventCapacityState
    imagen_url: str | None = None
    imagen_url_expira_at: datetime | None = None
    imagen_texto_alternativo: str | None = None
    asociacion: EventAssociationPublic


class EventPublicDetail(EventPublicSummary):
    lugar_nombre: str
    direccion_publica: str
    latitud: float
    longitud: float
    modalidad_acceso: EventAccessMode
    enlace_registro_externo: str | None = None
    instrucciones_contacto: str | None = None
    publico_objetivo: str
    requisitos_asistencia: str
    servicios_detalle: str | None = None
    condiciones_excluidas: list[str]
    documentos_requeridos: list[str]
    contacto_institucional_nombre: str
    contacto_institucional_telefono: str | None = None
    contacto_institucional_email: str | None = None
    detalle_costos: str | None = None
    responsable_profesional: str | None = None
    cedula_profesional: str | None = None
    institucion_profesional: str | None = None
    datos_profesionales_estado: EventProfessionalDataState
    accesibilidad: str | None = None
    transporte: str | None = None
    estado: Literal["publicado", "cancelado"]
    version_publica: int
    publicado_at: datetime
    motivo_cancelacion_publico: str | None = None


class EventPublicPage(BaseModel):
    items: list[EventPublicSummary]
    pagina: int
    limite: int
    total: int
    tiene_mas: bool


class EventMapItem(BaseModel):
    id: UUID
    tipo: EventType
    titulo: str
    inicia_at: datetime
    termina_at: datetime
    zona_horaria: str
    latitud: float
    longitud: float
    cupo_estado: EventCapacityState
    asociacion: EventAssociationPublic


class EventAssociationView(BaseModel):
    id: UUID
    asociacion_id: UUID
    responsable_operativo_usuario_id: UUID | None = None
    tipo: EventType | None = None
    categoria_otro: str | None = None
    titulo: str | None = None
    descripcion: str | None = None
    inicia_at: datetime | None = None
    termina_at: datetime | None = None
    zona_horaria: str | None = None
    lugar_nombre: str | None = None
    direccion_publica: str | None = None
    municipio: str | None = None
    estado_ubicacion: str | None = None
    latitud: float | None = None
    longitud: float | None = None
    modalidad_acceso: EventAccessMode | None = None
    enlace_registro_externo: str | None = None
    instrucciones_contacto: str | None = None
    especies_objetivo: list[str] = Field(default_factory=list)
    publico_objetivo: str | None = None
    requisitos_asistencia: str | None = None
    servicios_detalle: str | None = None
    condiciones_excluidas: list[str] = Field(default_factory=list)
    documentos_requeridos: list[str] = Field(default_factory=list)
    contacto_institucional_nombre: str | None = None
    contacto_institucional_telefono: str | None = None
    contacto_institucional_email: str | None = None
    es_gratuito: bool | None = None
    costo_centavos: int | None = None
    moneda: str
    detalle_costos: str | None = None
    cupo_total: int | None = None
    cupo_estado: EventCapacityState
    responsable_profesional: str | None = None
    cedula_profesional: str | None = None
    institucion_profesional: str | None = None
    datos_profesionales_estado: EventProfessionalDataState
    imagen_url: str | None = None
    imagen_url_expira_at: datetime | None = None
    imagen_texto_alternativo: str | None = None
    accesibilidad: str | None = None
    transporte: str | None = None
    estado: EventState
    version_publica: int
    publicado_at: datetime | None = None
    pausado_at: datetime | None = None
    cancelado_at: datetime | None = None
    motivo_cancelacion_publico: str | None = None
    finalizado_at: datetime | None = None
    archivado_at: datetime | None = None
    creado_at: datetime
    actualizada_at: datetime


class EventSavedView(BaseModel):
    id: UUID
    evento_id: UUID
    creado_at: datetime
    evento: EventPublicSummary
