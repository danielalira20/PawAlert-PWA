from fastapi import APIRouter
from app.db.supabase import supabase

router = APIRouter()

@router.get("/tipos-animales", status_code=200)
async def get_tipos_animales():
    resultado = supabase.table("tipo_animal_catalogo")\
        .select("clave, descripcion")\
        .eq("activo", True)\
        .execute()
    return resultado.data

@router.get("/tipos-animal-otro", status_code=200)
async def get_tipos_animal_otro():
    resultado = supabase.table("tipo_animal_otro")\
        .select("clave, descripcion")\
        .eq("activo", True)\
        .execute()
    return resultado.data

@router.get("/condiciones", status_code=200)
async def get_condiciones():
    resultado = supabase.table("condicion_catalogo")\
        .select("clave, descripcion")\
        .eq("activo", True)\
        .execute()
    return resultado.data

@router.get("/tamanios", status_code=200)
async def get_tamanios():
    resultado = supabase.table("tamanio_catalogo")\
        .select("clave, descripcion")\
        .eq("activo", True)\
        .execute()
    return resultado.data

@router.get("/razas/{tipo_animal}", status_code=200)
async def get_razas(tipo_animal: str):
    resultado = supabase.table("raza_catalogo")\
        .select("clave, descripcion")\
        .eq("tipo_animal", tipo_animal)\
        .eq("activo", True)\
        .execute()
    return resultado.data

@router.get("/roles", status_code=200)
async def get_roles():
    resultado = supabase.table("roles")\
        .select("clave:nombre, descripcion")\
        .eq("activo", True)\
        .execute()
    return resultado.data