from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase

router = APIRouter()


def _verificar_admin(authorization: str | None) -> dict:
    """Valida el JWT y confirma que el usuario tiene el rol 'admin'."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select(
        "id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = resultado.data[0]
    rol = usuario.get("roles")
    if not rol or rol.get("nombre") != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")

    return usuario


@router.get("/asociaciones-pendientes", status_code=200)
async def listar_asociaciones_pendientes(authorization: str = Header(None)):
    _verificar_admin(authorization)

    resultado = supabase.table("asociaciones").select(
        "id, nombre, nombre_responsable, contacto_telefono, contacto_email, created_at"
    ).eq("verificado", False).is_("motivo_rechazo", "null").execute()

    return resultado.data


class RechazoBody(BaseModel):
    motivo: str


@router.post("/asociaciones/{asociacion_id}/aprobar", status_code=200)
async def aprobar_asociacion(asociacion_id: str, authorization: str = Header(None)):
    _verificar_admin(authorization)

    supabase.table("asociaciones").update({"verificado": True}).eq("id", asociacion_id).execute()
    return {"mensaje": "Asociación aprobada"}


@router.post("/asociaciones/{asociacion_id}/rechazar", status_code=200)
async def rechazar_asociacion(asociacion_id: str, body: RechazoBody, authorization: str = Header(None)):
    _verificar_admin(authorization)

    supabase.table("asociaciones").update({"motivo_rechazo": body.motivo}).eq("id", asociacion_id).execute()
    return {"mensaje": "Asociación rechazada"}

