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
    mismo_animal: Optional[bool] = None
    foto_clara: Optional[bool] = None
    entorno_adecuado: Optional[bool] = None
    condicion_evolucion: Optional[
        Literal["mejor", "igual", "peor", "no_determinable"]
    ] = None
    posibles_inconsistencias: bool = False


class DudaRegionalRequest(BaseModel):
    pregunta: str = Field(min_length=5, max_length=700)
    mismo_animal: bool
    foto_clara: bool
    entorno_adecuado: bool
    condicion_evolucion: Literal["mejor", "igual", "peor", "no_determinable"]
    posibles_inconsistencias: bool = False


class EnviarAclaracionRequest(BaseModel):
    mensaje: str = Field(min_length=5, max_length=700)


class ResponderAclaracionRequest(BaseModel):
    respuesta: str = Field(min_length=5, max_length=1000)
    foto_url: Optional[str] = None


class ExtensionCustodiaRequest(BaseModel):
    nueva_fecha_limite: datetime


class RespuestaVencimientoRequest(BaseModel):
    respuesta: Literal["puede_continuar", "no_puede", "no_seguro"]
    nueva_fecha_limite: Optional[datetime] = None


class SolicitudRelevoRequest(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)


class AceptarRelevoRequest(BaseModel):
    tipo_destino: Literal["ingreso_asociacion", "hogar_temporal"]
    voluntario_receptor_id: Optional[str] = None
    responsable_recepcion: str = Field(min_length=3, max_length=160)
    direccion_recepcion: str = Field(min_length=8, max_length=500)
    latitud_recepcion: float
    longitud_recepcion: float
    ventana_inicio: datetime
    ventana_fin: datetime
    nueva_fecha_limite: Optional[datetime] = None


class RespuestaTransporteRelevoRequest(BaseModel):
    puede_transportar: bool


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
