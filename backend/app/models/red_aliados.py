from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any
from enum import Enum


# Lotes divisibles (FRONT13/14/15/16 + BACK07): resuelto en
# migrations/0011_lotes_multi_asociacion.sql — un lote ahora puede nacer
# directo de un perfil_apoyo (sin pasar por una contribución 1:1) y
# repartirse entre varias asociaciones vía la tabla lote_asociaciones,
# cada una con su propia contribución y su propio QR de recepción.


class CategoriaRecursoEnum(str, Enum):
    """Las 4 categorías fijas de categoria_recurso — mismo criterio que
    TipoAnimalEnum en report.py: un catálogo pequeño y estable, no se
    espera que cambie sin tocar código."""
    alimentos = "alimentos"
    insumos = "insumos"
    servicios_veterinarios = "servicios_veterinarios"
    difusion_campanas = "difusion_campanas"


class EspecieAplicaEnum(str, Enum):
    perro = "perro"
    gato = "gato"


class AportacionBase(BaseModel):
    """Campos del 'paso común' de Formulario 3
    (formularios-red-aliados-pawalert.md) — compartidos entre el modo
    reactivo (ContribucionRequest) y el proactivo (OfertaProactivaRequest).

    `subcategoria_id` es intencionalmente `str` y no un Enum: a diferencia
    de `categoria` (4 valores fijos), subcategoria_recurso tiene ~23 filas
    hoy y puede crecer sin necesidad de un deploy — se valida en tiempo de
    ejecución contra la tabla en red_aliados_service.py, no aquí."""
    categoria: CategoriaRecursoEnum
    subcategoria_id: str
    especies_aplica: list[EspecieAplicaEnum] = Field(default_factory=list)
    fecha_disponibilidad: Optional[str] = None
    lugar_entrega: Optional[str] = Field(default=None, max_length=250)
    forma_entrega: Optional[str] = Field(default=None, max_length=120)
    vigencia: Optional[str] = None
    # Campos condicionales por categoría (etapa del alimento, tipo de
    # servicio veterinario, área de servicio profesional, contacto
    # responsable de campaña, foto_url si se adjuntó evidencia, etc.) —
    # mismo criterio que datos_extra en perfil_apoyo: solo informativo,
    # el motor de sugerencias no lo consulta.
    detalle: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validar_contacto_responsable_difusion(self):
        # formularios-red-aliados-pawalert.md, sección "Difusión y
        # campañas": "Contacto responsable — obligatorio para cualquier
        # campaña, no solo para servicio profesional (una campaña nunca
        # queda a nombre de la institución en abstracto)".
        if self.categoria == CategoriaRecursoEnum.difusion_campanas:
            contacto = (self.detalle or {}).get("contacto_responsable")
            if not contacto or not str(contacto).strip():
                raise ValueError(
                    "Difusión y campañas requiere un contacto responsable (detalle.contacto_responsable)"
                )
        return self


class ContribucionRequest(AportacionBase):
    """Body de POST /red-aliados/contribuciones — modo reactivo, responde
    a una necesidad ya publicada."""
    necesidad_id: str
    cantidad_valor: float = Field(gt=0)
    cantidad_unidad: str
    oferta_proactiva_id: Optional[str] = None


class OfertaProactivaRequest(AportacionBase):
    """Body de POST /red-aliados/ofertas-proactivas — modo proactivo,
    disponibilidad declarada de antemano. Solo aliado_local /
    patrocinador_institucional (regla de negocio #4 en
    flujo-red-aliados-pawalert.md) — el service layer valida el tipo de
    perfil_apoyo, no este modelo."""
    capacidad_declarada: float = Field(gt=0)
    unidad: str
    frecuencia: Optional[str] = None


class ContribucionResponse(BaseModel):
    id: str
    necesidad_id: str
    estado: str
    created_at: str


class OfertaProactivaResponse(BaseModel):
    id: str
    categoria: str
    capacidad_declarada: float
    capacidad_disponible: float
    unidad: str
    activa: bool
    created_at: str


class DivisibleEnum(str, Enum):
    no = "no"
    solo_empaques_completos = "solo_empaques_completos"
    aliado_prepara_lotes = "aliado_prepara_lotes"


class FormaEntregaEnum(str, Enum):
    institucion_lleva = "institucion_lleva"
    asociacion_recoge = "asociacion_recoge"
    ambas = "ambas"
    punto_acordado = "punto_acordado"


class LoteRequest(BaseModel):
    """Body de POST /red-aliados/lotes — FRONT13. Un lote nace directo del
    perfil de aliado (no depende de una contribución previa) y puede
    repartirse entre varias asociaciones (FRONT14/15)."""
    categoria: CategoriaRecursoEnum
    subcategoria_id: str
    especies_aplica: list[EspecieAplicaEnum] = Field(default_factory=list)
    cantidad_valor: float = Field(gt=0)
    cantidad_unidad: str
    tipo_empaque: str = Field(max_length=120)
    divisible: DivisibleEnum
    max_asociaciones: int = Field(ge=1, default=1)
    forma_entrega: FormaEntregaEnum
    descripcion: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validar_max_asociaciones(self):
        if self.divisible == DivisibleEnum.no and self.max_asociaciones != 1:
            raise ValueError("Un lote no divisible solo puede tener 1 asociación destino")
        return self


class LoteResponse(BaseModel):
    id: str
    categoria: str
    subcategoria_id: str
    cantidad_valor: float
    cantidad_unidad: str
    tipo_empaque: str
    divisible: str
    max_asociaciones: int
    forma_entrega: str
    created_at: str


class InvitarAsociacionesRequest(BaseModel):
    asociacion_ids: list[str] = Field(min_length=1)


class ResponderInvitacionRequest(BaseModel):
    aceptar: bool
    cantidad_asignada: Optional[float] = Field(default=None, gt=0)


class ConfirmarQrRequest(BaseModel):
    token: str
