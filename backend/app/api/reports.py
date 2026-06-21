from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.models.report import ReportResponse, CondicionEnum, TipoAnimalEnum, TamanioEnum, SexoEnum, EdadEnum, ReportListItem
from app.services.report_service import crear_reporte, obtener_reportes, cambiar_estado_reporte
from app.utils.validators import validar_telefono, validar_email
from typing import Optional, List

router = APIRouter()

@router.post("", status_code=201)
async def create_report(
    nombre: str = Form(...),
    apellido_paterno: str = Form(...),
    apellido_materno: Optional[str] = Form(None),
    telefono: str = Form(...),
    email: Optional[str] = Form(None),
    fotos: Optional[List[UploadFile]] = File(None),
    fotos_ordenes: Optional[str] = Form(None),
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
    sexo: Optional[SexoEnum] = Form(None),
    edad_aproximada: Optional[EdadEnum] = Form(None),
    tiene_collar: Optional[bool] = Form(None),
    esta_prenada: Optional[bool] = Form(None),
    es_agresivo: Optional[bool] = Form(None),
    es_domestico_probable: Optional[bool] = Form(None),
    raza_clave: Optional[str] = Form(None),
    tipo_animal_otro_clave: Optional[str] = Form(None),
    especie_descripcion: Optional[str] = Form(None),
    es_duplicado_confirmado: Optional[bool] = Form(None),
    reporte_original_id: Optional[str] = Form(None),
):
    if not validar_telefono(telefono):
        raise HTTPException(
            status_code=422,
            detail="El teléfono debe tener exactamente 10 dígitos numéricos."
        )

    if email and not validar_email(email):
        raise HTTPException(
            status_code=422,
            detail="Ingresa un correo electrónico válido."
        )

    if not latitud and not longitud and not municipio:
        raise HTTPException(
            status_code=422,
            detail="Debes proporcionar coordenadas GPS o municipio como mínimo"
        )

    if fotos:
        for foto in fotos:
            if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
                raise HTTPException(
                    status_code=422,
                    detail="Todas las fotos deben ser imágenes JPG, PNG o WEBP"
                )

    if descripcion and len(descripcion) > 300:
        raise HTTPException(
            status_code=422,
            detail="La descripción no puede superar 300 caracteres"
        )

    return await crear_reporte(
        nombre=nombre,
        apellido_paterno=apellido_paterno,
        apellido_materno=apellido_materno,
        telefono=telefono,
        email=email,
        fotos=fotos,
        fotos_ordenes=fotos_ordenes,
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
        sexo=sexo,
        edad_aproximada=edad_aproximada,
        tiene_collar=tiene_collar,
        esta_prenada=esta_prenada,
        es_agresivo=es_agresivo,
        es_domestico_probable=es_domestico_probable,
        raza_clave=raza_clave,
        tipo_animal_otro_clave=tipo_animal_otro_clave,
        especie_descripcion=especie_descripcion,
        es_duplicado_confirmado=es_duplicado_confirmado,
        reporte_original_id=reporte_original_id,
    )

@router.get("", response_model=list[ReportListItem], status_code=200)
async def get_reports():
    return await obtener_reportes()

@router.patch("/{reporte_id}/status", status_code=200)
async def update_report_status(reporte_id: str, body: dict):
    return await cambiar_estado_reporte(reporte_id, body.get("estado"))
