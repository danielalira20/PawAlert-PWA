from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException,Header
from app.db.supabase import supabase, supabase_admin
from pydantic import BaseModel
from typing import Literal

router = APIRouter()


@router.get("/phone/{telefono}", status_code=200)
async def get_user_by_phone(telefono: str, authorization: str = Header(None)):
    """Busca usuario por teléfono. Requiere sesión — antes era público, lo
    que permitía enumerar nombre/correo de cualquier persona con solo su
    número de teléfono."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    telefono_limpio = telefono.replace(" ", "").replace("-", "")

    resultado = supabase.table("usuarios").select(
        "nombre, apellido_paterno, apellido_materno, email, telefono"
    ).eq("telefono", telefono_limpio).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="No existe usuario con ese teléfono")

    return resultado.data[0]

 
@router.get("/me", status_code=200)
async def get_usuario_actual(authorization: str = Header(None)):
    """Devuelve los datos actuales del usuario logueado, incluyendo su rol
    más reciente. Se usa para refrescar AuthContext cuando el rol pudo haber
    cambiado desde el login (ej. una postulación de voluntario fue aceptada
    y el rol pasó de 'reportante' a 'voluntario_interno'/'voluntario_externo').
    Misma forma que el campo 'usuario' que ya regresan /auth/login y
    /auth/register, para que el frontend pueda sustituir el objeto completo."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
 
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
 
    resultado = supabase.table("usuarios").select(
        "id, nombre, apellido_paterno, apellido_materno, email, telefono, asociacion_id, avatar_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()
 
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
 
    usuario_data = resultado.data[0]
    rol = usuario_data.pop("roles", None)
    usuario_data["es_admin"] = bool(rol and rol.get("nombre") == "admin")
    # None cuando rol_id es NULL de verdad (ver mismo comentario en auth.py) —
    # distingue una cuenta sin rol de una que sí tiene 'reportante' asignado.
    usuario_data["rol"] = rol.get("nombre") if rol else None

    # Se recupera también el 'tipo' de perfil_apoyo (ej. aliado_local) para
    # enviarlo al frontend de inmediato y evitar que la UI "parpadee" 
    # mostrando el dashboard de reportante por defecto mientras se 
    # hace una petición extra para averiguar el tipo de aliado.
    perfil_apoyo = supabase.table("perfil_apoyo").select("id, tipo").eq("usuario_id", usuario_data["id"]).execute()
    if perfil_apoyo.data:
        usuario_data["tiene_perfil_apoyo"] = True
        usuario_data["tipo_perfil_apoyo"] = perfil_apoyo.data[0]["tipo"]
    else:
        usuario_data["tiene_perfil_apoyo"] = False
        usuario_data["tipo_perfil_apoyo"] = None
 
    return usuario_data


class UpdateProfileRequest(BaseModel):
    nombre: str
    apellido_paterno: str
    apellido_materno: str | None = None
    telefono: str

@router.patch("/me", status_code=200)
async def update_usuario_actual(body: UpdateProfileRequest, authorization: str = Header(None)):
    """Actualiza los datos personales del usuario logueado."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    telefono_limpio = body.telefono.replace(" ", "").replace("-", "")

    update_data = {
        "nombre": body.nombre.strip(),
        "apellido_paterno": body.apellido_paterno.strip(),
        "apellido_materno": body.apellido_materno.strip() if body.apellido_materno else None,
        "telefono": telefono_limpio
    }

    # Se actualizan los datos usando supabase_admin para evitar bloqueos de RLS
    resultado = supabase_admin.table("usuarios").update(update_data).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return {"status": "ok", "message": "Perfil actualizado correctamente"}

class UpdateAvatarRequest(BaseModel):
    avatar_id: str | None

@router.put("/me/avatar", status_code=200)
async def update_avatar(body: UpdateAvatarRequest, authorization: str = Header(None)):
    """Actualiza el avatar predeterminado del usuario actual."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
        
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
    resultado = supabase.table("usuarios").update({
        "avatar_id": body.avatar_id
    }).eq("auth_user_id", auth_response.user.id).execute()
    
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    return {"status": "ok", "message": "Avatar actualizado correctamente"}

class PushDeviceRequest(BaseModel):
    token: str
    platform: Literal["web", "android", "ios"]

@router.post("/me/push-devices", status_code=200)
async def register_push_device(body: PushDeviceRequest, authorization: str = Header(None)):
    """Registra o actualiza el token FCM de un dispositivo para el usuario actual."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
    resultado = supabase.table("usuarios").select("id").eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    usuario_id = resultado.data[0]["id"]
    
    # Upsert el token (la unicidad es por provider y token)
    # Si el token existía pero pertenecía a otro usuario, esto lo reasigna al usuario actual.
    data = {
        "usuario_id": usuario_id,
        "provider": "fcm",
        "token": body.token,
        "platform": body.platform,
        "active": True,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Supabase/PostgREST on_conflict upsert
    try:
        supabase_admin.table("dispositivos_push").upsert(data, on_conflict="provider,token").execute()
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="No pudimos registrar las notificaciones de este dispositivo",
        ) from error
        
    return {"status": "ok", "message": "Dispositivo registrado exitosamente"}

@router.delete("/me/push-devices/{push_token}", status_code=200)
async def unregister_push_device(push_token: str, authorization: str = Header(None)):
    """Elimina el token FCM del usuario actual (ej. al cerrar sesión)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
        
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
    resultado = supabase.table("usuarios").select("id").eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    usuario_id = resultado.data[0]["id"]
    
    try:
        supabase_admin.table("dispositivos_push").delete().eq("usuario_id", usuario_id).eq("token", push_token).eq("provider", "fcm").execute()
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="No pudimos desactivar las notificaciones de este dispositivo",
        ) from error
        
    return {"status": "ok", "message": "Dispositivo eliminado exitosamente"}
