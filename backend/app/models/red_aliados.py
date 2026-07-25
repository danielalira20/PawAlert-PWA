from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any
from enum import Enum


# TODO(lotes divisibles): `lotes.contribucion_id` es NOT NULL + UNIQUE en el
# esquema actual (migrations/0006_red_aliados.sql) — un lote mapea 1:1 a
# exactamente una contribución. El flujo de lotes divisibles entre varias
# asociaciones (flujo-red-aliados-pawalert.md, sección 7 — "varias
# asociaciones pueden pedir bolsas completas") necesita que un mismo lote
# se reparta en más de una contribución (una por asociación que acepta su
# parte), lo cual este esquema todavía no soporta. No es parte de este
# módulo (Formulario 3 / FRONT01) — es tarea de quien implemente
# Formulario 4 / FRONT13 (lotes). No tocar la migración por esto ahora.


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
    # necesidad_id ya no es obligatorio en la tabla (migrations/0012_aceptar_sugerencia_aliado.sql)
    # — una contribución nacida de BACK02 (aceptar sugerencia Ruta 1) trae
    # reporte_id en vez de necesidad_id.
    necesidad_id: Optional[str] = None
    reporte_id: Optional[str] = None
    oferta_proactiva_id: Optional[str] = None
    estado: str
    created_at: str


class AceptarSugerenciaRequest(BaseModel):
    """Body de POST /reports/{reporte_id}/hitos/aceptar-sugerencia."""
    oferta_id: str


class OfertaProactivaResponse(BaseModel):
    id: str
    categoria: str
    capacidad_declarada: float
    capacidad_disponible: float
    unidad: str
    activa: bool
    created_at: str


class SugerenciaAliadoResponse(BaseModel):
    """Motor de sugerencias Ruta 1 (BACK01) — solo informativo, no reserva
    nada. Se embebe como campo opcional en la respuesta de
    POST /reports/{id}/hitos, nunca se persiste (ver flujo-red-aliados-pawalert.md,
    sección 6, Ruta 1)."""
    oferta_id: str
    perfil_apoyo_id: str
    nombre: str
    distancia_km: float
    unidad: str
    capacidad_disponible: float
    nivel_urgencia: str


class OfertaCompatibleResponse(BaseModel):
    """Motor de sugerencias Ruta 2 (BACK03) — un elemento de la lista que
    regresa GET /red-aliados/necesidades/{id}/ofertas-compatibles. Mismo
    shape que SugerenciaAliadoResponse salvo por `nivel_urgencia`, que no
    aplica a Ruta 2 (no hay filtro de urgencia en necesidades generales)
    — modelo separado a propósito, no se reusa el de Ruta 1 con un campo
    opcional sin sentido."""
    oferta_id: str
    perfil_apoyo_id: str
    nombre: str
    distancia_km: float
    unidad: str
    capacidad_disponible: float


class AceptarOfertaGeneralRequest(BaseModel):
    """Body de POST /red-aliados/necesidades/{necesidad_id}/aceptar-oferta.
    A diferencia de Ruta 1 (siempre reserva 1 unidad fija), aquí la
    cantidad es variable — la asociación decide cuánto acepta."""
    oferta_id: str
    cantidad: float = Field(gt=0)


class ContactoResponse(BaseModel):
    """Datos de contacto para coordinar la entrega fuera de la plataforma
    — sin chat ni logística interna, solo se comparten estos datos."""
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


class AceptarOfertaGeneralResponse(BaseModel):
    contribucion: ContribucionResponse
    contacto_aliado: ContactoResponse
    contacto_asociacion: ContactoResponse
