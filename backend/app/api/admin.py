from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase
from app.models.association import RespuestaApelacionBody

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


### Endpoint: listar asociaciones con apleacion pedniente 
@router.get("/apelaciones", status_code=200)
async def listar_apelaciones(authorization: str = Header(None)):
    """Lista todas las apelaciones pendientes con datos de la asociación."""
    _verificar_admin(authorization)

    resultado = supabase.table("apelaciones").select(
        "id, mensaje, documentos_urls, estado, created_at, "
        "asociaciones(id, nombre, nombre_responsable, contacto_email, motivo_rechazo)"
    ).eq("estado", "pendiente").order("created_at", desc=False).execute()

    return resultado.data
### FIN: apelaciones pendientes 

### ENDPOINT: Admin aprueba o rechaza apelacion 
@router.patch("/apelaciones/{apelacion_id}", status_code=200)
async def resolver_apelacion(apelacion_id: str, body: RespuestaApelacionBody, authorization: str = Header(None)):
    """El admin aprueba o rechaza una apelación."""
    _verificar_admin(authorization)

    if body.decision not in ["aprobar", "rechazar"]:
        raise HTTPException(status_code=422, detail="La decisión debe ser 'aprobar' o 'rechazar'")

    # Obtener apelación
    apelacion = supabase.table("apelaciones").select(
        "id, asociacion_id, estado"
    ).eq("id", apelacion_id).execute()

    if not apelacion.data:
        raise HTTPException(status_code=404, detail="Apelación no encontrada")

    if apelacion.data[0]["estado"] != "pendiente":
        raise HTTPException(status_code=400, detail="Esta apelación ya fue resuelta")

    asociacion_id = apelacion.data[0]["asociacion_id"]

    if body.decision == "aprobar":
        # Aprobar asociación
        supabase.table("asociaciones").update({
            "verificado": True,
            "motivo_rechazo": None,
        }).eq("id", asociacion_id).execute()

        supabase.table("apelaciones").update({
            "estado": "aprobada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        return {"mensaje": "Apelación aprobada. La asociación ha sido verificada."}

    else:
        # Rechazar apelación
        supabase.table("apelaciones").update({
            "estado": "rechazada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        return {"mensaje": "Apelación rechazada."}
    
### FIN: admin rechaza o acepta apelacion 
