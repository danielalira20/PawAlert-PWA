import logging
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import UploadFile

from app.db.supabase import supabase_admin
from app.models.event import (
    EventAction,
    EventCancel,
    EventDraftCreate,
    EventPause,
    EventUpdate,
)
from app.services.image_evidence_service import (
    MAX_IMAGE_BYTES,
    ImagenEvidenciaInvalida,
    procesar_imagen_evidencia,
)
from app.services.storage_service import (
    ObjetoPrivadoYaExiste,
    crear_url_firmada_evento,
    eliminar_objeto_evento,
    subir_bytes_evento,
)


logger = logging.getLogger(__name__)
MAX_EVENT_IMAGE_BYTES = 10 * 1024 * 1024

ASSOCIATION_PUBLIC_FIELDS = "id, nombre, logo_url, acerca_de"
PUBLIC_EVENT_FIELDS = (
    "id, asociacion_id, tipo, categoria_otro, titulo, descripcion, "
    "inicia_at, termina_at, zona_horaria, lugar_nombre, direccion_publica, "
    "municipio, estado_ubicacion, latitud, longitud, modalidad_acceso, "
    "enlace_registro_externo, instrucciones_contacto, especies_objetivo, "
    "publico_objetivo, requisitos_asistencia, servicios_detalle, "
    "condiciones_excluidas, documentos_requeridos, "
    "contacto_institucional_nombre, contacto_institucional_telefono, "
    "contacto_institucional_email, es_gratuito, costo_centavos, moneda, "
    "detalle_costos, cupo_total, cupo_estado, responsable_profesional, "
    "cedula_profesional, institucion_profesional, "
    "datos_profesionales_estado, imagen_storage_path, "
    "imagen_texto_alternativo, accesibilidad, "
    "transporte, estado, version_publica, publicado_at, "
    "motivo_cancelacion_publico"
)
ASSOCIATION_EVENT_FIELDS = (
    "id, asociacion_id, responsable_operativo_usuario_id, tipo, "
    "categoria_otro, titulo, descripcion, inicia_at, termina_at, "
    "zona_horaria, lugar_nombre, direccion_publica, municipio, "
    "estado_ubicacion, latitud, longitud, modalidad_acceso, "
    "enlace_registro_externo, instrucciones_contacto, especies_objetivo, "
    "publico_objetivo, requisitos_asistencia, servicios_detalle, "
    "condiciones_excluidas, documentos_requeridos, "
    "contacto_institucional_nombre, contacto_institucional_telefono, "
    "contacto_institucional_email, es_gratuito, costo_centavos, moneda, "
    "detalle_costos, cupo_total, cupo_estado, responsable_profesional, "
    "cedula_profesional, institucion_profesional, "
    "datos_profesionales_estado, imagen_storage_path, "
    "imagen_texto_alternativo, accesibilidad, "
    "transporte, estado, version_publica, publicado_at, pausado_at, "
    "cancelado_at, motivo_cancelacion_publico, finalizado_at, archivado_at, "
    "creado_at, actualizada_at"
)


