from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any, Dict
from enum import Enum
from uuid import UUID


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
    max_asociaciones: int = Field(ge=1, le=10, default=1)
    forma_entrega: FormaEntregaEnum
    descripcion: Optional[str] = Field(default=None, max_length=500)
    fecha_disponibilidad: Optional[str] = None
    vigencia: Optional[str] = None
    lugar_entrega: Optional[str] = Field(default=None, max_length=250)
    direccion_entrega: Optional[str] = Field(default=None, max_length=500)
    direccion_detalle: dict[str, Any] = Field(default_factory=dict)
    detalle: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validar_max_asociaciones(self):
        if self.divisible == DivisibleEnum.no and self.max_asociaciones != 1:
            raise ValueError("Un lote no divisible solo puede tener 1 asociación destino")
        if not self.lugar_entrega or not self.direccion_entrega:
            raise ValueError("Selecciona un punto y una dirección de entrega válidos")
        campos_direccion = ("estado", "municipio", "calle", "codigo_postal", "colonia")
        faltantes = [campo for campo in campos_direccion if not str(self.direccion_detalle.get(campo, "")).strip()]
        if faltantes:
            raise ValueError(f"Faltan datos de la dirección: {', '.join(faltantes)}")
        codigo_postal = str(self.direccion_detalle["codigo_postal"]).strip()
        if len(codigo_postal) != 5 or not codigo_postal.isdigit():
            raise ValueError("El código postal debe contener 5 dígitos")
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
    descripcion: Optional[str] = None
    fecha_disponibilidad: Optional[str] = None
    vigencia: Optional[str] = None
    lugar_entrega: Optional[str] = None
    direccion_entrega: Optional[str] = None
    direccion_detalle: dict[str, Any] = Field(default_factory=dict)
    detalle: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class InvitarAsociacionesRequest(BaseModel):
    asociacion_ids: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validar_asociaciones_sin_duplicados(self):
        if len(self.asociacion_ids) != len(set(self.asociacion_ids)):
            raise ValueError("No puedes invitar dos veces a la misma asociación")
        return self


class EstadoLoteRequest(BaseModel):
    activo: bool


class ResponderInvitacionRequest(BaseModel):
    aceptar: bool
    cantidad_asignada: Optional[float] = Field(default=None, gt=0)


class ConfirmarQrRequest(BaseModel):
    token: str


class NivelUrgenciaNecesidad(str, Enum):
    """Claves reales del CHECK necesidades_urgencia_check
    (migrations/0006_red_aliados.sql) — no son 'Baja'/'Media'/'Alta',
    esas son solo etiquetas de UI que el frontend traduce a estas claves."""
    critico = "critico"
    urgente = "urgente"
    no_urgente = "no_urgente"


class NecesidadCreate(BaseModel):
    reporte_id: Optional[UUID] = None
    categoria: str
    urgencia: Optional[NivelUrgenciaNecesidad] = None
    subcategoria_id: Optional[UUID] = None
    cantidad_valor: Optional[float] = None
    cantidad_unidad: Optional[str] = None
    detalle: Optional[Dict[str, Any]] = None  # Recibirá un objeto JSON

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


class UbicacionAliadoResponse(BaseModel):
    """Dirección + coordenadas del aliado (perfil_apoyo) que acepta una
    sugerencia Ruta 1 — calle/colonia/municipio/referencia son solo texto;
    latitud/longitud se extraen de zona_cobertura vía la RPC
    ubicacion_perfil_apoyo (migrations/0014_...), no hay columnas de
    coordenadas nuevas."""
    calle: Optional[str] = None
    colonia: Optional[str] = None
    municipio: Optional[str] = None
    referencia: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


class AceptarSugerenciaVeterinariaResponse(BaseModel):
    """Respuesta de POST /reports/{reporte_id}/hitos/aceptar-sugerencia
    (Ruta 1) — mismo criterio que AceptarOfertaGeneralResponse de Ruta 2,
    pero con ubicacion_aliado en vez de contacto_asociacion (aquí no hay
    una segunda asociación involucrada, sino la dirección de la
    veterinaria para el botón 'Cómo llegar')."""
    contribucion: ContribucionResponse
    contacto_aliado: ContactoResponse
    ubicacion_aliado: UbicacionAliadoResponse


class PerfilApoyoMeResponse(BaseModel):
    """Respuesta de GET /red-aliados/me — mismo patrón de existencia que
    GET /voluntarios/me (tiene_perfil_voluntario), pero deliberadamente
    minimal: solo lo que Mi Perfil necesita para decidir si muestra el
    segundo bloque de estadísticas (FRONT03) y con qué copy por tipo."""
    tiene_perfil_apoyo: bool
    tipo: Optional[str] = None


class OfertaImpactoResponse(BaseModel):
    """Una oferta_proactiva del aliado, para el desglose de capacidad
    declarada vs. disponible en AliadoImpactStats (aliado_local /
    patrocinador_institucional únicamente)."""
    oferta_id: str
    categoria: str
    subcategoria: Optional[str] = None
    capacidad_declarada: float
    capacidad_disponible: float
    unidad: str
    activa: bool


class AplicacionImpactoResponse(BaseModel):
    """Una fila del historial de 'aplicaciones' — cada vez que una
    contribución consumió capacidad de alguna oferta_proactiva de este
    aliado. No es una tabla nueva, se deriva de contribuciones."""
    fecha: str
    cantidad: Optional[str] = None
    nota: Optional[str] = None


class ImpactoAliadoResponse(BaseModel):
    """Respuesta de GET /red-aliados/me/impacto — mismo shape para los 3
    tipos de perfil_apoyo; `ofertas`/`aplicaciones` vienen vacíos para
    donante_comunitario (no declara capacidad proactiva)."""
    tipo: str
    verificado_admin: bool = False
    razon_rechazo: Optional[str] = None
    total_contribuciones: int
    asociaciones_ayudadas: int
    ofertas: list[OfertaImpactoResponse] = Field(default_factory=list)
    aplicaciones: list[AplicacionImpactoResponse] = Field(default_factory=list)
