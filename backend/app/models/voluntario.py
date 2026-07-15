from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class TipoVoluntarioEnum(str, Enum):
    interno = "interno"
    externo = "externo"


class AccionPostulacionEnum(str, Enum):
    aceptar = "aceptar"
    rechazar = "rechazar"


class PostulacionRequest(BaseModel):
    """Body para POST /voluntarios/postulaciones"""
    tipo: TipoVoluntarioEnum
    asociacion_id: str


class ResolverPostulacionRequest(BaseModel):
    """Body para PATCH /asociaciones/me/postulaciones/{id}"""
    accion: AccionPostulacionEnum
    motivo: Optional[str] = None


class CapacidadesRequest(BaseModel):
    """Body para PUT /voluntarios/me/capacidades"""
    disponibilidad: dict = Field(default_factory=dict)
    ofrece_casa_hogar: bool = False
    capacidad_animales: int = 0
    especies: list[str] = Field(default_factory=list)
    tamanios: list[str] = Field(default_factory=list)
    otros_animales_en_casa: Optional[bool] = None
    ninos_en_casa: Optional[bool] = None
    tiene_vehiculo: bool = False
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    experiencia_previa: Optional[str] = None
    acepto_terminos: bool = False