ERROR_STATUS = {
    "actor_no_encontrado": 404,
    "evento_no_encontrado": 404,
    "evento_no_encontrado_asociacion": 404,
    "evento_no_disponible_para_guardar": 404,
    "evento_no_estaba_guardado": 404,
    "evento_publico_no_encontrado": 404,
    "actor_no_pertenece_asociacion": 403,
    "asociacion_no_operativa": 403,
    "responsable_operativo_no_pertenece_asociacion": 403,
    "evento_no_editable": 409,
    "evento_no_publicable": 409,
    "evento_no_pausable": 409,
    "evento_no_cancelable": 409,
    "evento_ya_guardado": 409,
    "actualizacion_evento_sin_cambios": 409,
    "idempotency_key_creacion_evento_en_conflicto": 409,
    "idempotency_key_actualizacion_evento_en_conflicto": 409,
    "idempotency_key_publicacion_evento_en_conflicto": 409,
    "idempotency_key_pausa_evento_en_conflicto": 409,
    "idempotency_key_cancelacion_evento_en_conflicto": 409,
    "idempotency_key_guardado_evento_en_conflicto": 409,
    "idempotency_key_retiro_guardado_evento_en_conflicto": 409,
    "idempotency_key_imagen_evento_en_conflicto": 409,
    "idempotency_key_retiro_imagen_evento_en_conflicto": 409,
    "evento_imagen_no_encontrada": 404,
    "payload_evento_invalido": 422,
    "payload_evento_campos_no_permitidos": 422,
    "creacion_evento_incompleta": 422,
    "actualizacion_evento_incompleta": 422,
    "actualizacion_evento_sin_campos": 422,
    "publicacion_evento_incompleta": 422,
    "evento_terminado_no_publicable": 422,
    "evento_publicado_no_puede_quedar_vencido": 422,
    "pausa_evento_incompleta": 422,
    "cancelacion_evento_incompleta": 422,
    "guardado_evento_incompleto": 422,
    "retiro_guardado_evento_incompleto": 422,
    "eventos_asociacion_datos_publicables": 422,
    "eventos_asociacion_clinico_consistente": 422,
    "eventos_asociacion_modalidad_consistente": 422,
    "eventos_asociacion_costo_consistente": 422,
    "eventos_asociacion_fechas_validas": 422,
    "eventos_asociacion_cupo_consistente": 422,
    "eventos_asociacion_categoria_otro_consistente": 422,
    "registro_imagen_evento_incompleto": 422,
    "retiro_imagen_evento_incompleto": 422,
    "storage_path_imagen_evento_invalido": 422,
    "imagen_evento_invalida": 422,
}

ERROR_DETAIL = {
    "actor_no_encontrado": "La cuenta ya no está disponible.",
    "evento_no_encontrado": "No se encontró el evento.",
    "evento_no_encontrado_asociacion": "No se encontró el evento dentro de tu asociación.",
    "evento_no_disponible_para_guardar": "El evento ya no está disponible para guardarse.",
    "evento_no_estaba_guardado": "El evento no estaba guardado en tu cuenta.",
    "evento_publico_no_encontrado": "Este evento no está disponible públicamente.",
    "actor_no_pertenece_asociacion": "Esta acción corresponde a la asociación organizadora.",
    "asociacion_no_operativa": "La asociación debe estar activa y verificada.",
    "responsable_operativo_no_pertenece_asociacion": "El responsable debe pertenecer a la asociación organizadora.",
    "evento_no_editable": "El evento ya no admite modificaciones ordinarias.",
    "evento_no_publicable": "El evento no puede publicarse desde su estado actual.",
    "evento_no_pausable": "Solo un evento publicado puede pausarse.",
    "evento_no_cancelable": "Solo un evento publicado o pausado puede cancelarse.",
    "evento_ya_guardado": "El evento ya está guardado en tu cuenta.",
    "actualizacion_evento_sin_cambios": "La actualización no modifica ningún dato del evento.",
    "payload_evento_invalido": "Los datos del evento no tienen un formato válido.",
    "payload_evento_campos_no_permitidos": "La actualización contiene campos protegidos.",
    "creacion_evento_incompleta": "No se pudo identificar la creación del evento.",
    "actualizacion_evento_incompleta": "No se pudo identificar la actualización del evento.",
    "actualizacion_evento_sin_campos": "Indica al menos un campo para actualizar.",
    "publicacion_evento_incompleta": "No se pudo identificar el evento que deseas publicar.",
    "evento_terminado_no_publicable": "No puedes publicar un evento que ya terminó.",
    "evento_publicado_no_puede_quedar_vencido": "Un evento publicado debe conservar una fecha de término futura.",
    "pausa_evento_incompleta": "Indica por qué se pausará el evento.",
    "cancelacion_evento_incompleta": "Indica un motivo público para cancelar.",
    "guardado_evento_incompleto": "No se pudo guardar el evento.",
    "retiro_guardado_evento_incompleto": "No se pudo retirar el evento guardado.",
    "eventos_asociacion_datos_publicables": "Completa los datos públicos obligatorios antes de publicar.",
    "eventos_asociacion_clinico_consistente": "Completa el responsable y los servicios profesionales del evento clínico.",
    "eventos_asociacion_modalidad_consistente": "Completa los datos requeridos por la modalidad de acceso.",
    "eventos_asociacion_costo_consistente": "Revisa la gratuidad y el costo informado.",
    "eventos_asociacion_fechas_validas": "La fecha de inicio debe ser anterior a la fecha de término.",
    "eventos_asociacion_cupo_consistente": "Revisa el cupo y su estado.",
    "eventos_asociacion_categoria_otro_consistente": "Describe la categoría del evento.",
    "evento_imagen_no_encontrada": "El evento no tiene una imagen para retirar.",
    "registro_imagen_evento_incompleto": "Completa la imagen y su texto alternativo.",
    "retiro_imagen_evento_incompleto": "No se pudo identificar el retiro de la imagen.",
    "storage_path_imagen_evento_invalido": "La imagen no pertenece a este evento.",
    "imagen_evento_invalida": "Selecciona una imagen JPEG, PNG o WebP válida.",
    "evento_storage_no_disponible": "No se pudo acceder al almacenamiento de eventos.",
}

