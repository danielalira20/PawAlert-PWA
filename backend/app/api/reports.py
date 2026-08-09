from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from app.models.report import ReportResponse, AnimalInput, ReportListItem, HitoRequest, RechazarReporteRequest, CancelarReporteRequest, DenunciarReporteRequest, ResolverBusquedaNoLocalizadoRequest
from app.models.red_aliados import AceptarSugerenciaRequest, AceptarSugerenciaVeterinariaResponse
from app.services.report_service import crear_reporte, obtener_reportes, cambiar_estado_reporte, obtener_reportes_usuario
from app.services import coverage_service
from app.utils.validators import validar_telefono, validar_email, validar_nombre
from app.utils.animal_shaping import shape_animal_embed, condicion_mas_grave
from typing import Optional, List
from app.db.supabase import supabase, supabase_admin
from datetime import datetime, timedelta, timezone
import json
import math


router = APIRouter()
RADIO_LLEGADA_ZONA_METROS = 500
LIMITE_DISCREPANCIA_EXIF_METROS = 200
LIMITE_RECHAZOS_VALIDACION_FOTO = 3
MINUTOS_BLOQUEO_VALIDACION_FOTO = 5
MENSAJE_BLOQUEO_VALIDACION_FOTO = (
    "Bloqueamos la validación de fotos por 5 minutos por múltiples "
    "intentos fallidos. Intenta de nuevo en unos minutos."
)

HITOS_CANONICOS = {
    "encontre_animal": "animal_encontrado",
    "llego_veterinaria": "llegada_veterinaria",
}

EVENTOS_HISTORIAL_POR_HITO = {
    "llegada_zona_reporte": "llegada_zona_reporte",
    "animal_encontrado": "animal_encontrado",
    "animal_no_localizado": "animal_no_localizado",
    "animal_bajo_resguardo": "animal_bajo_resguardo",
    "llegada_veterinaria": "llegada_veterinaria",
    "llegada_hogar_temporal": "llegada_hogar_temporal",
    # El refugio interno aún no forma parte de los hitos canónicos del
    # voluntariado externo. Conserva su evento histórico anterior.
    "llegue_refugio": "hito_llegue_refugio",
}


def _distancia_metros(
    latitud_origen: float,
    longitud_origen: float,
    latitud_destino: float,
    longitud_destino: float,
) -> float:
    radio_tierra = 6371000
    lat1 = math.radians(float(latitud_origen))
    lon1 = math.radians(float(longitud_origen))
    lat2 = math.radians(float(latitud_destino))
    lon2 = math.radians(float(longitud_destino))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    haversine = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return radio_tierra * 2 * math.asin(math.sqrt(haversine))


def _fecha_utc(fecha: datetime) -> datetime:
    """Normaliza fechas del cliente sin depender de la zona horaria del servidor."""
    if fecha.tzinfo is None:
        return fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc)


def _vincular_y_verificar_evidencia(
    *,
    evidencia_id: str,
    reporte_id: str,
    usuario_id: str,
    tipo_hito: str,
    foto_url: str | None,
    latitud_declarada: float | None,
    longitud_declarada: float | None,
) -> dict:
    """Vincula la evidencia al hito y compara EXIF contra el GPS declarado."""
    resultado = (
        supabase_admin.table("reporte_evidencias")
        .select(
            "id, reporte_id, usuario_id, foto_url, tipo_hito, vinculada_at, "
            "exif_latitud, exif_longitud"
        )
        .eq("id", evidencia_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=422, detail="La evidencia fotográfica no existe")

    evidencia = resultado.data[0]
    if evidencia.get("reporte_id") != reporte_id or evidencia.get("usuario_id") != usuario_id:
        raise HTTPException(status_code=403, detail="La evidencia no pertenece a este reporte o usuario")
    if foto_url and evidencia.get("foto_url") != foto_url:
        raise HTTPException(status_code=422, detail="La fotografía no coincide con la evidencia registrada")
    if evidencia.get("vinculada_at"):
        raise HTTPException(status_code=409, detail="La evidencia ya fue utilizada en otro hito")

    exif_latitud = evidencia.get("exif_latitud")
    exif_longitud = evidencia.get("exif_longitud")
    distancia = None
    requiere_revision = False

    if exif_latitud is None or exif_longitud is None:
        estado = "sin_gps_exif"
    elif latitud_declarada is None or longitud_declarada is None:
        # El modelo permite hitos internos sin GPS; no se inventa una comparación.
        estado = "sin_gps_exif"
    else:
        distancia = _distancia_metros(
            exif_latitud,
            exif_longitud,
            latitud_declarada,
            longitud_declarada,
        )
        requiere_revision = distancia > LIMITE_DISCREPANCIA_EXIF_METROS
        estado = "discrepancia" if requiere_revision else "coincidente"

    ahora = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("reporte_evidencias").update(
        {
            "tipo_hito": tipo_hito,
            "gps_declarada_latitud": latitud_declarada,
            "gps_declarada_longitud": longitud_declarada,
            "distancia_exif_declarada_m": distancia,
            "estado_verificacion": estado,
            "requiere_revision": requiere_revision,
            "vinculada_at": ahora,
        }
    ).eq("id", evidencia_id).execute()

    return {
        "evidencia_id": evidencia_id,
        "estado": estado,
        "distancia_metros": round(distancia) if distancia is not None else None,
        "requiere_revision": requiere_revision,
    }


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        from app.db.supabase import supabase
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    resultado = supabase.table("usuarios").select(
        "id, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }


def _verificar_rol(usuario: dict, roles_permitidos: tuple[str, ...]) -> None:
    """Bloquea el acceso si el rol del usuario no está entre los permitidos.
    Necesario desde que voluntario_interno/externo también reciben
    asociacion_id al ser aceptados — sin este check, cualquier voluntario
    pasaría la validación de 'está vinculado a una asociación'."""
    if usuario.get("rol") not in roles_permitidos:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para realizar esta acción"
        )
    
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
    fotos_animal_index: Optional[str] = Form(None),
    animales: str = Form(...),
    latitud: Optional[float] = Form(None),
    longitud: Optional[float] = Form(None),
    calle: Optional[str] = Form(None),
    colonia: Optional[str] = Form(None),
    municipio: Optional[str] = Form(None),
    estado_ubicacion: Optional[str] = Form(None),
    referencia: Optional[str] = Form(None),
    es_duplicado_confirmado: Optional[bool] = Form(None),
    reporte_original_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
):
    # Si el usuario está logueado (viene token), resolvemos su usuario_id
    # automáticamente desde el token — sin depender de que el frontend lo mande.
    # Esto evita reportes "huérfanos" con usuario_id=null cuando sí hay sesión activa.
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        try:
            auth_response = supabase.auth.get_user(token)
            resultado = supabase.table("usuarios").select("id").eq(
                "auth_user_id", auth_response.user.id
            ).execute()
            if resultado.data:
                usuario_id = resultado.data[0]["id"]
        except Exception:
            # Token inválido/expirado: seguimos como invitado, no bloqueamos el reporte
            pass

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

    # nombre/apellidos son del reportante invitado (guest) — cuando hay
    # sesión activa el frontend no los manda (ver arriba), así que solo se
    # validan cuando sí vienen informados en el form.
    if nombre is not None:
        nombre_valido, nombre_mensaje = validar_nombre(nombre, campo="nombre")
        if not nombre_valido:
            raise HTTPException(status_code=422, detail=nombre_mensaje)

    if apellido_paterno is not None:
        apellido_paterno_valido, apellido_paterno_mensaje = validar_nombre(
            apellido_paterno, campo="apellido paterno"
        )
        if not apellido_paterno_valido:
            raise HTTPException(status_code=422, detail=apellido_paterno_mensaje)

    if apellido_materno is not None:
        apellido_materno_valido, apellido_materno_mensaje = validar_nombre(
            apellido_materno, requerido=False, campo="apellido materno"
        )
        if not apellido_materno_valido:
            raise HTTPException(status_code=422, detail=apellido_materno_mensaje)

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

    try:
        animales_raw = json.loads(animales)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="animales debe ser un JSON válido")

    if not isinstance(animales_raw, list) or not animales_raw:
        raise HTTPException(status_code=422, detail="animales debe ser una lista con al menos un animal")

    try:
        animales_data = [AnimalInput(**a) for a in animales_raw]
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Datos de animal inválidos: {e}")

    resultado = await crear_reporte(
        nombre=nombre,
        apellido_paterno=apellido_paterno,
        apellido_materno=apellido_materno,
        telefono=telefono,
        email=email,
        usuario_id=usuario_id,
        fotos=fotos,
        fotos_ordenes=fotos_ordenes,
        fotos_animal_index=fotos_animal_index,
        animales=animales_data,
        latitud=latitud,
        longitud=longitud,
        calle=calle,
        colonia=colonia,
        municipio=municipio,
        estado_ubicacion=estado_ubicacion,
        referencia=referencia,
        es_duplicado_confirmado=es_duplicado_confirmado,
        reporte_original_id=reporte_original_id,
    )

    if resultado.get("posible_duplicado"):
        return JSONResponse(status_code=200, content=resultado)

    return resultado


