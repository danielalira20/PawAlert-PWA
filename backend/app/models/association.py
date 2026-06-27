from pydantic import BaseModel, EmailStr
from typing import Optional, List
from enum import Enum

class TipoAnimalEnum(str, Enum):
    perro = "perro"
    gato = "gato"
    otro = "otro"

class AssociationCreate(BaseModel):
    nombre: str
    nombre_responsable: str
    contacto_telefono: str
    contacto_email: EmailStr
    tipos_animales: List[TipoAnimalEnum]
    latitud: float
    longitud: float
    radio_km: int
    acerca_de: Optional[str] = None
    horario_atencion: Optional[str] = None

class AssociationResponse(BaseModel):
    verificado: bool = False
    mensaje: str = "Solicitud recibida. Te contactaremos en 48 horas."

class AssociationPublicResponse(BaseModel):
    id: str
    nombre: str
    contacto_telefono: str
    contacto_email: str
    tipos_animales: Optional[List[str]] = None
    latitud: float
    longitud: float
    radio_km: float
    horario_atencion: Optional[str] = None
    activo: bool

class RespuestaApelacionBody(BaseModel):
    decision: str  # "aprobar" o "rechazar"
    respuesta: str | None = None

    