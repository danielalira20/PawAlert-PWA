from pydantic import BaseModel
from typing import Optional
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
    rescatado = "rescatado"
    cerrado = "cerrado"
    sin_cobertura = "sin_cobertura"
    duplicado = "duplicado"
    muerto = "muerto"

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
    animal: Optional[AnimalResponse] = None

## Lo usa el staff para registrar el avance del rescate
class HitoRequest(BaseModel):
    tipo_hito: str  # "encontre_animal" o "llegue_refugio"
    condicion_observada: Optional[str] = None
    comentario: Optional[str] = None
    foto_url: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None