### Endpoint: pre-check de foto con Gemini Vision antes de armar el reporte
@router.post("/validar-foto", status_code=200)
async def validar_foto(
    foto: UploadFile = File(...),
    latitud: float | None = Form(None),
    longitud: float | None = Form(None),
    from_camera: bool = Form(False),
    device_token: str = Form(...),
):
    """Verifica que la foto muestre un animal real antes de que el usuario
    complete el resto del formulario. No toca Storage ni BD (salvo el
    contador de intentos por dispositivo)."""
    if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
        raise HTTPException(status_code=422, detail="La foto debe ser JPG, PNG o WEBP")

    ahora = datetime.now(timezone.utc)
    intento = supabase.table("intentos_validacion_foto").select(
        "contador_rechazos, bloqueado_hasta"
    ).eq("device_token", device_token).limit(1).execute()
    fila_intento = intento.data[0] if intento.data else None
    contador_actual = fila_intento["contador_rechazos"] if fila_intento else 0

    if fila_intento and fila_intento.get("bloqueado_hasta"):
        bloqueado_hasta = datetime.fromisoformat(fila_intento["bloqueado_hasta"].replace("Z", "+00:00"))
        if bloqueado_hasta > ahora:
            return {
                "valido": False,
                "mensaje": MENSAJE_BLOQUEO_VALIDACION_FOTO,
                "advertencia": None,
                "advertencia_ubicacion": None,
                "bloqueado": True,
            }
        # El bloqueo ya venció: reinicia antes de continuar.
        contador_actual = 0
        supabase.table("intentos_validacion_foto").upsert(
            {
                "device_token": device_token,
                "contador_rechazos": 0,
                "bloqueado_hasta": None,
                "actualizado_at": ahora.isoformat(),
            },
            on_conflict="device_token",
        ).execute()

    from app.services.report_photo_vision_service import (
        mensaje_advertencia_identificacion,
        mensaje_rechazo,
        verificar_foto_animal,
    )

    contenido = await foto.read()
    resultado = verificar_foto_animal(contenido, foto.content_type)

    if resultado.get("estado") == "error_tecnico":
        return {"valido": True, "mensaje": "", "advertencia": None, "advertencia_ubicacion": None, "bloqueado": False}

    if resultado.get("es_animal_real") is False:
        contador_nuevo = contador_actual + 1
        bloquear = contador_nuevo >= LIMITE_RECHAZOS_VALIDACION_FOTO
        supabase.table("intentos_validacion_foto").upsert(
            {
                "device_token": device_token,
                "contador_rechazos": contador_nuevo,
                "bloqueado_hasta": (
                    (ahora + timedelta(minutes=MINUTOS_BLOQUEO_VALIDACION_FOTO)).isoformat()
                    if bloquear else None
                ),
                "actualizado_at": ahora.isoformat(),
            },
            on_conflict="device_token",
        ).execute()

        if bloquear:
            return {
                "valido": False,
                "mensaje": MENSAJE_BLOQUEO_VALIDACION_FOTO,
                "advertencia": None,
                "advertencia_ubicacion": None,
                "bloqueado": True,
            }

        restantes = LIMITE_RECHAZOS_VALIDACION_FOTO - contador_nuevo
        mensaje = f"{mensaje_rechazo(resultado.get('categoria_rechazo'))} Te queda{'n' if restantes != 1 else ''} {restantes} intento{'s' if restantes != 1 else ''}."
        return {"valido": False, "mensaje": mensaje, "advertencia": None, "advertencia_ubicacion": None, "bloqueado": False}

    # es_animal_real is True: éxito, reinicia el contador si hacía falta.
    if contador_actual > 0:
        supabase.table("intentos_validacion_foto").upsert(
            {
                "device_token": device_token,
                "contador_rechazos": 0,
                "bloqueado_hasta": None,
                "actualizado_at": ahora.isoformat(),
            },
            on_conflict="device_token",
        ).execute()

    advertencia = (
        mensaje_advertencia_identificacion()
        if resultado.get("calidad_identificacion") == "limitada"
        else None
    )

    advertencia_ubicacion = None
    if latitud is not None and longitud is not None:
        from app.services.image_evidence_service import ImagenEvidenciaInvalida, procesar_imagen_evidencia
        from app.services.report_photo_location_service import mensaje_advertencia_ubicacion, verificar_ubicacion_exif
        try:
            procesada = procesar_imagen_evidencia(contenido)
            resultado_ubicacion = verificar_ubicacion_exif(
                procesada.exif_latitud, procesada.exif_longitud, latitud, longitud,
            )
            if resultado_ubicacion["estado"] == "discrepancia":
                advertencia_ubicacion = mensaje_advertencia_ubicacion(from_camera)
        except ImagenEvidenciaInvalida:
            pass

    return {"valido": True, "mensaje": "", "advertencia": advertencia, "advertencia_ubicacion": advertencia_ubicacion, "bloqueado": False}
#### FIN endpoint: pre-check de foto


