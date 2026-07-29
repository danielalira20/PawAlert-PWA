from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from app.models.report import ReportResponse, AnimalInput, ReportListItem, HitoRequest, RechazarReporteRequest
from app.models.red_aliados import AceptarSugerenciaRequest, AceptarSugerenciaVeterinariaResponse
from app.services.report_service import crear_reporte, obtener_reportes, cambiar_estado_reporte, obtener_reportes_usuario
from app.services import coverage_service
from app.utils.validators import validar_telefono, validar_email
from app.utils.animal_shaping import shape_animal_embed, condicion_mas_grave
from typing import Optional, List
from app.db.supabase import supabase
from datetime import datetime, timedelta, timezone
import json
import math


router = APIRouter()
RADIO_LLEGADA_ZONA_METROS = 500

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
        if rol_usuario != "voluntario_externo":
            raise HTTPException(
                status_code=403,
                detail="Este hito corresponde a un voluntario externo",
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
        if not body.condicion_observada or not body.destino:
            raise HTTPException(
                status_code=422,
                detail="Indica la condición del animal y el destino del resguardo",
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
            supabase.table("perfil_casa_temporal")
            .select("latitud, longitud, tiempo_resguardo_dias")
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
            dias_resguardo = hogar.data[0].get("tiempo_resguardo_dias")
            supabase.table("custodias_temporales").insert(
                {
                    "reporte_id": reporte_id,
                    "voluntario_id": voluntario.data[0]["id"],
                    "asociacion_coordinadora_id": reporte["asociacion_asignada_id"],
                    "estado": "activo",
                    "fecha_limite": (
                        ahora_custodia + timedelta(days=int(dias_resguardo))
                    ).isoformat() if dias_resguardo else None,
                    "proximo_seguimiento_at": (ahora_custodia + timedelta(hours=3)).isoformat(),
                    "frecuencia_horas": 72,
                }
            ).execute()

    # Registrar en historial
    from app.services.report_service import registrar_historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario["id"],
        tipo_evento=EVENTOS_HISTORIAL_POR_HITO[tipo_hito],
        descripcion=f"Hito registrado: {tipo_hito}",
        datos_extra={
            "condicion_observada": body.condicion_observada,
            "comentario": body.comentario,
            "destino": body.destino,
            "foto_url": body.foto_url,
            "foto_entorno_url": body.foto_entorno_url,
            "latitud": body.latitud,
            "longitud": body.longitud,
            "tiempo_busqueda_minutos": body.tiempo_busqueda_minutos,
            "distancia_reporte_metros": (
                round(distancia_reporte_metros)
                if distancia_reporte_metros is not None
                else None
            ),
        }
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
        "sugerencia_aliado": sugerencia_aliado,
    }

### FIN endpoind: staff registra avances del rescate

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
