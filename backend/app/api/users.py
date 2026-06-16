from fastapi import APIRouter, HTTPException
from app.db.supabase import supabase

router = APIRouter()


@router.get("/phone/{telefono}", status_code=200)
async def get_user_by_phone(telefono: str):
    """Flujo invitado: busca usuario por teléfono para autorellenar el formulario."""
    telefono_limpio = telefono.replace(" ", "").replace("-", "")

    resultado = supabase.table("usuarios").select(
        "nombre, apellido_paterno, apellido_materno, email, telefono"
    ).eq("telefono", telefono_limpio).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="No existe usuario con ese teléfono")

    return resultado.data[0]