for _idempotency_code in (
    "idempotency_key_creacion_evento_en_conflicto",
    "idempotency_key_actualizacion_evento_en_conflicto",
    "idempotency_key_publicacion_evento_en_conflicto",
    "idempotency_key_pausa_evento_en_conflicto",
    "idempotency_key_cancelacion_evento_en_conflicto",
    "idempotency_key_guardado_evento_en_conflicto",
    "idempotency_key_retiro_guardado_evento_en_conflicto",
    "idempotency_key_imagen_evento_en_conflicto",
    "idempotency_key_retiro_imagen_evento_en_conflicto",
):
    ERROR_DETAIL[_idempotency_code] = (
        "La misma operación fue utilizada antes con datos diferentes."
    )


class EventServiceError(Exception):
    def __init__(self, code: str, status_code: int | None = None):
        self.code = code
        self.status_code = status_code or ERROR_STATUS.get(code, 503)
        self.detail = ERROR_DETAIL.get(
            code,
            "No se pudo completar la operación de eventos. Intenta nuevamente.",
        )
        super().__init__(code)


def _rpc(
    operation: str,
    params: dict[str, object],
    *,
    required_fields: tuple[str, ...],
) -> dict:
    try:
        response = supabase_admin.rpc(operation, params).execute()
    except Exception as error:
        raw_detail = str(error).lower()
        for code in sorted(ERROR_STATUS, key=len, reverse=True):
            if code in raw_detail:
                raise EventServiceError(code) from error
        logger.exception("Falló la operación de eventos %s", operation)
        raise EventServiceError("evento_operacion_no_disponible") from error

    data = response.data
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict) or any(
        data.get(field) is None for field in required_fields
    ):
        raise EventServiceError("evento_respuesta_invalida")
    return data


def _write_data(body: EventDraftCreate | EventUpdate) -> dict:
    return body.datos.model_dump(mode="json", exclude_unset=True)


def crear_borrador(
    association_id: str,
    actor_user_id: str,
    body: EventDraftCreate,
) -> dict:
    return _rpc(
        "crear_borrador_evento_asociacion",
        {
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_datos": _write_data(body),
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )


def actualizar_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    body: EventUpdate,
) -> dict:
    return _rpc(
        "actualizar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_datos": _write_data(body),
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )


