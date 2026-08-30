from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


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


class AdoptionProfileUpdate(BaseModel):
    datos: FormalAdoptionProfileData
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned

    @model_validator(mode="after")
    def requiere_al_menos_un_cambio(self):
        if not self.datos.model_fields_set:
            raise ValueError("Indica al menos un dato para actualizar")
        for field_name in ("sexo", "edad_aproximada"):
            if (
                field_name in self.datos.model_fields_set
                and getattr(self.datos, field_name) is None
            ):
                raise ValueError(f"{field_name} no puede quedar vacío")
        return self


class AdoptionProfilePhotoReview(BaseModel):
    aprobada: bool
    motivo: str | None = Field(default=None, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("motivo")
    @classmethod
    def limpiar_motivo(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned

    @model_validator(mode="after")
    def requiere_motivo_al_rechazar(self):
        if not self.aprobada and not self.motivo:
            raise ValueError("Indica por qué la fotografía no puede publicarse")
        return self


class AdoptionProfilePhotoRemove(BaseModel):
    motivo: str = Field(min_length=1, max_length=2000)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("motivo", "idempotency_key")
    @classmethod
    def limpiar_texto(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
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


class AdoptionPublicCatalogItem(BaseModel):
    clave: str
    descripcion: str


class AdoptionPublicAssociation(BaseModel):
    id: UUID
    nombre: str
    acerca_de: str | None = None
    logo_url: str | None = None


class AdoptionPublicPhoto(BaseModel):
    id: UUID
    orden: int
    texto_alternativo: str | None = None
    foto_url: str
    foto_url_expira_at: datetime


AdoptionRequirementResponseType = Literal[
    "texto_corto",
    "texto_largo",
    "seleccion_unica",
    "seleccion_multiple",
    "booleano",
    "fecha",
    "documento",
]


class AdoptionRequirementQuestion(BaseModel):
    clave: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_]+$")
    titulo: str = Field(min_length=1, max_length=300)
    descripcion: str | None = Field(default=None, max_length=1000)
    tipo_respuesta: AdoptionRequirementResponseType
    opciones: list[str] = Field(default_factory=list, max_length=20)
    obligatorio: bool = False
    es_sensible: bool = False
    orden: int = Field(ge=1, le=32767)

    @field_validator("clave", "titulo", "descripcion")
    @classmethod
    def limpiar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned

    @field_validator("opciones")
    @classmethod
    def limpiar_opciones(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 200 for value in cleaned):
            raise ValueError("Cada opción debe tener entre 1 y 200 caracteres")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("No repitas opciones dentro de una pregunta")
        return cleaned

    @model_validator(mode="after")
    def validar_tipo_y_opciones(self):
        selection_types = {"seleccion_unica", "seleccion_multiple"}
        if self.tipo_respuesta in selection_types and not self.opciones:
            raise ValueError("Las preguntas de selección necesitan opciones")
        if self.tipo_respuesta not in selection_types and self.opciones:
            raise ValueError("Este tipo de pregunta no admite opciones")
        if self.tipo_respuesta == "documento" and not self.es_sensible:
            raise ValueError("Los documentos siempre deben marcarse como sensibles")
        return self


class AdoptionRequirementTemplateData(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    descripcion: str | None = Field(default=None, max_length=2000)
    preguntas: list[AdoptionRequirementQuestion] = Field(
        default_factory=list,
        max_length=25,
    )

    @field_validator("nombre", "descripcion")
    @classmethod
    def limpiar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El texto no puede estar vacío")
        return cleaned

    @model_validator(mode="after")
    def validar_identificadores_unicos(self):
        keys = [question.clave for question in self.preguntas]
        orders = [question.orden for question in self.preguntas]
        if len(keys) != len(set(keys)):
            raise ValueError("No repitas la clave de una pregunta")
        if len(orders) != len(set(orders)):
            raise ValueError("No repitas el orden de una pregunta")
        return self


class AdoptionRequirementTemplateWrite(AdoptionRequirementTemplateData):
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned


class AdoptionRequirementTemplateAction(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("idempotency_key")
    @classmethod
    def limpiar_idempotencia(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("La clave de idempotencia no puede estar vacía")
        return cleaned


class AdoptionRequirementTemplateRetire(AdoptionRequirementTemplateAction):
    motivo: str = Field(min_length=1, max_length=2000)

    @field_validator("motivo")
    @classmethod
    def limpiar_motivo(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El motivo no puede estar vacío")
        return cleaned


class AdoptionPublicRequirement(AdoptionRequirementQuestion):
    origen: Literal["pawalert", "asociacion"]


class AdoptionRequirementTemplateView(AdoptionRequirementTemplateData):
    id: UUID
    version: int
    requisitos_base_version: str
    estado: Literal["borrador", "activa", "retirada"]
    activada_at: datetime | None = None
    retirada_at: datetime | None = None
    creada_at: datetime
    actualizada_at: datetime


class AdoptionRequirementTemplatePanel(BaseModel):
    requisitos_base: list[AdoptionPublicRequirement]
    plantillas: list[AdoptionRequirementTemplateView]


class AdoptionPublicProfileSummary(BaseModel):
    id: UUID
    nombre_publico: str
    tipo_animal: AdoptionPublicCatalogItem
    tipo_animal_otro: AdoptionPublicCatalogItem | None = None
    tamanio: AdoptionPublicCatalogItem
    raza: AdoptionPublicCatalogItem | None = None
    sexo: Literal["macho", "hembra", "desconocido"]
    edad_aproximada: Literal[
        "cachorro", "joven", "adulto", "senior", "desconocido"
    ]
    zona_general: str
    compatibilidad: dict[str, object] = Field(default_factory=dict)
    asociacion: AdoptionPublicAssociation
    foto_portada: AdoptionPublicPhoto | None = None
    publicado_at: datetime
    actualizado_at: datetime


class AdoptionPublicProfileDetail(AdoptionPublicProfileSummary):
    descripcion: str
    personalidad: str
    salud_conocida: str
    tratamientos: str | None = None
    necesidades_especiales: str | None = None
    vacunacion_estado: Literal[
        "desconocido", "pendiente", "parcial", "completo", "no_aplica"
    ]
    esterilizacion_estado: Literal[
        "desconocido", "pendiente", "completo", "no_aplica"
    ]
    revision_medica_estado: Literal[
        "desconocida", "pendiente", "declarada", "verificada"
    ]
    fotos: list[AdoptionPublicPhoto]
    requisitos: list[AdoptionPublicRequirement]


class AdoptionPublicPage(BaseModel):
    items: list[AdoptionPublicProfileSummary]
    pagina: int
    limite: int
    total: int
    tiene_mas: bool
