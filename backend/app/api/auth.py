import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.db.supabase import supabase, supabase_admin, get_fresh_client
from app.utils.validators import validar_telefono, validar_password, validar_email

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nombre: str
    apellido_paterno: str
    apellido_materno: str | None = None
    telefono: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str


class VerifyResetCodeRequest(BaseModel):
    email: str
    codigo: str


class ResetPasswordRequest(BaseModel):
    access_token: str
    refresh_token: str
    nueva_password: str


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    telefono_limpio = body.telefono.replace(" ", "").replace("-", "")
    if not validar_telefono(telefono_limpio):
        raise HTTPException(status_code=422, detail="El teléfono debe tener exactamente 10 dígitos numéricos.")

    password_valida, password_mensaje = validar_password(body.password)
    if not password_valida:
        raise HTTPException(status_code=422, detail=password_mensaje)

    existe = supabase.table("usuarios").select("id, auth_user_id").eq("telefono", telefono_limpio).execute()

    usuario_invitado_id = None
    if existe.data:
        registro_existente = existe.data[0]
        if registro_existente.get("auth_user_id"):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese teléfono")
        usuario_invitado_id = registro_existente["id"]

    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        msg = str(e).lower()
        print(f"[REGISTER ERROR] {str(e)}")
        if any(w in msg for w in ["already", "exists", "registered", "duplicate", "unique"]):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo electrónico.")
        raise HTTPException(status_code=400, detail="No pudimos crear tu cuenta. Intenta de nuevo.")

    auth_user_id = auth_response.user.id

    # obtener rol de reportante
    rol_reportante = supabase.table("roles").select("id").eq("nombre", "reportante").execute()
    rol_reportante_id = rol_reportante.data[0]["id"] if rol_reportante.data else None

    try:
        if usuario_invitado_id:

            # Verificar si el usuario invitado ya tiene rol asignado
            usuario_existente = supabase.table("usuarios").select("rol_id, asociacion_id").eq("id", usuario_invitado_id).execute()
            tiene_rol = usuario_existente.data and usuario_existente.data[0].get("rol_id")

            update_data = {
                "auth_user_id": auth_user_id,
                "nombre": body.nombre,
                "apellido_paterno": body.apellido_paterno,
                "apellido_materno": body.apellido_materno,
                "email": body.email,
            }

            # Solo asignar rol_reportante si no tiene rol previo
            if not tiene_rol:
                update_data["rol_id"] = rol_reportante_id

            usuario = supabase.table("usuarios").update(update_data).eq("id", usuario_invitado_id).execute()
        else:
            usuario = supabase.table("usuarios").insert({
                "auth_user_id": auth_user_id,
                "nombre": body.nombre,
                "apellido_paterno": body.apellido_paterno,
                "apellido_materno": body.apellido_materno,
                "email": body.email,
                "telefono": telefono_limpio,
                "rol_id": rol_reportante_id,
            }).execute()
    except Exception as e:
        supabase_admin.auth.admin.delete_user(auth_user_id)
        raise HTTPException(status_code=500, detail="Error al guardar datos del usuario")

    # Vincular reportes de invitado creados antes de tener cuenta (M-03)
    nuevo_usuario_id = usuario.data[0]["id"]
    try:
        supabase.table("reportes").update({
            "usuario_id": nuevo_usuario_id,
            "reportante_nombre": None,
            "reportante_apellido_paterno": None,
            "reportante_apellido_materno": None,
            "reportante_telefono": None,
        }).eq("reportante_telefono", telefono_limpio).is_("usuario_id", "null").execute()
    except Exception as e:
        print(f"[WARN] No se pudieron vincular reportes de invitado para {telefono_limpio}: {e}")

    login_response = get_fresh_client().auth.sign_in_with_password({
        "email": body.email,
        "password": body.password,
    })

    ###obtener rol del usurio registrado
    rol_result = supabase.table("usuarios").select(
        "roles(nombre)"
    ).eq("id", nuevo_usuario_id).execute()
    rol_nombre = "reportante"
    if rol_result.data and rol_result.data[0].get("roles"):
        rol_nombre = rol_result.data[0]["roles"]["nombre"]
        

    return {
        "access_token": login_response.session.access_token,
        "refresh_token": login_response.session.refresh_token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario.data[0]["id"],
            "nombre": body.nombre,
            "apellido_paterno": body.apellido_paterno,
            "email": body.email,
            "telefono": telefono_limpio,
            "asociacion_id": usuario.data[0].get("asociacion_id"),
            "rol": rol_nombre,  
            "es_admin": rol_nombre == "admin",
        }
    }