def publicar_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    body: EventAction,
) -> dict:
    return _rpc(
        "publicar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )


def pausar_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    body: EventPause,
) -> dict:
    return _rpc(
        "pausar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )


def cancelar_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    body: EventCancel,
) -> dict:
    return _rpc(
        "cancelar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo_publico": body.motivo_publico,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )


def guardar_evento(
    event_id: str,
    actor_user_id: str,
    body: EventAction,
) -> dict:
    return _rpc(
        "guardar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("evento_id", "guardado"),
    )


def dejar_de_guardar_evento(
    event_id: str,
    actor_user_id: str,
    body: EventAction,
) -> dict:
    return _rpc(
        "dejar_de_guardar_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("evento_id", "guardado"),
    )


def _obtener_evento_asociacion(
    event_id: str,
    association_id: str,
    *,
    editable: bool,
) -> dict:
    try:
        response = (
            supabase_admin.table("eventos_asociacion")
            .select("id, asociacion_id, estado, imagen_storage_path")
            .eq("id", event_id)
            .eq("asociacion_id", association_id)
            .limit(1)
            .execute()
        )
    except Exception as error:
        logger.exception("No se pudo verificar el evento %s", event_id)
        raise EventServiceError("evento_consulta_no_disponible") from error
    if not response.data:
        raise EventServiceError("evento_no_encontrado_asociacion")
    event = response.data[0]
    if editable and event.get("estado") not in (
        "borrador",
        "publicado",
        "pausado",
    ):
        raise EventServiceError("evento_no_editable")
    return event


def _firmar_imagen_evento(storage_path: str | None) -> dict | None:
    if not storage_path:
        return None
    try:
        return crear_url_firmada_evento(storage_path)
    except Exception:
        logger.warning(
            "No se pudo firmar una imagen privada de evento",
            exc_info=True,
        )
        return None


async def subir_imagen_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    image: UploadFile,
    *,
    alternative_text: str,
    idempotency_key: str,
) -> dict:
    _obtener_evento_asociacion(event_id, association_id, editable=True)
    alternative_text = alternative_text.strip()
    idempotency_key = idempotency_key.strip()
    if not 1 <= len(alternative_text) <= 500 or not 8 <= len(
        idempotency_key
    ) <= 200:
        raise EventServiceError("registro_imagen_evento_incompleto")

    content = await image.read(MAX_IMAGE_BYTES + 1)
    try:
        processed = procesar_imagen_evidencia(content)
    except ImagenEvidenciaInvalida as error:
        raise EventServiceError("imagen_evento_invalida") from error
    if len(processed.contenido_publico) > MAX_EVENT_IMAGE_BYTES:
        raise EventServiceError("imagen_evento_invalida")

    digest = sha256()
    digest.update(event_id.encode("utf-8"))
    digest.update(actor_user_id.encode("utf-8"))
    digest.update(idempotency_key.encode("utf-8"))
    digest.update(processed.contenido_publico)
    filename = f"{digest.hexdigest()}.jpg"
    folder = f"eventos/{event_id}"
    storage_path = f"{folder}/{filename}"
    uploaded_now = False
    try:
        storage_path = await subir_bytes_evento(
            processed.contenido_publico,
            carpeta=folder,
            content_type=processed.content_type_publico,
            extension=processed.extension_publica,
            nombre_archivo=filename,
        )
        uploaded_now = True
    except ObjetoPrivadoYaExiste:
        pass
    except Exception as error:
        logger.exception("No se pudo cargar la imagen privada del evento")
        raise EventServiceError("evento_storage_no_disponible") from error

    try:
        result = _rpc(
            "registrar_imagen_evento_asociacion",
            {
                "p_evento_id": event_id,
                "p_asociacion_id": association_id,
                "p_actor_usuario_id": actor_user_id,
                "p_storage_path": storage_path,
                "p_mime_type": processed.content_type_publico,
                "p_size_bytes": len(processed.contenido_publico),
                "p_texto_alternativo": alternative_text,
                "p_idempotency_key": idempotency_key,
            },
            required_fields=("id", "estado", "storage_path"),
        )
    except EventServiceError as error:
        if uploaded_now and error.status_code < 500:
            eliminar_objeto_evento(storage_path)
        raise

    previous_path = result.pop("previous_storage_path", None)
    result.pop("storage_path", None)
    result.pop("mime_type", None)
    result.pop("size_bytes", None)
    result.pop("texto_alternativo", None)
    cleanup_pending = False
    if (
        not result.get("reintento")
        and previous_path
        and previous_path != storage_path
    ):
        cleanup_pending = not eliminar_objeto_evento(previous_path)
    access = _firmar_imagen_evento(storage_path)
    return {
        **result,
        "imagen_url": access["url"] if access else None,
        "imagen_url_expira_at": access["expira_at"] if access else None,
        "imagen_mime_type": processed.content_type_publico,
        "imagen_size_bytes": len(processed.contenido_publico),
        "imagen_texto_alternativo": alternative_text,
        "storage_cleanup_pending": cleanup_pending,
    }


