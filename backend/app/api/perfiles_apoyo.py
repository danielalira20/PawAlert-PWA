from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase import supabase

router = APIRouter()

def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, telefono").eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return resultado.data[0]

class DonanteComunitarioRequest(BaseModel):
    categorias: List[str]
    subcategorias: Optional[List[str]] = []
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_km: Optional[int] = None
    disponibilidad: str = "disponible"
    preferencia_visibilidad: Optional[str] = None
    consentimiento_mural: Optional[bool] = False
    telefono: Optional[str] = None

@router.post("/donante-comunitario", status_code=201)
async def crear_donante_comunitario(body: DonanteComunitarioRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    usuario_id = usuario["id"]

    # Verificar si ya tiene un perfil
    existente = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if existente.data:
        raise HTTPException(status_code=409, detail="El usuario ya cuenta con un perfil de aliado.")

    # Si proporcionaron telefono y el usuario no tenia, actualizar usuario
    if body.telefono and not usuario.get("telefono"):
        supabase.table("usuarios").update({"telefono": body.telefono}).eq("id", usuario_id).execute()

    # Preparar el insert.
    data = {
        "usuario_id": usuario_id,
        "tipo": "donante_comunitario",
        "categorias": body.categorias,
        "disponibilidad": body.disponibilidad,
        "preferencia_visibilidad": body.preferencia_visibilidad,
        "radio_km": body.radio_km,
        "datos_extra": {
            "consentimiento_mural": body.consentimiento_mural,
            "subcategorias": body.subcategorias
        }
    }

    if body.latitud is not None and body.longitud is not None:
        data["zona_cobertura"] = f"POINT({body.longitud} {body.latitud})"
        
    resultado = supabase.table("perfil_apoyo").insert(data).execute()
    return resultado.data[0]
