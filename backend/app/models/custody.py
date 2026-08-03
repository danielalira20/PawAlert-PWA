from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SeguimientoCustodiaRequest(BaseModel):
    condicion_actual: str = Field(min_length=2, max_length=120)
    salud: str = Field(min_length=2, max_length=500)
    alimentacion: str = Field(min_length=2, max_length=500)
    tratamiento: Optional[str] = Field(default=None, max_length=500)
    comportamiento: str = Field(min_length=2, max_length=500)
    foto_url: str
    entorno_foto_url: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


class ValidacionSeguimientoRequest(BaseModel):
    decision: Literal["validado", "aclaracion_solicitada", "alerta"]
    comentario: Optional[str] = Field(default=None, max_length=500)


class DudaRegionalRequest(BaseModel):
    pregunta: str = Field(min_length=5, max_length=700)


class EnviarAclaracionRequest(BaseModel):
    mensaje: str = Field(min_length=5, max_length=700)


class ResponderAclaracionRequest(BaseModel):
    respuesta: str = Field(min_length=5, max_length=1000)
    foto_url: Optional[str] = None


class ExtensionCustodiaRequest(BaseModel):
    nueva_fecha_limite: datetime


class SolicitudRelevoRequest(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)


class AceptarRelevoRequest(BaseModel):
    fecha_programada: datetime


class ConfirmarTransferenciaRequest(BaseModel):
    foto_url: str
    latitud: float
    longitud: float


class FinalizarCustodiaRequest(BaseModel):
    resolucion: Literal[
        "transferencia_confirmada",
        "ingreso_formal_asociacion",
        "adopcion_aprobada",
    ]
    referencia_proceso: str = Field(min_length=3, max_length=300)
