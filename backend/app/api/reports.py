from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from app.models.report import ReportResponse, CondicionEnum, TipoAnimalEnum, TamanioEnum
from app.services.report_service import crear_reporte, obtener_reportes, cambiar_estado_reporte

router = APIRouter()

@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(
    nombre: str = Form(...),
    apellido_paterno: str = Form(...),
    apellido_materno: Optional[str] = Form(None),
    telefono: str = Form(...),
    email: Optional[str] = Form(None),
    foto: UploadFile = File(...),
    condicion: CondicionEnum = Form(...),
    tipo_animal: TipoAnimalEnum = Form(...),
    tamanio: TamanioEnum = Form(...),
    latitud: Optional[float] = Form(None),
    longitud: Optional[float] = Form(None),
    calle: Optional[str] = Form(None),
    colonia: Optional[str] = Form(None),
    municipio: Optional[str] = Form(None),
    referencia: Optional[str] = Form(None),
    descripcion: Optional[str] = Form(None),
):
        # Validar que viene ubicación de algún tipo
    if not latitud and not longitud and not municipio:
        raise HTTPException(
            status_code=422,
            detail="Debes proporcionar coordenadas GPS o municipio como mínimo"
        )

    # Validar tipo de archivo
    if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
        raise HTTPException(
            status_code=422,
            detail="La foto debe ser una imagen JPG, PNG o WEBP"
        )

    # Validar descripción
    if descripcion and len(descripcion) > 200:
        raise HTTPException(
            status_code=422,
            detail="La descripción no puede superar 200 caracteres"
        )
    
    return await crear_reporte(
        nombre=nombre,
        apellido_paterno=apellido_paterno,
        apellido_materno=apellido_materno,
        telefono=telefono,
        email=email,
        foto=foto,
        tipo_animal=tipo_animal,
        tamanio=tamanio,
        latitud=latitud,
        longitud=longitud,
        condicion=condicion,
        descripcion=descripcion,
        calle=calle,
        colonia=colonia,
        municipio=municipio,
        referencia=referencia,
    )

@router.get("", status_code=200)
async def get_reports():
    return await obtener_reportes()

@router.patch("/{reporte_id}/status", status_code=200)
async def update_report_status(reporte_id: str, body: dict):
    return await cambiar_estado_reporte(reporte_id, body.get("estado"))