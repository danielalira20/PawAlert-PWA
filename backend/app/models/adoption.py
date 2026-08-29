from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AdoptionIntakeCreate(BaseModel):
    animal_id: UUID
    origen_individuo: int = Field(ge=1)
    nombre_temporal: str | None = Field(default=None, max_length=120)
    fotos_propuesta_paths: list[str] = Field(min_length=1, max_length=5)
    salud_conocida: str = Field(min_length=1, max_length=4000)
    tratamientos_conocidos: str | None = Field(default=None, max_length=4000)
    temperamento_observado: str = Field(min_length=1, max_length=4000)
    compatibilidad_observada: dict[str, object] = Field(default_factory=dict)
    motivo_propuesta: str = Field(min_length=1, max_length=2000)
    custodia_disponible_hasta: datetime | None = None
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator(
        "nombre_temporal",
        "salud_conocida",
        "tratamientos_conocidos",
        "temperamento_observado",
        "motivo_propuesta",
        "idempotency_key",
    )
    @classmethod
    def limpiar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned

    @field_validator("fotos_propuesta_paths")
    @classmethod
    def validar_fotos_privadas(cls, paths: list[str]) -> list[str]:
        normalized = [path.strip() for path in paths]
        if any(
            not path.startswith("adopciones/ingresos/")
            or ".." in path.split("/")
            for path in normalized
        ):
            raise ValueError("Las fotografías deben pertenecer al ingreso privado")
        if len(set(normalized)) != len(normalized):
            raise ValueError("No repitas la misma fotografía")
        return normalized


class AdoptionIntakeClarification(BaseModel):
    respuesta: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("respuesta", "idempotency_key")
    @classmethod
    def limpiar_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned


class AdoptionIntakeCancel(BaseModel):
    motivo: str = Field(min_length=1, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("motivo", "idempotency_key")
    @classmethod
    def limpiar_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned


class AdoptionIntakeResolve(BaseModel):
    decision: Literal[
        "aprobar",
        "solicitar_informacion",
        "rechazar",
        "no_elegible",
    ]
    motivo: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("motivo", "idempotency_key")
    @classmethod
    def limpiar_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned


class FormalAdoptionProfileData(BaseModel):
    nombre_publico: str | None = Field(default=None, max_length=120)
    tipo_animal_id: UUID | None = None
    tipo_animal_otro_id: UUID | None = None
    tamanio_id: UUID | None = None
    raza_id: UUID | None = None
    sexo: Literal["macho", "hembra", "desconocido"] | None = None
    edad_aproximada: Literal[
        "cachorro", "joven", "adulto", "senior", "desconocido"
    ] | None = None
    descripcion: str | None = Field(default=None, max_length=4000)
    personalidad: str | None = Field(default=None, max_length=4000)
    salud_conocida: str | None = Field(default=None, max_length=4000)
    tratamientos: str | None = Field(default=None, max_length=4000)
    necesidades_especiales: str | None = Field(default=None, max_length=4000)
    vacunacion_estado: Literal[
        "desconocido", "pendiente", "parcial", "completo", "no_aplica"
    ] = "desconocido"
    esterilizacion_estado: Literal[
        "desconocido", "pendiente", "completo", "no_aplica"
    ] = "desconocido"
    revision_medica_estado: Literal[
        "desconocida", "pendiente", "declarada", "verificada"
    ] = "desconocida"
    compatibilidad: dict[str, object] = Field(default_factory=dict)
    zona_general: str | None = Field(default=None, max_length=300)

    @field_validator(
        "nombre_publico",
        "sexo",
        "edad_aproximada",
        "descripcion",
        "personalidad",
        "salud_conocida",
        "tratamientos",
        "necesidades_especiales",
        "zona_general",
    )
    @classmethod
    def limpiar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned


class FormalAdoptionProfileCreate(BaseModel):
    datos: FormalAdoptionProfileData
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned


class AdoptionProfilePublish(BaseModel):
    revision_medica_confirmada: bool
    revision_juridica_confirmada: bool
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned


class AdoptionProfilePause(BaseModel):
    motivo: str = Field(min_length=1, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("motivo", "idempotency_key")
    @classmethod
    def limpiar_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned
