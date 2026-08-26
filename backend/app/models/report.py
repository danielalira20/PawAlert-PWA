from datetime import datetime

from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum

class CondicionEnum(str, Enum):
    estable = "estable"
    herido = "herido"
    grave = "grave"

class TipoAnimalEnum(str, Enum):
    perro = "perro"
    gato = "gato"
    otro = "otro"

class TamanioEnum(str, Enum):
    pequeno = "pequeno"
    mediano = "mediano"
    grande = "grande"

class SexoEnum(str, Enum):
    macho = "macho"
    hembra = "hembra"
    desconocido = "desconocido"

class EdadEnum(str, Enum):
    cachorro = "cachorro"
    joven = "joven"
    adulto = "adulto"
    senior = "senior"
    desconocido = "desconocido"

class EstadoReporteEnum(str, Enum):
    pendiente = "pendiente"
    asignado = "asignado"
    en_camino = "en_camino"
    en_atencion = "en_atencion"
    pendiente_seguimiento_fallecimiento = "pendiente_seguimiento_fallecimiento"
    rescatado = "rescatado"
    cerrado = "cerrado"
    sin_cobertura = "sin_cobertura"
    duplicado = "duplicado"
    muerto = "muerto"
    cancelado_por_reportante = "cancelado_por_reportante"
    duplicado_vinculable = "duplicado_vinculable"
    duplicado_informativo = "duplicado_informativo"


# Contrato compartido por los servicios que calculan o programan trabajo
# operativo. `duplicado` y `muerto` se conservan como terminales por
# compatibilidad con registros anteriores, aunque los flujos nuevos usan una
# conclusion estructurada.
ESTADOS_REPORTE_OPERATIVOS = frozenset({
    EstadoReporteEnum.pendiente.value,
    EstadoReporteEnum.asignado.value,
    EstadoReporteEnum.en_camino.value,
    EstadoReporteEnum.en_atencion.value,
    EstadoReporteEnum.sin_cobertura.value,
})

ESTADOS_REPORTE_TERMINALES = frozenset({
    EstadoReporteEnum.rescatado.value,
    EstadoReporteEnum.cerrado.value,
    EstadoReporteEnum.duplicado.value,
    EstadoReporteEnum.muerto.value,
    EstadoReporteEnum.cancelado_por_reportante.value,
    EstadoReporteEnum.duplicado_vinculable.value,
    EstadoReporteEnum.duplicado_informativo.value,
})

class ContactoEmergencia(BaseModel):
    nombre: str
    telefono: str
    descripcion: Optional[str] = None
    tipo: Optional[str] = None

class AnimalResponse(BaseModel):
    tipo_animal: Optional[str] = None
    condicion: Optional[str] = None
    tamanio: Optional[str] = None
    sexo: Optional[str] = None
    edad_aproximada: Optional[str] = None
    tiene_collar: Optional[bool] = None
    esta_prenada: Optional[bool] = None
    es_agresivo: Optional[bool] = None
    es_domestico_probable: Optional[bool] = None
    raza: Optional[str] = None
    especie_descripcion: Optional[str] = None
    descripcion: Optional[str] = None
    orden: Optional[int] = None
    es_grupo: Optional[bool] = None
    cantidad: Optional[int] = None
    trae_crias_nacidas: Optional[bool] = None
    numero_crias_nacidas: Optional[int] = None
    foto_url: Optional[str] = None    
    fotos: Optional[list[str]] = None  

## Un elemento del arreglo `animales` que manda el formulario al crear un
## reporte — el mismo animal puede venir de ficha individual o de modo grupo.
class AnimalInput(BaseModel):
    condicion: CondicionEnum
    tipo_animal: TipoAnimalEnum
    tamanio: TamanioEnum
    sexo: Optional[SexoEnum] = None
    edad_aproximada: Optional[EdadEnum] = None
    tiene_collar: Optional[bool] = None
    esta_prenada: Optional[bool] = None
    es_agresivo: Optional[bool] = None
    es_domestico_probable: Optional[bool] = None
    raza_clave: Optional[str] = None
    tipo_animal_otro_clave: Optional[str] = None
    especie_descripcion: Optional[str] = None
    descripcion: Optional[str] = Field(default=None, max_length=300)
    orden: int = 1
    es_grupo: bool = False
    cantidad: int = Field(default=1, ge=1)
    trae_crias_nacidas: Optional[bool] = None
    numero_crias_nacidas: Optional[int] = None

class ReportResponse(BaseModel):
    id: str
    estado: str
    asociacion_asignada: Optional[str] = None
    contactos_emergencia: Optional[list[ContactoEmergencia]] = None
    created_at: str

class ReportListItem(BaseModel):
    id: str
    estado_reporte: Optional[EstadoReporteEnum] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    municipio: Optional[str] = None
    colonia: Optional[str] = None
    created_at: str
    foto_url: Optional[str] = None
    animales: list[AnimalResponse] = []
    urgency_score: Optional[float] = None
    urgency_nivel: Optional[str] = None
    estado_validacion_reporte: Optional[str] = None
    estado_moderacion: Optional[str] = None

class ZonaAgregada(BaseModel):
    """Punto agregado por zona para el mapa publico sin sesion: no expone
    ningun reporte individual, solo densidad y severidad dominante."""
    latitud: float
    longitud: float
    cantidad: int
    nivel_urgencia_max: Optional[str] = None

class ReportesMapaResponse(BaseModel):
    modo: Literal["agregado", "detallado"]
    reportes: list[ReportListItem] = []
    zonas: list[ZonaAgregada] = []

## Lo usa el staff para registrar el avance del rescate
class HitoRequest(BaseModel):
    tipo_hito: str
    condicion_observada: Optional[str] = None
    comentario: Optional[str] = None
    destino: Optional[str] = Field(default=None, max_length=200)
    foto_url: Optional[str] = None
    evidencia_id: Optional[str] = None
    foto_entorno_url: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    tiempo_busqueda_minutos: Optional[int] = Field(default=None, ge=1, le=1440)
    ruta_resguardo: Optional[str] = None
    fecha_limite_resguardo: Optional[datetime] = None


class ResolverBusquedaNoLocalizadoRequest(BaseModel):
    decision: str
    instrucciones: Optional[str] = Field(default=None, max_length=1000)
    programada_at: Optional[str] = None


## Cuando el encargado de asociacion RECHACE reporte
class RechazarReporteRequest(BaseModel):
    motivo: str
    comentario: Optional[str] = None
    motivo_clave: Optional[str] = None


class CancelarReporteRequest(BaseModel):
    motivo: Optional[str] = Field(default=None, max_length=500)


class DenunciarReporteRequest(BaseModel):
    motivo: str
    detalle: Optional[str] = Field(default=None, max_length=500)