def retirar_imagen_evento(
    event_id: str,
    association_id: str,
    actor_user_id: str,
    body: EventAction,
) -> dict:
    _obtener_evento_asociacion(event_id, association_id, editable=True)
    result = _rpc(
        "retirar_imagen_evento_asociacion",
        {
            "p_evento_id": event_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
        required_fields=("id", "estado"),
    )
    previous_path = result.pop("previous_storage_path", None)
    cleanup_pending = False
    if not result.get("reintento") and previous_path:
        cleanup_pending = not eliminar_objeto_evento(previous_path)
    return {
        **result,
        "imagen_url": None,
        "imagen_url_expira_at": None,
        "imagen_mime_type": None,
        "imagen_size_bytes": None,
        "imagen_texto_alternativo": None,
        "storage_cleanup_pending": cleanup_pending,
    }


def _association(row: dict) -> dict:
    association = row.get("asociacion") or row.get("asociaciones") or {}
    if isinstance(association, list):
        association = association[0] if association else {}
    return {
        "id": association.get("id"),
        "nombre": association.get("nombre"),
        "logo_url": association.get("logo_url"),
        "acerca_de": association.get("acerca_de"),
    }


def _public_summary(row: dict) -> dict:
    access = _firmar_imagen_evento(row.get("imagen_storage_path"))
    return {
        "id": row.get("id"),
        "tipo": row.get("tipo"),
        "categoria_otro": row.get("categoria_otro"),
        "titulo": row.get("titulo"),
        "descripcion": row.get("descripcion"),
        "inicia_at": row.get("inicia_at"),
        "termina_at": row.get("termina_at"),
        "zona_horaria": row.get("zona_horaria"),
        "municipio": row.get("municipio"),
        "estado_ubicacion": row.get("estado_ubicacion"),
        "especies_objetivo": row.get("especies_objetivo") or [],
        "es_gratuito": row.get("es_gratuito"),
        "costo_centavos": row.get("costo_centavos"),
        "moneda": row.get("moneda"),
        "cupo_total": row.get("cupo_total"),
        "cupo_estado": row.get("cupo_estado"),
        "imagen_url": access["url"] if access else None,
        "imagen_url_expira_at": access["expira_at"] if access else None,
        "imagen_texto_alternativo": row.get("imagen_texto_alternativo"),
        "asociacion": _association(row),
    }


def _public_detail(row: dict) -> dict:
    result = _public_summary(row)
    result.update(
        {
            "lugar_nombre": row.get("lugar_nombre"),
            "direccion_publica": row.get("direccion_publica"),
            "latitud": row.get("latitud"),
            "longitud": row.get("longitud"),
            "modalidad_acceso": row.get("modalidad_acceso"),
            "enlace_registro_externo": row.get("enlace_registro_externo"),
            "instrucciones_contacto": row.get("instrucciones_contacto"),
            "publico_objetivo": row.get("publico_objetivo"),
            "requisitos_asistencia": row.get("requisitos_asistencia"),
            "servicios_detalle": row.get("servicios_detalle"),
            "condiciones_excluidas": row.get("condiciones_excluidas") or [],
            "documentos_requeridos": row.get("documentos_requeridos") or [],
            "contacto_institucional_nombre": row.get(
                "contacto_institucional_nombre"
            ),
            "contacto_institucional_telefono": row.get(
                "contacto_institucional_telefono"
            ),
            "contacto_institucional_email": row.get(
                "contacto_institucional_email"
            ),
            "detalle_costos": row.get("detalle_costos"),
            "responsable_profesional": row.get("responsable_profesional"),
            "cedula_profesional": row.get("cedula_profesional"),
            "institucion_profesional": row.get("institucion_profesional"),
            "datos_profesionales_estado": row.get(
                "datos_profesionales_estado"
            ),
            "accesibilidad": row.get("accesibilidad"),
            "transporte": row.get("transporte"),
            "estado": row.get("estado"),
            "version_publica": row.get("version_publica"),
            "publicado_at": row.get("publicado_at"),
            "motivo_cancelacion_publico": row.get(
                "motivo_cancelacion_publico"
            ),
        }
    )
    return result


def _public_query(*, count: str | None = None):
    fields = (
        f"{PUBLIC_EVENT_FIELDS}, "
        f"asociacion:asociaciones!inner({ASSOCIATION_PUBLIC_FIELDS})"
    )
    return supabase_admin.table("eventos_asociacion").select(fields, count=count)


def listar_eventos_publicos(
    *,
    tipo: str | None,
    asociacion_id: str | None,
    municipio: str | None,
    especie: str | None,
    gratuito: bool | None,
    desde: datetime | None,
    hasta: datetime | None,
    pagina: int,
    limite: int,
) -> dict:
    now = datetime.now(timezone.utc)
    try:
        query = (
            _public_query(count="exact")
            .eq("estado", "publicado")
            .gt("termina_at", now.isoformat())
            .eq("asociacion.activo", True)
            .eq("asociacion.verificado", True)
        )
        if tipo:
            query = query.eq("tipo", tipo)
        if asociacion_id:
            query = query.eq("asociacion_id", asociacion_id)
        if municipio:
            query = query.ilike("municipio", f"%{municipio.strip()}%")
        if especie:
            query = query.contains("especies_objetivo", [especie])
        if gratuito is not None:
            query = query.eq("es_gratuito", gratuito)
        if desde:
            query = query.gte("inicia_at", desde.isoformat())
        if hasta:
            query = query.lte("inicia_at", hasta.isoformat())

        offset = (pagina - 1) * limite
        response = (
            query.order("inicia_at")
            .range(offset, offset + limite - 1)
            .execute()
        )
    except Exception as error:
        logger.exception("No se pudieron listar los eventos públicos")
        raise EventServiceError("evento_consulta_no_disponible") from error

    rows = response.data or []
    total = response.count if response.count is not None else len(rows)
    return {
        "items": [_public_summary(row) for row in rows],
        "pagina": pagina,
        "limite": limite,
        "total": total,
        "tiene_mas": offset + len(rows) < total,
    }


def listar_eventos_mapa(
    *,
    tipo: str | None,
    municipio: str | None,
    latitud_min: float | None,
    latitud_max: float | None,
    longitud_min: float | None,
    longitud_max: float | None,
    limite: int,
) -> list[dict]:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=90)
    try:
        query = (
            _public_query()
            .eq("estado", "publicado")
            .gt("termina_at", now.isoformat())
            .lte("inicia_at", window_end.isoformat())
            .eq("asociacion.activo", True)
            .eq("asociacion.verificado", True)
        )
        if tipo:
            query = query.eq("tipo", tipo)
        if municipio:
            query = query.ilike("municipio", f"%{municipio.strip()}%")
        if latitud_min is not None:
            query = query.gte("latitud", latitud_min)
        if latitud_max is not None:
            query = query.lte("latitud", latitud_max)
        if longitud_min is not None:
            query = query.gte("longitud", longitud_min)
        if longitud_max is not None:
            query = query.lte("longitud", longitud_max)
        rows = query.order("inicia_at").limit(limite).execute().data or []
    except Exception as error:
        logger.exception("No se pudieron listar los eventos del mapa")
        raise EventServiceError("evento_consulta_no_disponible") from error

    return [
        {
            "id": row.get("id"),
            "tipo": row.get("tipo"),
            "titulo": row.get("titulo"),
            "inicia_at": row.get("inicia_at"),
            "termina_at": row.get("termina_at"),
            "zona_horaria": row.get("zona_horaria"),
            "latitud": row.get("latitud"),
            "longitud": row.get("longitud"),
            "cupo_estado": row.get("cupo_estado"),
            "asociacion": _association(row),
        }
        for row in rows
    ]


