from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.db.supabase import supabase, supabase_admin

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


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    telefono_limpio = body.telefono.replace(" ", "").replace("-", "")
    if not telefono_limpio.isdigit() or len(telefono_limpio) != 10:
        raise HTTPException(status_code=422, detail="El teléfono debe tener exactamente 10 dígitos")

    existe = supabase.table("usuarios").select("id").eq("telefono", telefono_limpio).execute()
    if existe.data:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese teléfono")

    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "exists" in msg:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo")
        raise HTTPException(status_code=400, detail=f"Error al crear cuenta: {e}")

    auth_user_id = auth_response.user.id

    try:
        usuario = supabase.table("usuarios").insert({
            "auth_user_id": auth_user_id,
            "nombre": body.nombre,
            "apellido_paterno": body.apellido_paterno,
            "apellido_materno": body.apellido_materno,
            "email": body.email,
            "telefono": telefono_limpio,
        }).execute()
    except Exception as e:
        supabase_admin.auth.admin.delete_user(auth_user_id)
        raise HTTPException(status_code=500, detail="Error al guardar datos del usuario")

    login_response = supabase.auth.sign_in_with_password({
        "email": body.email,
        "password": body.password,
    })

    return {
        "access_token": login_response.session.access_token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario.data[0]["id"],
            "nombre": body.nombre,
            "apellido_paterno": body.apellido_paterno,
            "email": body.email,
            "telefono": telefono_limpio,
        }
    }


@router.post("/login", status_code=200)
async def login(body: LoginRequest):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    resultado = supabase.table("usuarios").select(
        "id, nombre, apellido_paterno, apellido_materno, email, telefono"
    ).eq("auth_user_id", response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en el sistema")

    return {
        "access_token": response.session.access_token,
        "token_type": "bearer",
        "usuario": resultado.data[0]
    }
