from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import JSONResponse
from app.models.report import ReportResponse, CondicionEnum, TipoAnimalEnum, TamanioEnum, SexoEnum, EdadEnum, ReportListItem, HitoRequest, RechazarReporteRequest
from app.services.report_service import crear_reporte, obtener_reportes, cambiar_estado_reporte, obtener_reportes_usuario
from app.utils.validators import validar_telefono, validar_email
from typing import Optional, List
from app.db.supabase import supabase


router = APIRouter()
def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        from app.db.supabase import supabase
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    resultado = supabase.table("usuarios").select("id, asociacion_id").eq(
        "auth_user_id", auth_response.user.id
    ).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return resultado.data[0]

@router.post("", status_code=201)
async def create_report(
    nombre: Optional[str] = Form(None),
    apellido_paterno: Optional[str] = Form(None),
    apellido_materno: Optional[str] = Form(None),
    telefono: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    usuario_id: Optional[str] = Form(None),
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
    estado_ubicacion: Optional[str] = Form(None),
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
    if not usuario_id and not nombre:
        raise HTTPException(status_code=422, detail="Se requiere nombre o usuario_id")

    if not usuario_id and not telefono:
        raise HTTPException(status_code=422, detail="Se requiere teléfono o usuario_id")

    if telefono and not validar_telefono(telefono):
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

    resultado = await crear_reporte(
        nombre=nombre,
        apellido_paterno=apellido_paterno,
        apellido_materno=apellido_materno,
        telefono=telefono,
        email=email,
        usuario_id=usuario_id,
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
        estado_ubicacion=estado_ubicacion,
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

    if resultado.get("posible_duplicado"):
        return JSONResponse(status_code=200, content=resultado)

    return resultado

### Endpoint para que el representante pueda seleccionar STAFF
@router.post("/{reporte_id}/asignar-staff", status_code=200)
async def asignar_staff(reporte_id: str, body: dict, authorization: str = Header(None)):
    """El representante acepta un reporte y asigna a un miembro del staff."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    usuario = supabase.table("usuarios").select(
        "id, asociacion_id"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not usuario.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = usuario.data[0]
    asociacion_id = usuario.get("asociacion_id")

    if not asociacion_id:
        raise HTTPException(status_code=403, detail="No estás vinculado a ninguna asociación")


    
    # Verificar que el reporte le pertenece a esta asociación
    reporte = supabase.table("reportes").select(
        "id, estado_reporte, asociacion_asignada_id"
    ).eq("id", reporte_id).execute()


    
    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte["asociacion_asignada_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Este reporte no pertenece a tu asociación")

    if reporte["estado_reporte"] != "asignado":
        raise HTTPException(status_code=400, detail="Este reporte ya fue aceptado o no está disponible")

    # Obtener y validar staff_id del body
    staff_id = body.get("staff_id")
    if not staff_id:
        raise HTTPException(status_code=422, detail="Debes seleccionar un miembro del staff")

    # Verificar que el staff pertenece a la misma asociación
    staff = supabase.table("usuarios").select(
        "id, nombre, apellido_paterno, rol_id"
    ).eq("id", staff_id).eq("asociacion_id", asociacion_id).execute()

    if not staff.data:
        raise HTTPException(status_code=404, detail="El miembro del staff no existe o no pertenece a tu asociación")

    # Verificar disponibilidad del staff
    casos_activos = supabase.table("reportes").select(
        "id, animal(condicion_catalogo(clave))"
    ).eq("staff_asignado_id", staff_id).in_(
        "estado_reporte", ["en_camino", "en_atencion"]
    ).execute()

    casos = casos_activos.data or []
    tiene_caso_grave = any(
        c.get("animal", {}).get("condicion_catalogo", {}).get("clave") == "grave"
        for c in casos
    )

    if tiene_caso_grave:
        raise HTTPException(status_code=400, detail="Este miembro del staff tiene un caso grave activo")
    if len(casos) >= 2:
        raise HTTPException(status_code=400, detail="Este miembro del staff tiene 2 o más casos activos")

    # Asignar staff y cambiar estado a en_camino
    estado_en_camino_id = supabase.table("reporte_estados").select(
        "id"
    ).eq("clave", "en_camino").execute()

    if not estado_en_camino_id.data:
        raise HTTPException(status_code=500, detail="Error al resolver estado en_camino")

    supabase.table("reportes").update({
        "staff_asignado_id": staff_id,
        "estado_reporte": "en_camino",
        "estado_id": estado_en_camino_id.data[0]["id"],
    }).eq("id", reporte_id).execute()

    # Actualizar estado de asignación
    estado_aceptada_id = supabase.table("asignacion_estados").select(
        "id"
    ).eq("clave", "aceptada").execute()

    if estado_aceptada_id.data:
        supabase.table("reporte_asignaciones").update({
            "estado_id": estado_aceptada_id.data[0]["id"],
            "estado": "aceptada",
        }).eq("reporte_id", reporte_id).eq("asociacion_id", asociacion_id).execute()

    # Registrar en historial
    from app.services.report_service import registrar_historial
    staff_nombre = f"{staff.data[0]['nombre']} {staff.data[0]['apellido_paterno']}"
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento="staff_asignado",
        descripcion=f"Reporte asignado a {staff_nombre}",
        datos_extra={"staff_id": staff_id, "staff_nombre": staff_nombre}
    )

    return {
        "mensaje": f"Reporte asignado a {staff_nombre}. Estado actualizado a en_camino.",
        "staff_asignado": staff_nombre,
        "estado": "en_camino"
    }
#### FIN endpoint: Representante selecciona staff


# Endpoind: POST hitos fotos 
@router.post("/{reporte_id}/hitos/foto", status_code=200)
async def subir_foto_hito(
    reporte_id: str,
    foto: UploadFile = File(...),
    authorization: str = Header(None)
):
    """Sube una foto para un hito y devuelve la URL en Supabase Storage."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
        raise HTTPException(status_code=422, detail="La foto debe ser JPG, PNG o WEBP")

    from app.services.storage_service import subir_foto
    foto_url = await subir_foto(foto, carpeta="reportes/hitos")

    return {"foto_url": foto_url}

#FIN: endpoind hitos fotos


### Enpoint para staff en donde registra avances del rescate 
@router.post("/{reporte_id}/hitos", status_code=201)
async def registrar_hito(reporte_id: str, body: HitoRequest, authorization: str = Header(None)):
    """El staff registra el avance del rescate."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    usuario = supabase.table("usuarios").select(
        "id, asociacion_id"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not usuario.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = usuario.data[0]

    # Verificar que el reporte existe y está asignado a este staff
    reporte = supabase.table("reportes").select(
        "id, estado_reporte, staff_asignado_id, asociacion_asignada_id"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte["staff_asignado_id"] != usuario["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para registrar hitos en este reporte")

    # Validar tipo de hito
    if body.tipo_hito not in ["encontre_animal", "llegue_refugio"]:
        raise HTTPException(status_code=422, detail="Tipo de hito inválido")

    # Validar flujo de estados
    if body.tipo_hito == "encontre_animal" and reporte["estado_reporte"] != "en_camino":
        raise HTTPException(status_code=400, detail="El reporte debe estar en estado en_camino para registrar este hito")

    if body.tipo_hito == "llegue_refugio" and reporte["estado_reporte"] != "en_atencion":
        raise HTTPException(status_code=400, detail="El reporte debe estar en estado en_atencion para registrar este hito")

    # Validación GPS obligatoria para llegue_refugio
    if body.tipo_hito == "llegue_refugio":
        if not body.latitud or not body.longitud:
            raise HTTPException(status_code=422, detail="La ubicación GPS es obligatoria para registrar la llegada al refugio")

        if not body.foto_url:
            raise HTTPException(status_code=422, detail="La foto es obligatoria para registrar la llegada al refugio")

        # Obtener ubicación del refugio
        asociacion = supabase.table("asociaciones").select(
            "latitud, longitud"
        ).eq("id", reporte["asociacion_asignada_id"]).execute()

        if not asociacion.data:
            raise HTTPException(status_code=404, detail="Asociación no encontrada")

        refugio_lat = float(asociacion.data[0]["latitud"])
        refugio_lon = float(asociacion.data[0]["longitud"])

        # Calcular distancia en metros usando fórmula de Haversine
        import math
        R = 6371000  # radio de la tierra en metros
        lat1, lon1 = math.radians(body.latitud), math.radians(body.longitud)
        lat2, lon2 = math.radians(refugio_lat), math.radians(refugio_lon)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        distancia_metros = R * 2 * math.asin(math.sqrt(a))

        if distancia_metros > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tu ubicación no coincide con el refugio. Estás a {round(distancia_metros)} metros. Debes estar dentro de 200 metros."
            )

    # Determinar nuevo estado
    nuevo_estado = "en_atencion" if body.tipo_hito == "encontre_animal" else "rescatado"
    estado_id = supabase.table("reporte_estados").select("id").eq("clave", nuevo_estado).execute()

    if not estado_id.data:
        raise HTTPException(status_code=500, detail=f"Error al resolver estado {nuevo_estado}")

    # Actualizar estado del reporte
    supabase.table("reportes").update({
        "estado_reporte": nuevo_estado,
        "estado_id": estado_id.data[0]["id"],
    }).eq("id", reporte_id).execute()

    # Registrar en historial
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento=f"hito_{body.tipo_hito}",
        descripcion=f"Hito registrado: {body.tipo_hito}",
        datos_extra={
            "condicion_observada": body.condicion_observada,
            "comentario": body.comentario,
            "foto_url": body.foto_url,
            "latitud": body.latitud,
            "longitud": body.longitud,
        }
    )

    return {
        "mensaje": f"Hito '{body.tipo_hito}' registrado correctamente.",
        "estado": nuevo_estado
    }

### FIN endpoind: staff registra avances del rescate 

### Endpoint: logica post rechazo de reportes 
@router.patch("/{reporte_id}/rechazar", status_code=200)
async def rechazar_reporte(reporte_id: str, body: RechazarReporteRequest, authorization: str = Header(None)):
    """El representante rechaza un reporte. El sistema busca automáticamente
    la siguiente asociación más cercana."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    usuario = supabase.table("usuarios").select(
        "id, asociacion_id"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not usuario.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = usuario.data[0]
    asociacion_id = usuario.get("asociacion_id")

    if not asociacion_id:
        raise HTTPException(status_code=403, detail="No estás vinculado a ninguna asociación")

    # Verificar que el reporte existe y pertenece a esta asociación
    reporte = supabase.table("reportes").select(
        "id, estado_reporte, asociacion_asignada_id, latitud, longitud, municipio"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte["asociacion_asignada_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Este reporte no pertenece a tu asociación")

    if reporte["estado_reporte"] != "asignado":
        raise HTTPException(status_code=400, detail="Solo puedes rechazar reportes en estado asignado")

    # Registrar rechazo en historial
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento="reporte_rechazado",
        descripcion=f"Reporte rechazado por la asociación. Motivo: {body.motivo}",
        datos_extra={"motivo": body.motivo, "comentario": body.comentario, "asociacion_id": asociacion_id}
    )

    # Actualizar estado de asignación actual a rechazada
    estado_rechazada_id = supabase.table("asignacion_estados").select(
        "id"
    ).eq("clave", "rechazada").execute()

    if estado_rechazada_id.data:
        supabase.table("reporte_asignaciones").update({
            "estado_id": estado_rechazada_id.data[0]["id"],
            "estado": "rechazada",
        }).eq("reporte_id", reporte_id).eq("asociacion_id", asociacion_id).execute()

    # Buscar siguiente asociación más cercana excluyendo las que ya rechazaron
    asociaciones_rechazadas = supabase.table("reporte_asignaciones").select(
        "asociacion_id"
    ).eq("reporte_id", reporte_id).execute()

    ids_rechazadas = [r["asociacion_id"] for r in (asociaciones_rechazadas.data or [])]

    # Intentar reasignar
    from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
    nueva_asociacion = None

    if reporte.get("latitud") and reporte.get("longitud"):
        candidata = asignar_asociacion(reporte["latitud"], reporte["longitud"])
        if candidata and candidata["id"] not in ids_rechazadas:
            nueva_asociacion = candidata

    if nueva_asociacion:
        # Asignar a nueva asociación
        estado_asignado_id = supabase.table("reporte_estados").select(
            "id"
        ).eq("clave", "asignado").execute()

        supabase.table("reportes").update({
            "asociacion_asignada_id": nueva_asociacion["id"],
            "estado_reporte": "asignado",
            "estado_id": estado_asignado_id.data[0]["id"],
            "staff_asignado_id": None,
        }).eq("id", reporte_id).execute()

        # Crear nueva asignación
        estado_notificada_id = supabase.table("asignacion_estados").select(
            "id"
        ).eq("clave", "notificada").execute()

        supabase.table("reporte_asignaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": nueva_asociacion["id"],
            "estado_id": estado_notificada_id.data[0]["id"],
            "estado": "notificada",
        }).execute()

        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=None,
            tipo_evento="reasignacion_automatica",
            descripcion=f"Reasignado automáticamente a {nueva_asociacion['nombre']}",
            datos_extra={"nueva_asociacion_id": nueva_asociacion["id"], "nueva_asociacion_nombre": nueva_asociacion["nombre"]}
        )

        return {
            "mensaje": "Reporte rechazado y reasignado automáticamente.",
            "nueva_asociacion": nueva_asociacion["nombre"],
            "estado": "asignado"
        }

    else:
        # Sin cobertura
        estado_sin_cobertura_id = supabase.table("reporte_estados").select(
            "id"
        ).eq("clave", "sin_cobertura").execute()

        supabase.table("reportes").update({
            "asociacion_asignada_id": None,
            "estado_reporte": "sin_cobertura",
            "estado_id": estado_sin_cobertura_id.data[0]["id"],
            "staff_asignado_id": None,
        }).eq("id", reporte_id).execute()

        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=None,
            tipo_evento="sin_cobertura",
            descripcion="No hay más asociaciones disponibles en la zona",
            datos_extra={"motivo_rechazo": body.motivo}
        )

        contactos = obtener_contactos_emergencia(
            tipo_animal="perro",
            municipio=reporte.get("municipio")
        )

        return {
            "mensaje": "Reporte rechazado. No hay más asociaciones disponibles en la zona.",
            "contactos_emergencia": contactos,
            "estado": "sin_cobertura"
        }

### FIN: postrechazo de reportes

@router.get("", response_model=list[ReportListItem], status_code=200)
async def get_reports():
    return await obtener_reportes()

@router.patch("/{reporte_id}/status", status_code=200)
async def update_report_status(reporte_id: str, body: dict):
    return await cambiar_estado_reporte(reporte_id, body.get("estado"))

@router.get("/me", status_code=200)
async def get_mis_reportes(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_reportes_usuario(usuario["id"])