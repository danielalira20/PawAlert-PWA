from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional, List
from app.models.association import AssociationCreate, AssociationResponse, AssociationPublicResponse
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
import json

router = APIRouter()

@router.post("", response_model=AssociationResponse, status_code=201)
async def create_association(
    nombre: str = Form(...),
    nombre_responsable: str = Form(...),
    contacto_telefono: str = Form(...),
    contacto_email: str = Form(...),
    tipos_animales: str = Form(...),
    latitud: float = Form(...),
    longitud: float = Form(...),
    radio_km: int = Form(...),
    acerca_de: Optional[str] = Form(None),
    horario_atencion: Optional[str] = Form(None),
    calle: Optional[str] = Form(None),
    colonia: Optional[str] = Form(None),
    municipio: Optional[str] = Form(None),
    referencia: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    fotos: Optional[List[UploadFile]] = File(None),
    fotos_descripciones: Optional[str] = Form(None),
    fotos_ordenes: Optional[str] = Form(None),
):
    # Subir logo si existe
    logo_url = None
    if logo and logo.filename:
        if logo.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
            raise HTTPException(status_code=422, detail="El logo debe ser una imagen JPG, PNG o WEBP")
        logo_url = await subir_foto(logo, carpeta="asociaciones/logos")

    # Insertar asociación
    tipos = json.loads(tipos_animales)
    
    resultado = supabase.table("asociaciones").insert({
        "nombre": nombre,
        "nombre_responsable": nombre_responsable,
        "contacto_telefono": contacto_telefono,
        "contacto_email": contacto_email,
        "tipos_animales": tipos,
        "latitud": latitud,
        "longitud": longitud,
        "radio_km": radio_km,
        "acerca_de": acerca_de,
        "horario_atencion": horario_atencion,
        "calle": calle,
        "colonia": colonia,
        "municipio": municipio,
        "referencia": referencia,
        "logo_url": logo_url,
        "verificado": False,
        "activo": True,
    }).execute()

    asociacion_id = resultado.data[0]["id"]

    # Subir fotos adicionales si existen
    if fotos:
        descripciones = json.loads(fotos_descripciones) if fotos_descripciones else []
        ordenes = json.loads(fotos_ordenes) if fotos_ordenes else []

        for i, foto in enumerate(fotos):
            if foto and foto.filename:
                foto_url = await subir_foto(foto, carpeta="asociaciones/fotos")
                supabase.table("asociacion_fotos").insert({
                    "asociacion_id": asociacion_id,
                    "foto_url": foto_url,
                    "descripcion": descripciones[i] if i < len(descripciones) else None,
                    "orden": ordenes[i] if i < len(ordenes) else i + 1,
                }).execute()

    return AssociationResponse()

@router.get("", response_model=List[AssociationPublicResponse], status_code=200)
async def get_associations():
    resultado = supabase.table("asociaciones").select(
        "id, nombre, contacto_telefono, contacto_email, "
        "tipos_animales, latitud, longitud, radio_km, "
        "horario_atencion, activo"
    ).eq("verificado", True).eq("activo", True).execute()
    
    return resultado.data