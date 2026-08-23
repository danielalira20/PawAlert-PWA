"""Endpoints de avistamientos (Capa 8, Entrega A)."""

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
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