def obtener_evento_publico(event_id: str) -> dict:
    try:
        response = (
            _public_query()
            .eq("id", event_id)
            .in_("estado", ["publicado", "cancelado"])
            .eq("asociacion.activo", True)
            .eq("asociacion.verificado", True)
            .limit(1)
            .execute()
        )
    except Exception as error:
        logger.exception("No se pudo obtener el evento público %s", event_id)
        raise EventServiceError("evento_consulta_no_disponible") from error
    if not response.data:
        raise EventServiceError("evento_publico_no_encontrado")
    return _public_detail(response.data[0])


def listar_eventos_asociacion(
    association_id: str,
    *,
    estado: str | None,
    limite: int,
) -> list[dict]:
    try:
        query = (
            supabase_admin.table("eventos_asociacion")
            .select(ASSOCIATION_EVENT_FIELDS)
            .eq("asociacion_id", association_id)
        )
        if estado:
            query = query.eq("estado", estado)
        rows = query.order("actualizada_at", desc=True).limit(limite).execute().data or []
    except Exception as error:
        logger.exception(
            "No se pudieron listar los eventos de la asociación %s",
            association_id,
        )
        raise EventServiceError("evento_consulta_no_disponible") from error

    result = []
    for row in rows:
        private_row = dict(row)
        storage_path = private_row.pop("imagen_storage_path", None)
        access = _firmar_imagen_evento(storage_path)
        private_row["imagen_url"] = access["url"] if access else None
        private_row["imagen_url_expira_at"] = (
            access["expira_at"] if access else None
        )
        result.append(private_row)
    return result


def listar_eventos_guardados(actor_user_id: str, *, limite: int) -> list[dict]:
    fields = (
        "id, evento_id, creado_at, "
        f"evento:eventos_asociacion!inner({PUBLIC_EVENT_FIELDS}, "
        f"asociacion:asociaciones!inner({ASSOCIATION_PUBLIC_FIELDS}))"
    )
    try:
        rows = (
            supabase_admin.table("eventos_guardados")
            .select(fields)
            .eq("usuario_id", actor_user_id)
            .in_(
                "evento.estado",
                ["publicado", "pausado", "cancelado"],
            )
            .order("creado_at", desc=True)
            .limit(limite)
            .execute()
            .data
            or []
        )
    except Exception as error:
        logger.exception("No se pudieron listar los eventos guardados")
        raise EventServiceError("evento_consulta_no_disponible") from error

    result = []
    for row in rows:
        event = row.get("evento") or {}
        if isinstance(event, list):
            event = event[0] if event else {}
        if not event:
            continue
        result.append(
            {
                "id": row.get("id"),
                "evento_id": row.get("evento_id"),
                "creado_at": row.get("creado_at"),
                "evento": _public_summary(event),
            }
        )
    return result
