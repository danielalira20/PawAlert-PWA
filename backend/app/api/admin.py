from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase
from app.models.association import RespuestaApelacionBody
from app.services.email_service import (email_asociacion_aprobada, email_asociacion_rechazada, email_apelacion_aprobada, email_apelacion_rechazada)
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
        "id, nombre, nombre_responsable, contacto_telefono, contacto_email, logo_url,created_at, asociacion_fotos(id)"
    ).eq("verificado", False).is_("motivo_rechazo", "null").execute()

    data = resultado.data

    for item in data:
        item["fotos_count"] = len(item.pop("asociacion_fotos", []))

    return resultado.data


class RechazoBody(BaseModel):
    motivo: str


@router.post("/asociaciones/{asociacion_id}/aprobar", status_code=200)
async def aprobar_asociacion(asociacion_id: str, authorization: str = Header(None)):
    _verificar_admin(authorization)

    # Obtener datos de la asociación para el email
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

    supabase.table("asociaciones").update({"verificado": True}).eq("id", asociacion_id).execute()
    
    # Enviar email
    if asociacion.data:
        email_asociacion_aprobada(
            nombre_asociacion=asociacion.data[0]["nombre"],
            email=asociacion.data[0]["contacto_email"]
        )

    return {"mensaje": "Asociación aprobada"}


@router.post("/asociaciones/{asociacion_id}/rechazar", status_code=200)
async def rechazar_asociacion(asociacion_id: str, body: RechazoBody, authorization: str = Header(None)):
    _verificar_admin(authorization)

    #obtener datos de la asocacion para el email 
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

    supabase.table("asociaciones").update({"motivo_rechazo": body.motivo}).eq("id", asociacion_id).execute()
    
    #Enviar Email 
    if asociacion.data:
        email_asociacion_rechazada(
            nombre_asociacion=asociacion.data[0]["nombre"],
            email=asociacion.data[0]["contacto_email"],
            motivo=body.motivo
        )

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

    # Obtener datos de la asociación
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_email"
    ).eq("id", asociacion_id).execute()

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

        #envio de email
        if asociacion.data:
            email_apelacion_aprobada(
                nombre_asociacion=asociacion.data[0]["nombre"],
                email=asociacion.data[0]["contacto_email"]
            )

        return {"mensaje": "Apelación aprobada. La asociación ha sido verificada."}

    else:
        # Rechazar apelación
        supabase.table("apelaciones").update({
            "estado": "rechazada",
            "respuesta_admin": body.respuesta,
        }).eq("id", apelacion_id).execute()

        #rechazo email
        if asociacion.data:
            email_apelacion_rechazada(
                nombre_asociacion=asociacion.data[0]["nombre"],
                email=asociacion.data[0]["contacto_email"],
                respuesta=body.respuesta
            )

        return {"mensaje": "Apelación rechazada."}
    
### FIN: admin rechaza o acepta apelacion 

@router.get("/asociaciones/{asociacion_id}", status_code=200)
async def obtener_detalle_asociacion(asociacion_id: str, authorization: str = Header(None)):
    """Detalle completo de una asociación para que el admin pueda revisar
    a fondo antes de aprobar/rechazar: datos de contacto, ubicación, logo,
    fotos del refugio y tipos de animales que rescatan."""
    _verificar_admin(authorization)

    resultado = supabase.table("asociaciones").select(
        "id, nombre, nombre_responsable, contacto_telefono, contacto_email, "
        "acerca_de, logo_url, horario_atencion, radio_km, tipos_animales, "
        "calle, colonia, municipio, referencia, latitud, longitud, "
        "verificado, motivo_rechazo, created_at, "
        "asociacion_fotos(id, foto_url, descripcion, orden)"
    ).eq("id", asociacion_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")

    asociacion = resultado.data[0]

    # Ordenar las fotos por el campo `orden` que ya captura el formulario
    fotos = sorted(asociacion.get("asociacion_fotos", []), key=lambda f: f.get("orden", 0))
    asociacion["fotos"] = fotos
    asociacion.pop("asociacion_fotos", None)

    return asociacion