@router.post("/login", status_code=200)
async def login(body: LoginRequest):
    try:
        response = get_fresh_client().auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    resultado = supabase.table("usuarios").select(
        "id, nombre, apellido_paterno, apellido_materno, email, telefono, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en el sistema")

    usuario_data = resultado.data[0]
    rol = usuario_data.pop("roles", None)
    usuario_data["es_admin"] = bool(rol and rol.get("nombre") == "admin")
    usuario_data["rol"] = rol.get("nombre") if rol else "reportante"

    return {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "token_type": "bearer",
        "usuario": usuario_data
    }


@router.post("/refresh", status_code=200)
async def refresh_token(body: RefreshRequest):
    """
    Renueva el access_token usando el refresh_token guardado en el dispositivo.
    Se llama automáticamente desde el frontend cuando una petición falla con 401
    (el JWT de Supabase dura solo 1 hora).
    """
    try:
        response = get_fresh_client().auth.refresh_session(body.refresh_token)
    except Exception:
        # El refresh_token también expiró o es inválido — el usuario debe volver a loguearse
        raise HTTPException(status_code=401, detail="Sesión expirada. Vuelve a iniciar sesión.")

    if not response.session:
        raise HTTPException(status_code=401, detail="Sesión expirada. Vuelve a iniciar sesión.")

    return {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "token_type": "bearer",
    }

@router.post("/forgot-password", status_code=200)
async def forgot_password(body: ForgotPasswordRequest):
    """Envía un código de 6 dígitos por correo (vía plantilla 'Reset Password'
    de Supabase Auth, configurada para mostrar {{ .Token }} en vez de un link).
    Nunca revela si el correo existe o no en la respuesta, para evitar
    enumeración de cuentas."""
    if not validar_email(body.email):
        raise HTTPException(status_code=422, detail="Ingresa un correo electrónico válido.")

    try:
        supabase.auth.reset_password_email(body.email)
    except Exception:
        # No revelamos si el correo existe o no — siempre el mismo mensaje
        pass

    return {"mensaje": "Si el correo existe, te enviamos un código de verificación."}

@router.post("/verify-reset-code", status_code=200)
async def verify_reset_code(body: VerifyResetCodeRequest):
    if not body.codigo or len(body.codigo.strip()) != 8:
        raise HTTPException(status_code=422, detail="El código debe tener 8 dígitos.")

    try:
        auth_response = get_fresh_client().auth.verify_otp({
            "email": body.email,
            "token": body.codigo.strip(),
            "type": "recovery",
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Código inválido o expirado.")

    return {
        "access_token": auth_response.session.access_token,
        "refresh_token": auth_response.session.refresh_token,
        "mensaje": "Código verificado correctamente.",
    }


@router.post("/reset-password", status_code=200)
async def reset_password(body: ResetPasswordRequest):
    """Ya NO vuelve a verificar el código — usa la sesión temporal que
    devolvió verify-reset-code. Los códigos OTP de Supabase son de un solo
    uso; verificarlo dos veces con el mismo valor lo invalida.

    Validación de fortaleza: mínimo 6 caracteres, al menos una mayúscula
    y al menos un número — espejo de lo que ya valida el frontend."""
    if len(body.nueva_password) < 6:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 6 caracteres.")
    if not re.search(r"[A-Z]", body.nueva_password):
        raise HTTPException(status_code=422, detail="La contraseña debe incluir al menos una letra mayúscula.")
    if not re.search(r"[0-9]", body.nueva_password):
        raise HTTPException(status_code=422, detail="La contraseña debe incluir al menos un número.")

    try:
        temp_client = get_fresh_client()
        temp_client.auth.set_session(body.access_token, body.refresh_token)
        temp_client.auth.update_user({"password": body.nueva_password})
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Tu sesión de verificación expiró. Solicita un nuevo código.",
        )

    return {"mensaje": "Contraseña actualizada correctamente."}