from pydantic import BaseModel, field_validator
from typing import Optional
from enum import Enum

class CondicionEnum(str, Enum):
    estable = "estable"
    herido = "herido"
    grave = "grave"

class TipoAnimalEnum(str, Enum):
    perro = "perro"
    gato = "gato"
    ave = "ave"
    otro = "otro"

class TamanioEnum(str, Enum):
    pequeno = "pequeno"
    mediano = "mediano"
    grande = "grande"

class ContactoEmergencia(BaseModel):
    nombre: str
    telefono: str
    descripcion: Optional[str] = None
    tipo: Optional[str] = None

class ReportResponse(BaseModel):
    id: str
    estado: str
    asociacion_asignada: Optional[str] = None
    contactos_emergencia: Optional[list[ContactoEmergencia]] = None
    created_at: str