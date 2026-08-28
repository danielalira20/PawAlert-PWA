"""Endpoints de avistamientos (Capa 8, Entrega A)."""

from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.db.supabase import supabase
from app.models.dispatch import AvistamientoCreate, AvistamientoResult
from app.services import avistamiento_service

router = APIRouter()


class ValidarAvistamientoRequest(BaseModel):
    aprobar: bool


def _obtener_usuario_autenticado(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = (
        supabase.table("usuarios")
        .select("id")
        .eq("auth_user_id", auth_response.user.id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"id": resultado.data[0]["id"]}


@router.post("/{reporte_id}/avistamientos", status_code=201)
def crear_avistamiento(
    reporte_id: str,
    body: AvistamientoCreate,
    authorization: Optional[str] = Header(None),
) -> AvistamientoResult:
    usuario = _obtener_usuario_autenticado(authorization)
    return avistamiento_service.registrar_avistamiento(
        reporte_id, usuario["id"], body
    )


@router.post("/{reporte_id}/avistamientos/foto", status_code=201)
async def subir_foto_avistamiento(
    reporte_id: str,
    foto: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
) -> dict:
    """Paso 1 de 2 para adjuntar foto a un avistamiento: sube y sanitiza la
    imagen, extrae su EXIF y devuelve un `evidencia_id`. Ese id se manda
    luego en el body JSON de `POST /{reporte_id}/avistamientos`.

    Reusa la infraestructura de evidencia de hitos (`reporte_evidencias`);
    control de acceso identico al de registrar un avistamiento.
    """
    usuario = _obtener_usuario_autenticado(authorization)
    avistamiento_service.autorizar_subida_evidencia(reporte_id, usuario["id"])

    from app.services.evidence_service import subir_evidencia_suelta

    return await subir_evidencia_suelta(
        foto,
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        carpeta="reportes/avistamientos",
    )


@router.get("/{reporte_id}/avistamientos/elegible")
def avistamiento_elegible(
    reporte_id: str,
    latitud: float,
    longitud: float,
    authorization: Optional[str] = Header(None),
) -> dict:
    """Elegibilidad para registrar un avistamiento desde el GPS dado, sin crear
    nada. asociacion/staff -> elegible:true sin cálculo de distancia; reportante
    / voluntario verificado -> elegible + distancia_metros + radio_metros."""
    usuario = _obtener_usuario_autenticado(authorization)
    return avistamiento_service.evaluar_elegibilidad(
        reporte_id, usuario["id"], latitud, longitud
    )


@router.post("/{reporte_id}/avistamientos/{avistamiento_id}/validar")
def validar_avistamiento(
    reporte_id: str,
    avistamiento_id: str,
    body: ValidarAvistamientoRequest,
    authorization: Optional[str] = Header(None),
) -> AvistamientoResult:
    usuario = _obtener_usuario_autenticado(authorization)
    return avistamiento_service.validar_avistamiento(
        avistamiento_id, usuario["id"], body.aprobar
    )
