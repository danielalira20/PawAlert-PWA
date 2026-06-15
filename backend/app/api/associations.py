from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional, List
from app.models.association import AssociationResponse, AssociationPublicResponse
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
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

    # Parsear tipos de animales
    print(f"tipos_animales recibido: '{tipos_animales}'")
    # Parsear tipos de animales — acepta JSON array o string separado por comas
    if not tipos_animales or not tipos_animales.strip():
        raise HTTPException(status_code=422, detail="Debes seleccionar al menos un tipo de animal")

    try:
        tipos = json.loads(tipos_animales)
    except json.JSONDecodeError:
        tipos = [t.strip() for t in tipos_animales.split(",") if t.strip()]
    
    # Insertar asociación
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

    # Insertar en ASOCIACION_TIPO_ANIMAL
    for tipo_clave in tipos:
        tipo_id = obtener_id_catalogo("tipo_animal_catalogo", tipo_clave)
        if tipo_id:
            supabase.table("asociacion_tipo_animal").insert({
                "asociacion_id": asociacion_id,
                "tipo_animal_id": tipo_id,
            }).execute()

    # Subir fotos adicionales si existen
    if fotos:
        descripciones = json.loads(fotos_descripciones) if fotos_descripciones and fotos_descripciones.strip() else []
        ordenes = json.loads(fotos_ordenes) if fotos_ordenes and fotos_ordenes.strip() else []

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

@router.get("", status_code=200)
async def get_associations():
    resultado = supabase.table("asociaciones").select(
        "id, nombre, contacto_telefono, contacto_email, "
        "latitud, longitud, radio_km, horario_atencion, activo, "
        "asociacion_tipo_animal(tipo_animal_catalogo(clave, descripcion))"
    ).eq("verificado", True).eq("activo", True).execute()

    asociaciones = []
    for a in resultado.data:
        tipos = []
        if a.get("asociacion_tipo_animal"):
            tipos = [
                t["tipo_animal_catalogo"]["clave"]
                for t in a["asociacion_tipo_animal"]
                if t.get("tipo_animal_catalogo")
            ]

        asociaciones.append({
            "id": a["id"],
            "nombre": a["nombre"],
            "contacto_telefono": a["contacto_telefono"],
            "contacto_email": a["contacto_email"],
            "tipos_animales": tipos,
            "latitud": a["latitud"],
            "longitud": a["longitud"],
            "radio_km": a["radio_km"],
            "horario_atencion": a.get("horario_atencion"),
            "activo": a["activo"],
        })

    return asociaciones