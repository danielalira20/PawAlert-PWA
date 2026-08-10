from pydantic import BaseModel
from typing import Optional


class InsigniaResponse(BaseModel):
    id: str
    rol: str
    codigo_insignia: str
    nivel: Optional[str] = None
    progreso: int
    obtenido_at: Optional[str] = None
    mejorado_at: Optional[str] = None