### Endpoint para que el representante pueda seleccionar STAFF
@router.post("/{reporte_id}/asignar-staff", status_code=200)
async def asignar_staff(reporte_id: str, body: dict, authorization: str = Header(None)):
    """El representante acepta un reporte y asigna a un miembro del staff."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

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
        condicion_mas_grave(shape_animal_embed(c.get("animal"))[0]) == "grave"
        for c in casos
    )

    if tiene_caso_grave:
        raise HTTPException(status_code=400, detail="Este miembro del staff tiene un caso grave activo")
    if len(casos) >= 2:
        raise HTTPException(status_code=400, detail="Este miembro del staff tiene 2 o más casos activos")

    # La misma reserva transaccional protege staff, voluntariado interno,
    # externos y escalamiento. El staff confirma en el mismo flujo porque
    # esta pantalla ya valida su disponibilidad antes de seleccionarlo.
    coverage_service.reservar_cobertura(
        reporte_id=reporte_id,
        usuario_asignado_id=staff_id,
        voluntario_id=None,
        asociacion_id=asociacion_id,
        actor_id=usuario["id"],
        origen="staff",
    )
    coverage_service.responder_propuesta(staff_id, reporte_id, True)

    # Actualizar estado de asignación
    estado_aceptada_id = supabase.table("asignacion_estados").select(
        "id"
    ).eq("clave", "aceptada").execute()

    if estado_aceptada_id.data:
        supabase.table("reporte_asignaciones").update({
            "estado_id": estado_aceptada_id.data[0]["id"],
            "estado": "aceptada",
        }).eq("reporte_id", reporte_id).eq("asociacion_id", asociacion_id).execute()

    staff_nombre = f"{staff.data[0]['nombre']} {staff.data[0]['apellido_paterno']}"

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
    """Valida y registra una evidencia; la copia pública se guarda sin EXIF."""
    usuario = _obtener_usuario_autenticado(authorization)

    reporte = (
        supabase.table("reportes")
        .select("id, staff_asignado_id, asociacion_asignada_id")
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    fila_reporte = reporte.data[0]
    es_staff_asignado = fila_reporte.get("staff_asignado_id") == usuario["id"]
    es_representante_asignado = (
        usuario.get("rol") == "asociacion"
        and usuario.get("asociacion_id") == fila_reporte.get("asociacion_asignada_id")
    )
    
    # Validación limpia de asociación receptora a través de la custodia vinculada al reporte
    es_asociacion_receptora = False
    if usuario.get("rol") == "asociacion" and usuario.get("asociacion_id"):
        custodia_asociada = (
            supabase_admin.table("custodias_temporales")
            .select("id, asociacion_coordinadora_id")
            .eq("reporte_id", reporte_id)
            .order("inicio_at", desc=True)  # <--- ¡EL CAMBIO ESTÁ AQUÍ!
            .limit(1)
            .execute()
        )
        if custodia_asociada.data:
            # Si es la coordinadora de la custodia más reciente, tiene permiso
            if custodia_asociada.data[0].get("asociacion_coordinadora_id") == usuario.get("asociacion_id"):
                es_asociacion_receptora = True
                
            trans_receptora = (
                supabase_admin.table("transferencias_custodia")
                .select("id")
                .eq("custodia_id", custodia_asociada.data[0]["id"])
                .eq("asociacion_receptora_id", usuario.get("asociacion_id"))
                .in_("estado", ["programada", "en_traslado", "en_curso", "entrega_confirmada", "recepcion_confirmada"])
                .limit(1)
                .execute()
            )
            if trans_receptora.data:
                es_asociacion_receptora = True

    es_voluntario_custodia = False
    if usuario.get("rol") == "voluntario_externo":
        vol = (
            supabase_admin.table("voluntarios")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .limit(1)
            .execute()
        )
        if vol.data:
            custodia_activa = (
                supabase_admin.table("custodias_temporales")
                .select("id")
                .eq("reporte_id", reporte_id)
                .eq("voluntario_id", vol.data[0]["id"])
                .limit(1)
                .execute()
            )
            if custodia_activa.data:
                es_voluntario_custodia = True

    if not es_staff_asignado and not es_representante_asignado and not es_asociacion_receptora and not es_voluntario_custodia:
        raise HTTPException(status_code=403, detail="No puedes agregar evidencias a este reporte")

    if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
        raise HTTPException(status_code=422, detail="La foto debe ser JPG, PNG o WEBP")

    from app.services.image_evidence_service import (
        ImagenEvidenciaInvalida,
        procesar_imagen_evidencia,
    )
    from app.services.storage_service import subir_bytes

    contenido = await foto.read()
    try:
        procesada = procesar_imagen_evidencia(contenido)
    except ImagenEvidenciaInvalida as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    foto_url = await subir_bytes(
        procesada.contenido_publico,
        carpeta="reportes/hitos",
        content_type=procesada.content_type_publico,
        extension=procesada.extension_publica,
    )

    evidencia = supabase_admin.table("reporte_evidencias").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": usuario["id"],
            "foto_url": foto_url,
            "formato_original": procesada.formato_original,
            "ancho": procesada.ancho,
            "alto": procesada.alto,
            "size_bytes_original": procesada.size_bytes_original,
            "exif_latitud": procesada.exif_latitud,
            "exif_longitud": procesada.exif_longitud,
            "exif_captured_at": procesada.exif_captured_at,
        }
    ).execute()
    if not evidencia.data:
        raise HTTPException(status_code=500, detail="No se pudo registrar la evidencia fotográfica")

    return {
        "foto_url": foto_url,
        "evidencia_id": evidencia.data[0]["id"],
        "exif_gps_disponible": procesada.tiene_gps_exif,
    }

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
        "id, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not usuario.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = usuario.data[0]

    # Verificar que el reporte existe y está asignado a este staff
    reporte = supabase.table("reportes").select(
        "id, estado_reporte, estado_cobertura, staff_asignado_id, "
        "asociacion_asignada_id, latitud, longitud"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte["staff_asignado_id"] != usuario["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para registrar hitos en este reporte")

    tipo_hito = HITOS_CANONICOS.get(body.tipo_hito, body.tipo_hito)

    # Validar tipo de hito. Los alias anteriores siguen aceptándose para
    # conservar compatibilidad con versiones ya instaladas de la app.
    if tipo_hito not in [
        "llegada_zona_reporte",
        "animal_encontrado",
        "animal_no_localizado",
        "animal_bajo_resguardo",
        "llegue_refugio",
        "llegada_hogar_temporal",
        "llegada_veterinaria",
    ]:
        raise HTTPException(status_code=422, detail="Tipo de hito inválido")

    # Validar flujo de estados
    if tipo_hito in (
        "llegada_zona_reporte",
        "animal_encontrado",
        "animal_no_localizado",
    ) and reporte["estado_reporte"] != "en_camino":
        raise HTTPException(status_code=400, detail="El reporte debe estar en estado en_camino para registrar este hito")

    if tipo_hito == "llegue_refugio" and reporte["estado_reporte"] != "en_atencion":
        raise HTTPException(status_code=400, detail="El reporte debe estar en estado en_atencion para registrar este hito")

    if tipo_hito == "animal_bajo_resguardo" and reporte["estado_reporte"] != "en_atencion":
        raise HTTPException(status_code=400, detail="El reporte debe estar en atención para registrar el resguardo")

    if tipo_hito == "llegada_hogar_temporal" and reporte["estado_reporte"] != "en_atencion":
        raise HTTPException(status_code=400, detail="El reporte debe estar en atención para iniciar la custodia")

    if tipo_hito == "llegada_veterinaria" and reporte["estado_reporte"] != "en_atencion":
        raise HTTPException(status_code=400, detail="El reporte debe estar en estado en_atencion para registrar este hito")

    rol_usuario = (usuario.get("roles") or {}).get("nombre")
    distancia_reporte_metros = None

    if tipo_hito == "llegada_zona_reporte":
        if rol_usuario != "voluntario_externo":
            raise HTTPException(
                status_code=403,
                detail="Este hito corresponde a un voluntario externo",
            )
        if body.latitud is None or body.longitud is None:
            raise HTTPException(
                status_code=422,
                detail="La ubicación GPS es obligatoria para registrar la llegada a la zona",
            )
        if reporte.get("latitud") is None or reporte.get("longitud") is None:
            raise HTTPException(
                status_code=409,
                detail="El reporte no tiene coordenadas para validar la llegada",
            )
        distancia_reporte_metros = _distancia_metros(
            body.latitud,
            body.longitud,
            reporte["latitud"],
            reporte["longitud"],
        )
        if distancia_reporte_metros > RADIO_LLEGADA_ZONA_METROS:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Aún estás lejos de la zona del reporte. "
                    f"Estás a {round(distancia_reporte_metros)} metros; "
                    f"acércate a menos de {RADIO_LLEGADA_ZONA_METROS} metros."
                ),
            )

    if tipo_hito in ("animal_encontrado", "animal_no_localizado") and rol_usuario == "voluntario_externo":
        llegada = (
            supabase.table("historial_reporte")
            .select("id")
            .eq("reporte_id", reporte_id)
            .eq("usuario_id", usuario["id"])
            .in_("tipo_evento", ["llegada_zona_reporte", "hito_llegada_zona_reporte"])
            .limit(1)
            .execute()
        )
        if not llegada.data:
            raise HTTPException(
                status_code=409,
                detail="Primero debes registrar tu llegada a la zona del reporte",
            )

    if tipo_hito == "animal_no_localizado":
        if rol_usuario not in ("voluntario_interno", "voluntario_externo"):
            raise HTTPException(
                status_code=403,
                detail="Este hito corresponde a un voluntario asignado",
            )
        if body.latitud is None or body.longitud is None:
            raise HTTPException(
                status_code=422,
                detail="La ubicación GPS es obligatoria para registrar la búsqueda",
            )
        if body.tiempo_busqueda_minutos is None:
            raise HTTPException(
                status_code=422,
                detail="Indica cuántos minutos buscaste al animal",
            )
        if not body.comentario or not body.comentario.strip():
            raise HTTPException(
                status_code=422,
                detail="Describe brevemente dónde y cómo realizaste la búsqueda",
            )
        if rol_usuario == "voluntario_interno":
            if reporte.get("latitud") is None or reporte.get("longitud") is None:
                raise HTTPException(
                    status_code=409,
                    detail="El reporte no tiene coordenadas para validar la búsqueda",
                )
            distancia_reporte_metros = _distancia_metros(
                body.latitud,
                body.longitud,
                reporte["latitud"],
                reporte["longitud"],
            )
            if distancia_reporte_metros > RADIO_LLEGADA_ZONA_METROS:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Aún estás lejos de la zona del reporte. "
                        f"Estás a {round(distancia_reporte_metros)} metros; "
                        f"acércate a menos de {RADIO_LLEGADA_ZONA_METROS} metros."
                    ),
                )

    # Validación GPS obligatoria para llegue_refugio
    if tipo_hito == "llegue_refugio":
        if body.latitud is None or body.longitud is None:
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

        distancia_metros = _distancia_metros(
            body.latitud, body.longitud, refugio_lat, refugio_lon
        )

        if distancia_metros > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tu ubicación no coincide con el refugio. Estás a {round(distancia_metros)} metros. Debes estar dentro de 200 metros."
            )

    if tipo_hito == "animal_encontrado" and rol_usuario == "voluntario_externo":
        if not body.foto_url:
            raise HTTPException(
                status_code=422,
                detail="La fotografía desde la zona es obligatoria",
            )
        if body.latitud is None or body.longitud is None:
            raise HTTPException(
                status_code=422,
                detail="La ubicación GPS es obligatoria para registrar que encontraste al animal",
            )

    if tipo_hito == "animal_bajo_resguardo":
        if rol_usuario != "voluntario_externo":
            raise HTTPException(
                status_code=403,
                detail="Este hito corresponde a un voluntario externo",
            )
        if not body.foto_url or body.latitud is None or body.longitud is None:
            raise HTTPException(
                status_code=422,
                detail="La foto del animal y la ubicación GPS son obligatorias",
            )
        if not body.condicion_observada:
            raise HTTPException(
                status_code=422,
                detail="Indica la condición actual del animal",
            )
        if body.ruta_resguardo not in ("directo_hogar", "veterinaria_y_hogar"):
            raise HTTPException(
                status_code=422,
                detail="Selecciona si irás directo al hogar o pasarás antes por veterinaria",
            )
        if body.fecha_limite_resguardo is None:
            raise HTTPException(
                status_code=422,
                detail="Indica hasta qué fecha puedes cuidar a este animal",
            )
        fecha_propuesta = _fecha_utc(body.fecha_limite_resguardo)
        if fecha_propuesta <= datetime.now(timezone.utc) + timedelta(hours=24):
            raise HTTPException(
                status_code=422,
                detail="La fecha de resguardo debe permitir al menos un día completo",
            )

    if tipo_hito == "llegada_hogar_temporal":
        if rol_usuario != "voluntario_externo":
            raise HTTPException(
                status_code=403,
                detail="Este hito corresponde a un hogar temporal externo",
            )
        if (
            body.latitud is None
            or body.longitud is None
            or not body.foto_url
            or not body.foto_entorno_url
        ):
            raise HTTPException(
                status_code=422,
                detail="Las fotos del animal y del entorno, además del GPS, son obligatorias",
            )

        if body.fecha_limite_resguardo is None:
            raise HTTPException(
                status_code=422,
                detail="Confirma hasta qué fecha puedes mantener esta custodia",
            )
        fecha_confirmada = _fecha_utc(body.fecha_limite_resguardo)
        if fecha_confirmada <= datetime.now(timezone.utc) + timedelta(hours=24):
            raise HTTPException(
                status_code=422,
                detail="La fecha límite debe permitir al menos un día completo de custodia",
            )

        resguardo = (
            supabase.table("historial_reporte")
            .select("id")
            .eq("reporte_id", reporte_id)
            .eq("usuario_id", usuario["id"])
            .eq("tipo_evento", "animal_bajo_resguardo")
            .limit(1)
            .execute()
        )
        if not resguardo.data:
            raise HTTPException(
                status_code=409,
                detail="Primero registra que el animal está bajo tu resguardo",
            )

        voluntario = (
            supabase.table("voluntarios")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .limit(1)
            .execute()
        )
        if not voluntario.data:
            raise HTTPException(status_code=404, detail="Perfil externo no encontrado")
        hogar = (
            supabase_admin.table("perfil_casa_temporal")
            .select("latitud, longitud")
            .eq("voluntario_id", voluntario.data[0]["id"])
            .limit(1)
            .execute()
        )
        if (
            not hogar.data
            or hogar.data[0].get("latitud") is None
            or hogar.data[0].get("longitud") is None
        ):
            raise HTTPException(
                status_code=409,
                detail="Tu hogar temporal no tiene una ubicación verificada",
            )

        distancia_hogar = _distancia_metros(
            body.latitud,
            body.longitud,
            hogar.data[0]["latitud"],
            hogar.data[0]["longitud"],
        )
        if distancia_hogar > 200:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Tu ubicación no coincide con el hogar verificado. "
                    f"Estás a {round(distancia_hogar)} metros."
                ),
            )

        plan_custodia = (
            supabase_admin.table("planes_custodia_temporal")
            .select("id, ruta_resguardo, fecha_limite_propuesta")
            .eq("reporte_id", reporte_id)
            .eq("voluntario_id", voluntario.data[0]["id"])
            .limit(1)
            .execute()
        )
        if not plan_custodia.data:
            raise HTTPException(
                status_code=409,
                detail="Primero registra la ruta y fecha propuesta del resguardo",
            )
        if plan_custodia.data[0]["ruta_resguardo"] == "veterinaria_y_hogar":
            llegada_veterinaria = (
                supabase.table("historial_reporte")
                .select("id")
                .eq("reporte_id", reporte_id)
                .eq("usuario_id", usuario["id"])
                .eq("tipo_evento", "llegada_veterinaria")
                .limit(1)
                .execute()
            )
            if not llegada_veterinaria.data:
                raise HTTPException(
                    status_code=409,
                    detail="Primero registra la llegada a la veterinaria indicada en tu ruta",
                )

    # Validación GPS obligatoria para llego_veterinaria — Ruta 1
    # (BACK01/BACK02): solo se puede registrar si existe una contribución
    # con este reporte_id (la sugerencia de aliado ya fue aceptada), y la
    # ubicación se valida contra la veterinaria de esa contribución, no
    # contra la asociación.
    if tipo_hito == "llegada_veterinaria":
        contribucion = supabase.table("contribuciones").select(
            "id, oferta_proactiva_id"
        ).eq("reporte_id", reporte_id).order("created_at", desc=True).limit(1).execute()

        if not contribucion.data or not contribucion.data[0].get("oferta_proactiva_id"):
            raise HTTPException(
                status_code=400,
                detail="No hay ninguna sugerencia de aliado veterinario aceptada para este reporte"
            )

        if body.latitud is None or body.longitud is None:
            raise HTTPException(status_code=422, detail="La ubicación GPS es obligatoria para registrar la llegada a la veterinaria")

        if not body.foto_url:
            raise HTTPException(status_code=422, detail="La foto es obligatoria para registrar la llegada a la veterinaria")

        oferta = supabase.table("ofertas_proactivas").select(
            "perfil_apoyo_id"
        ).eq("id", contribucion.data[0]["oferta_proactiva_id"]).execute()

        if not oferta.data:
            raise HTTPException(status_code=404, detail="Oferta del aliado veterinario no encontrada")

        ubicacion = supabase.rpc(
            "ubicacion_perfil_apoyo",
            {"p_perfil_apoyo_id": oferta.data[0]["perfil_apoyo_id"]},
        ).execute()

        if not ubicacion.data or ubicacion.data[0].get("latitud") is None:
            raise HTTPException(status_code=500, detail="No se pudo resolver la ubicación del aliado veterinario")

        vet_lat = float(ubicacion.data[0]["latitud"])
        vet_lon = float(ubicacion.data[0]["longitud"])

        distancia_metros = _distancia_metros(
            body.latitud, body.longitud, vet_lat, vet_lon
        )

        if distancia_metros > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tu ubicación no coincide con la veterinaria. Estás a {round(distancia_metros)} metros. Debes estar dentro de 200 metros."
            )

    verificacion_ubicacion = None
    if body.evidencia_id:
        verificacion_ubicacion = _vincular_y_verificar_evidencia(
            evidencia_id=body.evidencia_id,
            reporte_id=reporte_id,
            usuario_id=usuario["id"],
            tipo_hito=tipo_hito,
            foto_url=body.foto_url,
            latitud_declarada=body.latitud,
            longitud_declarada=body.longitud,
        )

    # Determinar nuevo estado — llego_veterinaria no cambia estado_reporte,
    # solo queda como un evento más en historial_reporte.
    if tipo_hito == "animal_encontrado":
        nuevo_estado = "en_atencion"
    elif tipo_hito in ("llegue_refugio", "llegada_hogar_temporal"):
        nuevo_estado = "rescatado"
    else:
        nuevo_estado = None

    if nuevo_estado:
        estado_id = supabase.table("reporte_estados").select("id").eq("clave", nuevo_estado).execute()

        if not estado_id.data:
            raise HTTPException(status_code=500, detail=f"Error al resolver estado {nuevo_estado}")

        # Actualizar estado del reporte
        actualizacion = {
            "estado_reporte": nuevo_estado,
            "estado_id": estado_id.data[0]["id"],
        }
        if tipo_hito == "animal_encontrado":
            actualizacion["estado_cobertura"] = "en_atencion"
        elif tipo_hito in ("llegue_refugio", "llegada_hogar_temporal"):
            actualizacion["estado_cobertura"] = "finalizado"
        supabase.table("reportes").update(actualizacion).eq("id", reporte_id).execute()

    if tipo_hito == "llegada_hogar_temporal":
        voluntario = (
            supabase.table("voluntarios")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .limit(1)
            .execute()
        )
        existente = (
            supabase.table("custodias_temporales")
            .select("id")
            .eq("reporte_id", reporte_id)
            .limit(1)
            .execute()
        )
        if not existente.data:
            ahora_custodia = datetime.now(timezone.utc)
            supabase_admin.table("custodias_temporales").insert(
                {
                    "reporte_id": reporte_id,
                    "voluntario_id": voluntario.data[0]["id"],
                    "asociacion_coordinadora_id": reporte["asociacion_asignada_id"],
                    "estado": "activo",
                    "fecha_limite": fecha_confirmada.isoformat(),
                    "ruta_ingreso": plan_custodia.data[0]["ruta_resguardo"],
                    "fecha_limite_confirmada_at": ahora_custodia.isoformat(),
                    "proximo_seguimiento_at": (ahora_custodia + timedelta(hours=3)).isoformat(),
                    "frecuencia_horas": 72,
                }
            ).execute()
        supabase.table("planes_custodia_temporal").update(
            {
                "fecha_limite_confirmada": fecha_confirmada.isoformat(),
                "confirmada_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", plan_custodia.data[0]["id"]).execute()

    # Registrar en historial. La búsqueda sin resultado utiliza una función
    # transaccional porque también abre una decisión para la coordinadora.
    from app.services.report_service import registrar_historial
    intento_busqueda = None
    datos_hito = {
            "condicion_observada": body.condicion_observada,
            "comentario": body.comentario,
            "destino": body.destino,
            "foto_url": body.foto_url,
            "evidencia_id": body.evidencia_id,
            "foto_entorno_url": body.foto_entorno_url,
            "latitud": body.latitud,
            "longitud": body.longitud,
            "tiempo_busqueda_minutos": body.tiempo_busqueda_minutos,
            "distancia_reporte_metros": (
                round(distancia_reporte_metros)
                if distancia_reporte_metros is not None
                else None
            ),
            "verificacion_ubicacion": verificacion_ubicacion,
            "ruta_resguardo": body.ruta_resguardo,
            "fecha_limite_resguardo": (
                _fecha_utc(body.fecha_limite_resguardo).isoformat()
                if body.fecha_limite_resguardo
                else None
            ),
        }
    if tipo_hito == "animal_bajo_resguardo":
        voluntario_plan = (
            supabase.table("voluntarios")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .limit(1)
            .execute()
        )
        if not voluntario_plan.data:
            raise HTTPException(status_code=404, detail="Perfil externo no encontrado")
        supabase_admin.table("planes_custodia_temporal").upsert(
            {
                "reporte_id": reporte_id,
                "voluntario_id": voluntario_plan.data[0]["id"],
                "ruta_resguardo": body.ruta_resguardo,
                "fecha_limite_propuesta": _fecha_utc(body.fecha_limite_resguardo).isoformat(),
                "actualizado_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="reporte_id",
        ).execute()
    if tipo_hito == "animal_no_localizado":
        try:
            busqueda = supabase_admin.rpc(
                "registrar_busqueda_no_localizado",
                {
                    "p_reporte_id": reporte_id,
                    "p_usuario_id": usuario["id"],
                    "p_comentario": body.comentario,
                    "p_tiempo_busqueda_minutos": body.tiempo_busqueda_minutos,
                    "p_latitud": body.latitud,
                    "p_longitud": body.longitud,
                    "p_distancia_reporte_metros": datos_hito["distancia_reporte_metros"],
                },
            ).execute()
        except Exception as error:
            if "decision_busqueda_pendiente" in str(error).lower():
                raise HTTPException(
                    status_code=409,
                    detail="La asociación debe resolver la búsqueda anterior antes de registrar otro intento",
                ) from error
            raise
        intento_busqueda = (busqueda.data or {}).get("intento") if isinstance(busqueda.data, dict) else None
    else:
        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=usuario["id"],
            tipo_evento=EVENTOS_HISTORIAL_POR_HITO[tipo_hito],
            descripcion=f"Hito registrado: {tipo_hito}",
            datos_extra=datos_hito,
        )

    # Motor de sugerencias, Ruta 1 (BACK01) — solo para el hito
    # "encontre_animal". Puramente informativo: no reserva capacidad, no
    # persiste nada, y si no hay match compatible el flujo sigue exactamente
    # igual que hoy. Nunca modifica animal.condicion_id ni ninguna otra
    # columna del reporte.
    sugerencia_aliado = None
    if tipo_hito == "animal_encontrado":
        from app.services.red_aliados_service import _nivel_urgencia_efectivo, sugerir_aliado_veterinario

        animal_query = supabase.table("reportes").select(
            "animal(orden, condicion_catalogo(clave))"
        ).eq("id", reporte_id).execute()

        animal_embed = animal_query.data[0]["animal"] if animal_query.data else None
        animales, _ = shape_animal_embed(animal_embed)
        condicion_animal = condicion_mas_grave(animales)

        nivel_urgencia = _nivel_urgencia_efectivo(condicion_animal, body.condicion_observada)
        if nivel_urgencia:
            sugerencia_aliado = sugerir_aliado_veterinario(reporte_id, nivel_urgencia)

    return {
        "mensaje": f"Hito '{tipo_hito}' registrado correctamente.",
        "tipo_hito": tipo_hito,
        "estado": nuevo_estado,
        "verificacion_ubicacion": verificacion_ubicacion,
        "sugerencia_aliado": sugerencia_aliado,
        "intento_busqueda": intento_busqueda,
    }

### FIN endpoind: staff registra avances del rescate


DECISIONES_BUSQUEDA_NO_LOCALIZADO = {
    "repetir_busqueda",
    "ampliar_zona",
    "programar_otro_horario",
    "reasignar",
    "solicitar_apoyo_regional",
    "liberar_voluntario",
    "cerrar_no_localizado",
}


def _procesar_gamificacion_busqueda_resuelta(resultado: object) -> None:
    """Identifica al autor de la búsqueda ya resuelta y premia únicamente
    al voluntario interno. Es una consecuencia secundaria: una falla al
    consultar o registrar reputación nunca revierte la decisión operativa."""
    if not isinstance(resultado, dict) or not resultado.get("busqueda_id"):
        return

    try:
        busqueda = supabase_admin.table("busquedas_no_localizado").select(
            "usuario_id"
        ).eq("id", resultado["busqueda_id"]).limit(1).execute()
        if not busqueda.data:
            return

        usuario_id = busqueda.data[0].get("usuario_id")
        autor = supabase_admin.table("usuarios").select(
            "id, roles(nombre)"
        ).eq("id", usuario_id).limit(1).execute()
        if not autor.data:
            return

        rol = (autor.data[0].get("roles") or {}).get("nombre")
        if rol != "voluntario_interno":
            return

        from app.services.reputacion_service import procesar_busqueda_documentada_interna
        procesar_busqueda_documentada_interna(resultado["busqueda_id"], usuario_id)
    except Exception as error:
        print(
            "[WARN] no se pudo procesar la gamificación de la búsqueda "
            f"{resultado.get('busqueda_id')}: {error}"
        )


@router.get("/{reporte_id}/busqueda-no-localizado/pendiente")
def obtener_busqueda_no_localizado_pendiente(
    reporte_id: str,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    reporte = supabase.table("reportes").select(
        "id, asociacion_asignada_id"
    ).eq("id", reporte_id).limit(1).execute()
    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if reporte.data[0].get("asociacion_asignada_id") != usuario.get("asociacion_id"):
        raise HTTPException(status_code=403, detail="Tu asociación no coordina este caso")
    busqueda = supabase_admin.table("busquedas_no_localizado").select(
        "id, intento, comentario, tiempo_busqueda_minutos, creada_at, estado"
    ).eq("reporte_id", reporte_id).eq("estado", "pendiente").limit(1).execute()
    return {"busqueda": busqueda.data[0] if busqueda.data else None}


@router.post("/{reporte_id}/busqueda-no-localizado/resolver")
def resolver_busqueda_no_localizado(
    reporte_id: str,
    body: ResolverBusquedaNoLocalizadoRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    if body.decision not in DECISIONES_BUSQUEDA_NO_LOCALIZADO:
        raise HTTPException(status_code=422, detail="Decisión de búsqueda inválida")
    if body.decision in {"ampliar_zona", "programar_otro_horario", "solicitar_apoyo_regional"} and not (body.instrucciones or "").strip():
        raise HTTPException(status_code=422, detail="Agrega instrucciones para el siguiente paso")
    try:
        resultado = supabase_admin.rpc(
            "resolver_busqueda_no_localizado",
            {
                "p_reporte_id": reporte_id,
                "p_asociacion_id": usuario.get("asociacion_id"),
                "p_usuario_id": usuario["id"],
                "p_decision": body.decision,
                "p_instrucciones": (body.instrucciones or "").strip() or None,
                "p_programada_at": body.programada_at,
            },
        ).execute()
    except Exception as error:
        detalle = str(error).lower()
        if "busqueda_no_disponible" in detalle:
            raise HTTPException(status_code=409, detail="La búsqueda ya fue resuelta") from error
        if "asociacion_no_coordina" in detalle:
            raise HTTPException(status_code=403, detail="Tu asociación no coordina este caso") from error
        raise
    _procesar_gamificacion_busqueda_resuelta(resultado.data)
    return resultado.data

### Endpoint: BACK02 — aceptar la sugerencia de Ruta 1 (motor de sugerencias)
@router.post("/{reporte_id}/hitos/aceptar-sugerencia", status_code=201, response_model=AceptarSugerenciaVeterinariaResponse)
async def aceptar_sugerencia_endpoint(
    reporte_id: str,
    body: AceptarSugerenciaRequest,
    authorization: str = Header(None),
):
    """El staff/voluntario que trae el caso acepta la sugerencia de aliado
    veterinario que regresó POST /reports/{id}/hitos — reserva capacidad
    de inmediato (409 si alguien más ya la tomó) y crea la contribución en
    estado 'comprometida'."""
    usuario = _obtener_usuario_autenticado(authorization)

    reporte = supabase.table("reportes").select("id, staff_asignado_id").eq("id", reporte_id).execute()
    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if reporte.data[0]["staff_asignado_id"] != usuario["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para aceptar sugerencias en este reporte")

    from app.services.red_aliados_service import aceptar_sugerencia_veterinaria
    return await aceptar_sugerencia_veterinaria(reporte_id, body.oferta_id)

### FIN endpoint: aceptar sugerencia Ruta 1

### Endpoint: logica post rechazo de reportes
@router.patch("/{reporte_id}/rechazar", status_code=200)
async def rechazar_reporte(reporte_id: str, body: RechazarReporteRequest, authorization: str = Header(None)):
    """El representante rechaza un reporte. El sistema busca automáticamente
    la siguiente asociación más cercana."""
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    asociacion_id = usuario.get("asociacion_id")

    if not asociacion_id:
        raise HTTPException(status_code=403, detail="No estás vinculado a ninguna asociación")

    # Verificar que el reporte existe y pertenece a esta asociación
    reporte = supabase.table("reportes").select(
        "id, estado_reporte, asociacion_asignada_id, latitud, longitud, municipio, "
        "animal(tipo_animal_catalogo(clave))"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = reporte.data[0]

    if reporte["asociacion_asignada_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Este reporte no pertenece a tu asociación")

    # Especies del caso, derivadas una sola vez — las usan tanto la
    # reasignación automática como los contactos de emergencia si no hay
    # cobertura (antes ninguna de las dos consideraba la especie real).
    animales_crudos, _ = shape_animal_embed(reporte.get("animal"))
    especies_del_caso = list(dict.fromkeys(
        (a.get("tipo_animal_catalogo") or {}).get("clave") for a in animales_crudos
    ))
    especies_del_caso = [e for e in especies_del_caso if e]

    if reporte["estado_reporte"] != "asignado":
        raise HTTPException(status_code=400, detail="Solo puedes rechazar reportes en estado asignado")

    # Registrar rechazo en historial
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento="reporte_rechazado",
        descripcion=f"Reporte rechazado por la asociación. Motivo: {body.motivo}",
        datos_extra={
            "motivo": body.motivo,
            "comentario": body.comentario,
            "motivo_clave": body.motivo_clave,
            "asociacion_id": asociacion_id,
        }
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

    if body.motivo_clave == "foto_no_es_animal":
        # No se busca otra asociación — ninguna otra la va a querer
        # tampoco. Se reusa el estado genérico 'cerrado', siguiendo la
        # misma convención que busquedas_no_localizado
        # (resolver_busqueda_no_localizado, decision='cerrar_no_localizado').
        # asociacion_asignada_id NO se toca — queda como rastro de
        # auditoría de quién identificó la foto como inválida.
        estado_cerrado_id = supabase.table("reporte_estados").select(
            "id"
        ).eq("clave", "cerrado").execute()

        supabase.table("reportes").update({
            "estado_reporte": "cerrado",
            "estado_cobertura": "finalizado",
            "estado_id": estado_cerrado_id.data[0]["id"],
            "staff_asignado_id": None,
        }).eq("id", reporte_id).execute()

        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=None,
            tipo_evento="reporte_cerrado_foto_invalida",
            descripcion="Reporte cerrado: la fotografía no muestra un animal real, no se reasigna.",
            datos_extra={"motivo_clave": body.motivo_clave}
        )

        return {
            "mensaje": "Reporte rechazado y cerrado — la fotografía no corresponde a un animal real.",
            "estado": "cerrado"
        }

    else:
        # Buscar siguiente asociación más cercana excluyendo las que ya rechazaron
        asociaciones_rechazadas = supabase.table("reporte_asignaciones").select(
            "asociacion_id"
        ).eq("reporte_id", reporte_id).execute()

        ids_rechazadas = [r["asociacion_id"] for r in (asociaciones_rechazadas.data or [])]

        # Intentar reasignar
        from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
        nueva_asociacion = None

        if reporte.get("latitud") and reporte.get("longitud"):
            candidata = asignar_asociacion(
                reporte["latitud"], reporte["longitud"],
                excluir_ids=ids_rechazadas,
                tipos_animales=especies_del_caso or None,
            )
            if candidata:
                nueva_asociacion = candidata

        if nueva_asociacion:
            # Asignar a nueva asociación
            estado_asignado_id = supabase.table("reporte_estados").select(
                "id"
            ).eq("clave", "asignado").execute()

            supabase.table("reportes").update({
                "asociacion_asignada_id": nueva_asociacion["id"],
                "estado_reporte": "asignado",
                "estado_cobertura": "abierto",
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
                "estado_cobertura": None,
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
            try:
                supabase.table("casos_administrativos").insert({
                    "reporte_id": reporte_id,
                    "tipo": "reporte_sin_coordinadora",
                    "prioridad": "alta",
                    "detalle": "Las asociaciones compatibles rechazaron el caso.",
                }).execute()
            except Exception:
                pass

            contactos_vistos = set()
            contactos = []
            for especie in especies_del_caso:
                for c in obtener_contactos_emergencia(tipo_animal=especie, municipio=reporte.get("municipio")):
                    if c.get("id") not in contactos_vistos:
                        contactos_vistos.add(c.get("id"))
                        contactos.append(c)

            return {
                "mensaje": "Reporte rechazado. No hay más asociaciones disponibles en la zona.",
                "contactos_emergencia": contactos,
                "estado": "sin_cobertura"
            }
### FIN: postrechazo de reportes

MOTIVOS_DENUNCIA = {
    "informacion_falsa",
    "foto_internet",
    "reporte_repetido",
    "ubicacion_incorrecta",
    "animal_no_esta",
    "contenido_inapropiado",
    "posible_fraude",
    "otro",
}


@router.post("/{reporte_id}/denuncias", status_code=201)
async def denunciar_reporte(
    reporte_id: str,
    body: DenunciarReporteRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    if body.motivo not in MOTIVOS_DENUNCIA:
        raise HTTPException(status_code=422, detail="Selecciona un motivo válido")

    consulta = supabase_admin.table("reportes").select(
        "id, usuario_id, estado_moderacion"
    ).eq("id", reporte_id).limit(1).execute()
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    reporte = consulta.data[0]
    if reporte.get("usuario_id") == usuario["id"]:
        raise HTTPException(status_code=403, detail="No puedes reportar tu propia publicación")
    if reporte.get("estado_moderacion") in ("en_revision", "rechazado"):
        raise HTTPException(status_code=409, detail="Este reporte ya no está disponible para denuncias")

    try:
        resultado = supabase_admin.rpc(
            "denunciar_reporte_moderacion",
            {
                "p_reporte_id": reporte_id,
                "p_usuario_id": usuario["id"],
                "p_motivo": body.motivo,
                "p_detalle": body.detalle,
                "p_umbral": 3,
            },
        ).execute()
    except Exception as exc:
        if "denuncia_duplicada" in str(exc):
            raise HTTPException(status_code=409, detail="Ya reportaste esta publicación") from exc
        print(f"[ERROR] No se pudo registrar denuncia para reporte {reporte_id}: {exc}")
        raise HTTPException(status_code=500, detail="No se pudo registrar la denuncia") from exc

    fila = (resultado.data or [{}])[0]
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        # La identidad de quien denuncia es confidencial. Solo queda en la
        # tabla privada que aplica la unicidad por usuario.
        usuario_id=None,
        tipo_evento="denuncia_comunitaria",
        descripcion="Un usuario reportó la publicación para revisión",
        datos_extra={"motivo": body.motivo},
    )
    return {
        "mensaje": "Gracias por avisarnos. Revisaremos esta publicación.",
        "total_denuncias": fila.get("total_denuncias"),
        "estado_moderacion": fila.get("estado_moderacion"),
    }


@router.get("/{reporte_id}/mi-denuncia", status_code=200)
async def obtener_mi_denuncia(reporte_id: str, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    resultado = supabase_admin.table("reporte_denuncias").select(
        "id, motivo, created_at"
    ).eq("reporte_id", reporte_id).eq("usuario_id", usuario["id"]).limit(1).execute()
    return {"reportado": bool(resultado.data), "denuncia": (resultado.data or [None])[0]}


@router.get("/me/notificaciones-moderacion", status_code=200)
async def obtener_notificaciones_moderacion(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    resultado = supabase_admin.table("notificaciones_moderacion").select(
        "id, reporte_id, tipo, mensaje, leida, created_at"
    ).eq("usuario_id", usuario["id"]).order("created_at", desc=True).limit(50).execute()
    return resultado.data or []


@router.patch("/me/notificaciones-moderacion/{notificacion_id}/leer", status_code=200)
async def marcar_notificacion_moderacion_leida(
    notificacion_id: str,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    resultado = (
        supabase_admin.table("notificaciones_moderacion")
        .update({"leida": True})
        .eq("id", notificacion_id)
        .eq("usuario_id", usuario["id"])
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"mensaje": "Notificación marcada como leída"}

@router.get("", response_model=list[ReportListItem], status_code=200)
async def get_reports():
    return await obtener_reportes()

@router.patch("/{reporte_id}/status", status_code=200)
async def update_report_status(reporte_id: str, body: dict, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))

    asociacion_id = usuario.get("asociacion_id")
    if not asociacion_id:
        raise HTTPException(status_code=403, detail="No estás vinculado a ninguna asociación")

    reporte = supabase.table("reportes").select(
        "id, asociacion_asignada_id"
    ).eq("id", reporte_id).execute()

    if not reporte.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    if reporte.data[0]["asociacion_asignada_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Este reporte no pertenece a tu asociación")

    return await cambiar_estado_reporte(
        reporte_id,
        body.get("estado"),
        conclusion=body.get("conclusion"),
        notas=body.get("notas"),
        usuario_id=usuario["id"],
        foto_url=body.get("foto_url"),
    )

@router.get("/me", status_code=200)
async def get_mis_reportes(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_reportes_usuario(usuario["id"])


@router.post("/{reporte_id}/cancel", status_code=200)
def cancelar_reporte_por_reportante(
    reporte_id: str,
    body: CancelarReporteRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    reporte = (
        supabase_admin.table("reportes")
        .select(
            "id, usuario_id, estado_reporte, estado_cobertura, staff_asignado_id, "
            "asociacion_asignada_id"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not reporte.data or reporte.data[0].get("usuario_id") != usuario["id"]:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    fila = reporte.data[0]
    if fila["estado_reporte"] in ("cerrado", "cancelado_por_reportante"):
        raise HTTPException(status_code=409, detail="El reporte ya no puede cancelarse")

    if fila["estado_reporte"] in ("en_camino", "en_atencion", "rescatado") or fila.get(
        "estado_cobertura"
    ) in ("confirmado", "en_atencion"):
        from app.services.report_service import registrar_historial
        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=usuario["id"],
            tipo_evento="cancelacion_reportante_avisada",
            descripcion="El reportante solicitó cancelar con atención en curso",
            datos_extra={"motivo": body.motivo},
        )
        if fila.get("asociacion_asignada_id"):
            supabase_admin.table("notificaciones_coordinacion").insert({
                "asociacion_id": fila["asociacion_asignada_id"],
                "reporte_id": reporte_id,
                "tipo": "cancelacion_reportante",
                "mensaje": "El reportante solicitó cancelar mientras la atención está en curso. Revisa el caso antes de decidir.",
            }).execute()
        try:
            supabase_admin.table("casos_administrativos").insert({
                "reporte_id": reporte_id,
                "tipo": "cancelacion_en_atencion",
                "prioridad": "media",
                "detalle": body.motivo,
            }).execute()
        except Exception:
            pass
        return {
            "estado": fila["estado_reporte"],
            "cancelado": False,
            "mensaje": "La asociación fue avisada; el caso no se cerrará mientras haya atención en curso.",
        }

    supabase_admin.table("propuestas_asignacion").update(
        {"estado": "cancelada", "respondida_at": datetime.now(timezone.utc).isoformat()}
    ).eq("reporte_id", reporte_id).eq("estado", "activa").execute()
    supabase_admin.table("voluntario_ofrecimientos").update(
        {"estado": "expirado", "actualizado_at": datetime.now(timezone.utc).isoformat()}
    ).eq("reporte_id", reporte_id).in_("estado", ["vigente", "seleccionado"]).execute()
    supabase_admin.table("reportes").update(
        {
            "estado_reporte": "cancelado_por_reportante",
            "estado_cobertura": "finalizado",
            "staff_asignado_id": None,
            "confirmacion_voluntario": None,
        }
    ).eq("id", reporte_id).execute()
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento="reporte_cancelado",
        descripcion="El reportante canceló antes de la confirmación",
        datos_extra={"motivo": body.motivo},
    )
    return {"estado": "cancelado_por_reportante", "cancelado": True}
