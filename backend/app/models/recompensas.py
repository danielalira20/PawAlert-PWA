from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from enum import Enum
from datetime import date


class TipoRecompensaEnum(str, Enum):
    descuento = "descuento"
    producto = "producto"
    servicio = "servicio"


class NivelRecompensaEnum(str, Enum):
    """Define el costo en puntos — el backend calcula el costo a partir de
    este valor, el formulario nunca manda un costo directamente."""
    pequena = "pequena"
    mediana = "mediana"
    grande = "grande"


COSTO_POR_NIVEL: dict[str, int] = {
    NivelRecompensaEnum.pequena.value: 100,
    NivelRecompensaEnum.mediana.value: 250,
    NivelRecompensaEnum.grande.value: 600,
}

VIGENCIA_MINIMA_DIAS = 30
VIGENCIA_MAXIMA_DIAS = 90


class EstadoRecompensaEnum(str, Enum):
    borrador = "borrador"
    activa = "activa"
    pausada = "pausada"
    agotada = "agotada"
    vencida = "vencida"
    archivada = "archivada"


class RecompensaCreate(BaseModel):
    """Body de POST /recompensas — nace en estado 'borrador'; 'publicar'
    es una acción separada (RecompensaEstadoRequest) para que el patrocinador
    pueda revisar antes de que sea visible en el catálogo."""
    tipo: TipoRecompensaEnum
    categoria: str = Field(max_length=120)
    subcategoria: Optional[str] = Field(default=None, max_length=120)
    nombre: str = Field(max_length=150)
    descripcion: str = Field(max_length=1000)
    nivel: NivelRecompensaEnum
    unidades_totales: int = Field(gt=0, le=9_999_999)
    inicio: date
    vencimiento: date
    sucursal_lugar: Optional[str] = Field(default=None, max_length=250)
    horario: Optional[str] = Field(default=None, max_length=150)
    forma_entrega: str = Field(max_length=120)
    condiciones: Optional[str] = Field(default=None, max_length=1000)
    inventario_separado_confirmado: bool

    @model_validator(mode="after")
    def validar_vigencia(self):
        if self.vencimiento <= self.inicio:
            raise ValueError("El vencimiento debe ser posterior al inicio")
        dias = (self.vencimiento - self.inicio).days
        if not (VIGENCIA_MINIMA_DIAS <= dias <= VIGENCIA_MAXIMA_DIAS):
            raise ValueError(
                f"La vigencia debe ser de entre {VIGENCIA_MINIMA_DIAS} y {VIGENCIA_MAXIMA_DIAS} días"
            )
        return self

    @model_validator(mode="after")
    def validar_inventario_separado(self):
        # Regla de negocio: "recursos destinados a rescates nunca se
        # utilizan como premios" — el patrocinador debe confirmar
        # explícitamente que este inventario es aparte.
        if not self.inventario_separado_confirmado:
            raise ValueError(
                "Debes confirmar que el inventario de esta recompensa está separado de tus recursos para rescates"
            )
        return self


class RecompensaEstadoRequest(BaseModel):
    accion: Literal["publicar", "pausar", "reactivar", "archivar"]


class RecompensaResponse(BaseModel):
    id: str
    propietario_id: str
    tipo: str
    categoria: str
    subcategoria: Optional[str] = None
    nombre: str
    descripcion: str
    nivel: str
    costo: int
    unidades_totales: int
    unidades_disponibles: int
    inicio: str
    vencimiento: str
    sucursal_lugar: Optional[str] = None
    horario: Optional[str] = None
    forma_entrega: str
    condiciones: Optional[str] = None
    estado: str
    inventario_separado_confirmado: bool
    creado_at: str
    canjes_confirmados: int = 0
    personas_beneficiadas: int = 0


class UbicacionPublicaRecompensa(BaseModel):
    """Ubicación autorizada explícitamente al publicar la recompensa.

    No expone zona_cobertura, domicilio ni coordenadas privadas del perfil.
    """
    lugar: Optional[str] = None


class RecompensaCatalogoResponse(BaseModel):
    id: str
    propietario_id: str
    patrocinador_nombre: str
    patrocinador_tipo: str
    tipo: str
    categoria: str
    subcategoria: Optional[str] = None
    nombre: str
    descripcion: str
    nivel: str
    costo: int
    unidades_disponibles: int
    inicio: str
    vencimiento: str
    sucursal_lugar: Optional[str] = None
    horario: Optional[str] = None
    forma_entrega: str
    condiciones: Optional[str] = None
    ubicacion_publica: UbicacionPublicaRecompensa
    estado: str


class CategoriaRecompensaResponse(BaseModel):
    clave: str
    descripcion: str
    subcategorias: list[dict] = []


class CanjeEmitirRequest(BaseModel):
    recompensa_id: str


class CanjeConfirmarRequest(BaseModel):
    codigo: str = Field(min_length=8, max_length=64)


class CanjeResponse(BaseModel):
    id: str
    recompensa_id: str
    beneficiario_id: str
    codigo: str
    estado: str
    condiciones_snapshot: Optional[str] = None
    forma_entrega_snapshot: str
    costo_snapshot: int
    emitido_at: str
    confirmado_at: Optional[str] = None
    fecha_expiracion: Optional[str] = None
    patrocinador_confirmacion_id: Optional[str] = None
    motivo_cancelacion: Optional[str] = None
    recompensas: Optional[dict] = None

class CanjeReembolsoRequest(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)


class ReportarProblemaRequest(BaseModel):
    motivo: str = Field(min_length=10, max_length=1000)
