from fastapi import APIRouter, HTTPException,Header
from app.db.supabase import supabase

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
        "id, nombre, apellido_paterno, apellido_materno, email, telefono, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()
 
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
 
    usuario_data = resultado.data[0]
    rol = usuario_data.pop("roles", None)
    usuario_data["es_admin"] = bool(rol and rol.get("nombre") == "admin")
    # None cuando rol_id es NULL de verdad (ver mismo comentario en auth.py) —
    # distingue una cuenta sin rol de una que sí tiene 'reportante' asignado.
    usuario_data["rol"] = rol.get("nombre") if rol else None

    perfil_apoyo = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_data["id"]).execute()
    usuario_data["tiene_perfil_apoyo"] = bool(perfil_apoyo.data)
 
    return usuario_data
