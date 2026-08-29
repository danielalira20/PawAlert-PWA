from __future__ import annotations

import logging
import unicodedata
from hashlib import sha256
from typing import Callable

from fastapi import UploadFile

from app.db.supabase import supabase_admin
from app.models.adoption import (
    AdoptionIntakeCancel,
    AdoptionIntakeClarification,
    AdoptionIntakeCreate,
    AdoptionIntakeResolve,
    AdoptionProfilePause,
    AdoptionProfilePhotoRemove,
    AdoptionProfilePhotoReview,
    AdoptionProfilePublish,
    AdoptionProfileUpdate,
    FormalAdoptionProfileCreate,
)
from app.services.image_evidence_service import (
    ImagenEvidenciaInvalida,
    MAX_IMAGE_BYTES,
    procesar_imagen_evidencia,
)
from app.services.storage_service import (
    ObjetoPrivadoYaExiste,
    crear_url_firmada_adopcion,
    eliminar_objeto_adopcion,
    subir_bytes_adopcion,
)


logger = logging.getLogger(__name__)
MAX_ADOPTION_PHOTO_BYTES = 10 * 1024 * 1024
PUBLIC_PROFILE_FIELDS = (
    "id, asociacion_id, nombre_publico, tipo_animal_id, "
    "tipo_animal_otro_id, tamanio_id, raza_id, sexo, edad_aproximada, "
    "descripcion, personalidad, salud_conocida, tratamientos, "
    "necesidades_especiales, vacunacion_estado, esterilizacion_estado, "
    "revision_medica_estado, compatibilidad, zona_general, publicado_at, "
    "actualizado_at, estado, estado_moderacion"
)


ERROR_STATUS = {
    "actor_no_encontrado": 404,
    "custodia_no_encontrada": 404,
    "solicitud_ingreso_no_encontrada": 404,
    "animal_no_pertenece_custodia": 404,
    "animal_ingreso_no_encontrado": 404,
    "perfil_adopcion_no_encontrado": 404,
    "adopcion_publica_no_encontrada": 404,
    "actor_no_es_custodio_activo": 403,
    "actor_no_es_proponente_ingreso": 403,
    "actor_no_pertenece_asociacion": 403,
    "asociacion_no_operativa": 403,
    "asociacion_coordinadora_no_operativa": 409,
    "custodia_no_admite_propuesta_adopcion": 409,
    "animal_con_resultado_incompatible_adopcion": 409,
    "animal_ya_tiene_perfil_adopcion_activo": 409,
    "solicitud_ingreso_no_espera_aclaracion": 409,
    "solicitud_ingreso_ya_espera_aclaracion": 409,
    "solicitud_ingreso_terminal": 409,
    "perfil_adopcion_no_publicable": 409,
    "perfil_adopcion_suspendido": 409,
    "perfil_adopcion_no_pausable": 409,
    "perfil_adopcion_no_editable": 409,
    "perfil_adopcion_limite_fotos": 409,
    "foto_perfil_adopcion_no_encontrada": 404,
    "idempotency_key_ingreso_en_conflicto": 409,
    "idempotency_key_aclaracion_en_conflicto": 409,
    "idempotency_key_cancelacion_en_conflicto": 409,
    "idempotency_key_resolucion_en_conflicto": 409,
    "idempotency_key_perfil_formal_en_conflicto": 409,
    "idempotency_key_publicacion_en_conflicto": 409,
    "idempotency_key_pausa_en_conflicto": 409,
    "idempotency_key_actualizacion_perfil_en_conflicto": 409,
    "idempotency_key_registro_foto_en_conflicto": 409,
    "idempotency_key_revision_foto_en_conflicto": 409,
    "idempotency_key_retiro_foto_en_conflicto": 409,
    "individuo_animal_invalido": 422,
    "fecha_disponibilidad_custodia_invalida": 422,
    "fotos_propuesta_invalidas": 422,
    "perfil_adopcion_datos_publicacion_incompletos": 422,
    "perfil_adopcion_sin_foto_aprobada": 422,
    "revision_publicacion_incompleta": 422,
    "actualizacion_perfil_incompleta": 422,
    "actualizacion_perfil_contiene_campos_no_permitidos": 422,
    "compatibilidad_perfil_invalida": 422,
    "vacunacion_estado_invalido": 422,
    "esterilizacion_estado_invalido": 422,
    "revision_medica_estado_invalido": 422,
    "sexo_perfil_invalido": 422,
    "edad_aproximada_perfil_invalida": 422,
    "registro_foto_perfil_incompleto": 422,
    "storage_path_foto_perfil_invalido": 422,
    "revision_foto_perfil_incompleta": 422,
    "retiro_foto_perfil_incompleto": 422,
    "foto_perfil_invalida": 422,
    "adopcion_storage_no_disponible": 503,
    "requisitos_base_adopcion_no_disponibles": 503,
}


ERROR_DETAIL = {
    "actor_no_encontrado": "La cuenta ya no está disponible.",
    "custodia_no_encontrada": "No se encontró una custodia propia con ese identificador.",
    "solicitud_ingreso_no_encontrada": "No se encontró la propuesta de adopción.",
    "animal_no_pertenece_custodia": "El animal seleccionado no pertenece a esta custodia.",
    "animal_ingreso_no_encontrado": "El animal de la propuesta ya no está disponible.",
    "perfil_adopcion_no_encontrado": "No se encontró el perfil dentro de tu asociación.",
    "adopcion_publica_no_encontrada": "Esta adopción ya no está disponible.",
    "actor_no_es_custodio_activo": "Solo el hogar temporal actual puede proponer este ingreso.",
    "actor_no_es_proponente_ingreso": "Solo quien hizo la propuesta puede realizar esta acción.",
    "actor_no_pertenece_asociacion": "Esta acción corresponde a la asociación coordinadora.",
    "asociacion_no_operativa": "La asociación debe estar activa y verificada.",
    "asociacion_coordinadora_no_operativa": "La asociación coordinadora no está disponible para revisar la propuesta.",
    "custodia_no_admite_propuesta_adopcion": "Esta custodia ya no admite propuestas de adopción.",
    "animal_con_resultado_incompatible_adopcion": "El estado actual del animal impide iniciar una adopción.",
    "animal_ya_tiene_perfil_adopcion_activo": "Este animal ya tiene un proceso de adopción activo.",
    "solicitud_ingreso_no_espera_aclaracion": "La propuesta no está esperando una aclaración.",
    "solicitud_ingreso_ya_espera_aclaracion": "Espera la respuesta del hogar temporal antes de pedir otra aclaración.",
    "solicitud_ingreso_terminal": "La propuesta ya fue resuelta y no puede modificarse.",
    "perfil_adopcion_no_publicable": "El perfil no puede publicarse desde su estado actual.",
    "perfil_adopcion_suspendido": "El perfil está suspendido y no puede publicarse.",
    "perfil_adopcion_no_pausable": "Solo un perfil publicado puede pausarse.",
    "perfil_adopcion_no_editable": "Solo puedes editar un borrador o un perfil pausado.",
    "perfil_adopcion_limite_fotos": "El perfil ya tiene el máximo de ocho fotografías.",
    "foto_perfil_adopcion_no_encontrada": "No se encontró la fotografía dentro de este perfil.",
    "individuo_animal_invalido": "Selecciona correctamente al animal de la ficha grupal.",
    "fecha_disponibilidad_custodia_invalida": "La disponibilidad del hogar temporal debe terminar en una fecha futura.",
    "fotos_propuesta_invalidas": "Adjunta entre una y cinco fotografías privadas válidas.",
    "perfil_adopcion_datos_publicacion_incompletos": "Completa los datos públicos del animal antes de publicar.",
    "perfil_adopcion_sin_foto_aprobada": "Aprueba al menos una fotografía antes de publicar.",
    "revision_publicacion_incompleta": "Confirma la revisión médica y jurídica antes de publicar.",
    "actualizacion_perfil_incompleta": "Indica al menos un dato válido para actualizar.",
    "actualizacion_perfil_contiene_campos_no_permitidos": "La actualización contiene campos que no pueden editarse.",
    "compatibilidad_perfil_invalida": "La compatibilidad debe tener un formato válido.",
    "vacunacion_estado_invalido": "Selecciona un estado de vacunación válido.",
    "esterilizacion_estado_invalido": "Selecciona un estado de esterilización válido.",
    "revision_medica_estado_invalido": "Selecciona un estado de revisión médica válido.",
    "sexo_perfil_invalido": "Selecciona un sexo válido.",
    "edad_aproximada_perfil_invalida": "Selecciona una edad aproximada válida.",
    "registro_foto_perfil_incompleto": "La fotografía no contiene todos los datos necesarios.",
    "storage_path_foto_perfil_invalido": "La fotografía no pertenece a este perfil.",
    "revision_foto_perfil_incompleta": "Indica si la fotografía puede publicarse y el motivo cuando sea rechazada.",
    "retiro_foto_perfil_incompleto": "Indica el motivo para retirar la fotografía.",
    "foto_perfil_invalida": "Selecciona una fotografía JPG, PNG o WEBP de hasta 15 MB.",
    "adopcion_storage_no_disponible": "No se pudo guardar la fotografía. Intenta nuevamente.",
    "requisitos_base_adopcion_no_disponibles": "Los requisitos de adopción no están disponibles temporalmente.",
    "idempotency_key_ingreso_en_conflicto": "La misma operación fue enviada antes con datos diferentes.",
    "idempotency_key_aclaracion_en_conflicto": "La misma aclaración fue enviada antes con datos diferentes.",
    "idempotency_key_cancelacion_en_conflicto": "La misma cancelación fue enviada antes con datos diferentes.",
    "idempotency_key_resolucion_en_conflicto": "La misma resolución fue enviada antes con datos diferentes.",
    "idempotency_key_perfil_formal_en_conflicto": "El mismo alta formal fue enviada antes con datos diferentes.",
    "idempotency_key_publicacion_en_conflicto": "La misma publicación fue enviada antes para otro perfil.",
    "idempotency_key_pausa_en_conflicto": "La misma pausa fue enviada antes con datos diferentes.",
    "idempotency_key_actualizacion_perfil_en_conflicto": "La misma actualización fue enviada antes con datos diferentes.",
    "idempotency_key_registro_foto_en_conflicto": "La misma carga fue enviada antes con una fotografía diferente.",
    "idempotency_key_revision_foto_en_conflicto": "La misma revisión fue enviada antes con datos diferentes.",
    "idempotency_key_retiro_foto_en_conflicto": "El mismo retiro fue enviado antes con datos diferentes.",
}


class AdoptionServiceError(Exception):
    def __init__(self, code: str, status_code: int | None = None):
        self.code = code
        self.status_code = status_code or ERROR_STATUS.get(code, 503)
        self.detail = ERROR_DETAIL.get(
            code,
            "No se pudo completar la operación de adopción. Intenta nuevamente.",
        )
        super().__init__(code)


def _rpc(operation: str, params: dict[str, object]) -> dict:
    try:
        response = supabase_admin.rpc(operation, params).execute()
    except Exception as error:
        raw_detail = str(error).lower()
        for code in ERROR_STATUS:
            if code in raw_detail:
                raise AdoptionServiceError(code) from error
        logger.exception("Fallo la operación de adopción %s", operation)
        raise AdoptionServiceError("adopcion_operacion_no_disponible") from error

    data = response.data
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict) or not data.get("id") or not data.get("estado"):
        raise AdoptionServiceError("adopcion_respuesta_invalida")
    return data


def proponer_ingreso_desde_custodia(
    custody_id: str,
    actor_user_id: str,
    body: AdoptionIntakeCreate,
) -> dict:
    return _rpc(
        "proponer_ingreso_adopcion_desde_custodia",
        {
            "p_custodia_id": custody_id,
            "p_animal_id": str(body.animal_id),
            "p_origen_individuo": body.origen_individuo,
            "p_actor_usuario_id": actor_user_id,
            "p_nombre_temporal": body.nombre_temporal,
            "p_fotos_propuesta_paths": body.fotos_propuesta_paths,
            "p_salud_conocida": body.salud_conocida,
            "p_tratamientos_conocidos": body.tratamientos_conocidos,
            "p_temperamento_observado": body.temperamento_observado,
            "p_compatibilidad_observada": body.compatibilidad_observada,
            "p_motivo_propuesta": body.motivo_propuesta,
            "p_custodia_disponible_hasta": (
                body.custodia_disponible_hasta.isoformat()
                if body.custodia_disponible_hasta
                else None
            ),
            "p_idempotency_key": body.idempotency_key,
        },
    )


def responder_aclaracion(
    request_id: str,
    actor_user_id: str,
    body: AdoptionIntakeClarification,
) -> dict:
    return _rpc(
        "responder_aclaracion_ingreso_adopcion",
        {
            "p_solicitud_id": request_id,
            "p_actor_usuario_id": actor_user_id,
            "p_respuesta": body.respuesta,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def cancelar_ingreso(
    request_id: str,
    actor_user_id: str,
    body: AdoptionIntakeCancel,
) -> dict:
    return _rpc(
        "cancelar_solicitud_ingreso_adopcion",
        {
            "p_solicitud_id": request_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def resolver_ingreso(
    request_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionIntakeResolve,
) -> dict:
    return _rpc(
        "resolver_solicitud_ingreso_adopcion",
        {
            "p_solicitud_id": request_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_decision": body.decision,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def crear_perfil_formal(
    association_id: str,
    actor_user_id: str,
    body: FormalAdoptionProfileCreate,
) -> dict:
    return _rpc(
        "crear_perfil_adopcion_formal",
        {
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_datos": body.datos.model_dump(mode="json", exclude_none=True),
            "p_idempotency_key": body.idempotency_key,
        },
    )


def publicar_perfil(
    profile_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfilePublish,
) -> dict:
    return _rpc(
        "publicar_perfil_adopcion",
        {
            "p_perfil_id": profile_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_revision_medica_confirmada": body.revision_medica_confirmada,
            "p_revision_juridica_confirmada": body.revision_juridica_confirmada,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def pausar_perfil(
    profile_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfilePause,
) -> dict:
    return _rpc(
        "pausar_perfil_adopcion",
        {
            "p_perfil_id": profile_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def actualizar_perfil(
    profile_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfileUpdate,
) -> dict:
    return _rpc(
        "actualizar_borrador_perfil_adopcion",
        {
            "p_perfil_id": profile_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_datos": body.datos.model_dump(
                mode="json",
                exclude_unset=True,
            ),
            "p_idempotency_key": body.idempotency_key,
        },
    )


def revisar_foto_perfil(
    profile_id: str,
    photo_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfilePhotoReview,
) -> dict:
    return _rpc(
        "revisar_foto_perfil_adopcion",
        {
            "p_perfil_id": profile_id,
            "p_foto_id": photo_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_aprobada": body.aprobada,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def retirar_foto_perfil(
    profile_id: str,
    photo_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfilePhotoRemove,
) -> dict:
    result = _rpc(
        "retirar_foto_perfil_adopcion",
        {
            "p_perfil_id": profile_id,
            "p_foto_id": photo_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )
    storage_path = result.pop("storage_path", None)
    result["storage_cleanup_pending"] = bool(
        storage_path and not eliminar_objeto_adopcion(storage_path)
    )
    return result


def _query(operation: str, query_factory: Callable[[], object]) -> list[dict]:
    try:
        response = query_factory().execute()
    except AdoptionServiceError:
        raise
    except Exception as error:
        logger.exception("Fallo la consulta de adopción %s", operation)
        raise AdoptionServiceError("adopcion_consulta_no_disponible") from error
    data = response.data
    if not isinstance(data, list):
        raise AdoptionServiceError("adopcion_respuesta_invalida")
    return data


def _obtener_perfil_asociacion(
    profile_id: str,
    association_id: str,
    *,
    editable: bool = False,
) -> dict:
    profiles = _query(
        "obtener perfil de asociación",
        lambda: supabase_admin.table("perfiles_adopcion")
        .select(
            "id, solicitud_ingreso_id, origen, custodia_id, reporte_id, animal_id, "
            "origen_individuo, nombre_publico, tipo_animal_id, tipo_animal_otro_id, "
            "tamanio_id, raza_id, sexo, edad_aproximada, descripcion, personalidad, "
            "salud_conocida, tratamientos, necesidades_especiales, vacunacion_estado, "
            "esterilizacion_estado, revision_medica_estado, compatibilidad, zona_general, "
            "estado, estado_moderacion, revision_medica_confirmada, "
            "revision_juridica_confirmada, revision_publicacion_at, "
            "requisitos_base_version, plantilla_requisitos_id, plantilla_version, "
            "publicado_at, pausado_at, creado_at, actualizado_at"
        )
        .eq("id", profile_id)
        .eq("asociacion_id", association_id)
        .limit(1),
    )
    if not profiles:
        raise AdoptionServiceError("perfil_adopcion_no_encontrado")
    profile = profiles[0]
    if editable and profile.get("estado") not in ("borrador", "pausado"):
        raise AdoptionServiceError("perfil_adopcion_no_editable")
    return profile


def _foto_con_acceso_temporal(photo: dict) -> dict:
    acceso: dict | None = None
    try:
        acceso = crear_url_firmada_adopcion(photo["storage_path"])
    except Exception:
        logger.warning(
            "No se pudo firmar una fotografía privada de adopción",
            exc_info=True,
        )
    return {
        "id": photo["id"],
        "mime_type": photo.get("mime_type"),
        "size_bytes": photo.get("size_bytes"),
        "orden": photo.get("orden"),
        "texto_alternativo": photo.get("texto_alternativo"),
        "aprobada_publicacion": photo.get("aprobada_publicacion", False),
        "aprobada_at": photo.get("aprobada_at"),
        "creada_at": photo.get("creada_at"),
        "actualizada_at": photo.get("actualizada_at"),
        "foto_url": acceso["url"] if acceso else None,
        "foto_url_expira_at": acceso["expira_at"] if acceso else None,
    }


def _reemplazar_paths_ingreso_con_accesos(row: dict) -> dict:
    paths = row.pop("fotos_propuesta_paths", None) or []
    photos: list[dict] = []
    for path in paths:
        try:
            access = crear_url_firmada_adopcion(path)
        except Exception:
            logger.warning(
                "No se pudo firmar una fotografía privada de ingreso",
                exc_info=True,
            )
            access = None
        photos.append(
            {
                "foto_url": access["url"] if access else None,
                "foto_url_expira_at": access["expira_at"] if access else None,
            }
        )
    row["fotos_propuesta"] = photos
    return row


def _adjuntar_fotos_privadas(profiles: list[dict]) -> list[dict]:
    profile_ids = [profile["id"] for profile in profiles]
    if not profile_ids:
        return profiles
    photos = _query(
        "listar fotografías privadas de adopción",
        lambda: supabase_admin.table("fotos_perfil_adopcion")
        .select(
            "id, perfil_adopcion_id, storage_path, mime_type, size_bytes, orden, "
            "texto_alternativo, aprobada_publicacion, aprobada_at, creada_at, "
            "actualizada_at"
        )
        .in_("perfil_adopcion_id", profile_ids)
        .order("orden"),
    )
    grouped: dict[str, list[dict]] = {profile_id: [] for profile_id in profile_ids}
    for photo in photos:
        profile_id = photo.get("perfil_adopcion_id")
        if profile_id in grouped:
            grouped[profile_id].append(_foto_con_acceso_temporal(photo))
    for profile in profiles:
        profile["fotos"] = grouped[profile["id"]]
    return profiles


async def subir_foto_perfil(
    profile_id: str,
    association_id: str,
    actor_user_id: str,
    photo: UploadFile,
    *,
    order: int | None,
    alternative_text: str | None,
    idempotency_key: str,
) -> dict:
    _obtener_perfil_asociacion(profile_id, association_id, editable=True)
    idempotency_key = idempotency_key.strip()
    alternative_text = (
        alternative_text.strip() if alternative_text else None
    ) or None
    if len(idempotency_key) < 8 or len(idempotency_key) > 200:
        raise AdoptionServiceError("registro_foto_perfil_incompleto")
    if order is not None and not 1 <= order <= 8:
        raise AdoptionServiceError("registro_foto_perfil_incompleto")
    if alternative_text and len(alternative_text) > 500:
        raise AdoptionServiceError("registro_foto_perfil_incompleto")
    contenido = await photo.read(MAX_IMAGE_BYTES + 1)
    try:
        processed = procesar_imagen_evidencia(contenido)
    except ImagenEvidenciaInvalida as error:
        raise AdoptionServiceError("foto_perfil_invalida") from error
    if len(processed.contenido_publico) > MAX_ADOPTION_PHOTO_BYTES:
        raise AdoptionServiceError("foto_perfil_invalida")

    digest = sha256()
    digest.update(profile_id.encode("utf-8"))
    digest.update(actor_user_id.encode("utf-8"))
    digest.update(idempotency_key.encode("utf-8"))
    digest.update(processed.contenido_publico)
    filename = f"{digest.hexdigest()}.jpg"
    folder = f"adopciones/perfiles/{profile_id}"
    storage_path = f"{folder}/{filename}"
    uploaded_now = False
    try:
        storage_path = await subir_bytes_adopcion(
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
        logger.exception("No se pudo cargar la fotografía privada de adopción")
        raise AdoptionServiceError("adopcion_storage_no_disponible") from error

    try:
        result = _rpc(
            "registrar_foto_perfil_adopcion",
            {
                "p_perfil_id": profile_id,
                "p_asociacion_id": association_id,
                "p_actor_usuario_id": actor_user_id,
                "p_storage_path": storage_path,
                "p_mime_type": processed.content_type_publico,
                "p_size_bytes": len(processed.contenido_publico),
                "p_orden": order,
                "p_texto_alternativo": alternative_text,
                "p_idempotency_key": idempotency_key,
            },
        )
    except AdoptionServiceError as error:
        # Un 5xx puede significar que la transacción sí confirmó pero se perdió
        # la respuesta. En ese caso conservamos el objeto para no romper la fila.
        if uploaded_now and error.status_code < 500:
            eliminar_objeto_adopcion(storage_path)
        raise

    try:
        access = crear_url_firmada_adopcion(storage_path)
    except Exception:
        logger.warning(
            "La fotografía se guardó pero no pudo firmarse temporalmente",
            exc_info=True,
        )
        access = None
    return {
        **result,
        "mime_type": processed.content_type_publico,
        "size_bytes": len(processed.contenido_publico),
        "texto_alternativo": alternative_text,
        "aprobada_publicacion": False,
        "foto_url": access["url"] if access else None,
        "foto_url_expira_at": access["expira_at"] if access else None,
    }


def obtener_ingreso_de_custodia(custody_id: str, actor_user_id: str) -> dict:
    volunteers = _query(
        "resolver hogar temporal",
        lambda: supabase_admin.table("voluntarios")
        .select("id")
        .eq("usuario_id", actor_user_id)
        .limit(1),
    )
    if not volunteers:
        raise AdoptionServiceError("actor_no_es_custodio_activo")

    custodies = _query(
        "validar custodia propia",
        lambda: supabase_admin.table("custodias_temporales")
        .select("id")
        .eq("id", custody_id)
        .eq("voluntario_id", volunteers[0]["id"])
        .limit(1),
    )
    if not custodies:
        raise AdoptionServiceError("custodia_no_encontrada")

    requests = _query(
        "obtener ingreso de custodia",
        lambda: supabase_admin.table("solicitudes_ingreso_adopcion")
        .select(
            "id, custodia_id, reporte_id, animal_id, origen_individuo, estado, "
            "nombre_temporal, fotos_propuesta_paths, salud_conocida, "
            "tratamientos_conocidos, "
            "temperamento_observado, compatibilidad_observada, motivo_propuesta, "
            "custodia_disponible_hasta, informacion_solicitada, "
            "informacion_solicitada_at, respuesta_informacion, "
            "informacion_respondida_at, motivo_resolucion, creada_at, actualizada_at"
        )
        .eq("custodia_id", custody_id)
        .eq("propuesto_por_usuario_id", actor_user_id)
        .order("creada_at", desc=True)
        .limit(1),
    )
    if not requests:
        raise AdoptionServiceError("solicitud_ingreso_no_encontrada")
    return _reemplazar_paths_ingreso_con_accesos(requests[0])


def listar_ingresos_asociacion(association_id: str) -> list[dict]:
    requests = _query(
        "listar ingresos de asociación",
        lambda: supabase_admin.table("solicitudes_ingreso_adopcion")
        .select(
            "id, origen, custodia_id, reporte_id, animal_id, origen_individuo, "
            "propuesto_por_usuario_id, estado, nombre_temporal, "
            "fotos_propuesta_paths, salud_conocida, tratamientos_conocidos, "
            "temperamento_observado, compatibilidad_observada, motivo_propuesta, "
            "custodia_disponible_hasta, informacion_solicitada, "
            "informacion_solicitada_at, respuesta_informacion, "
            "informacion_respondida_at, motivo_resolucion, creada_at, actualizada_at"
        )
        .eq("asociacion_id", association_id)
        .order("creada_at", desc=True),
    )
    return [
        _reemplazar_paths_ingreso_con_accesos(request) for request in requests
    ]


def listar_perfiles_asociacion(association_id: str) -> list[dict]:
    profiles = _query(
        "listar perfiles de asociación",
        lambda: supabase_admin.table("perfiles_adopcion")
        .select(
            "id, solicitud_ingreso_id, origen, custodia_id, reporte_id, animal_id, "
            "origen_individuo, nombre_publico, tipo_animal_id, tipo_animal_otro_id, "
            "tamanio_id, raza_id, sexo, edad_aproximada, descripcion, personalidad, "
            "salud_conocida, tratamientos, necesidades_especiales, vacunacion_estado, "
            "esterilizacion_estado, revision_medica_estado, compatibilidad, zona_general, "
            "estado, estado_moderacion, revision_medica_confirmada, "
            "revision_juridica_confirmada, revision_publicacion_at, "
            "requisitos_base_version, plantilla_requisitos_id, plantilla_version, "
            "publicado_at, pausado_at, creado_at, actualizado_at"
        )
        .eq("asociacion_id", association_id)
        .order("actualizado_at", desc=True),
    )
    return _adjuntar_fotos_privadas(profiles)


def obtener_perfil_asociacion(profile_id: str, association_id: str) -> dict:
    profile = _obtener_perfil_asociacion(profile_id, association_id)
    return _adjuntar_fotos_privadas([profile])[0]


def _normalizar_filtro_publico(value: object) -> str:
    text = str(value or "").strip().casefold()
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(character)
    )


def _valor_indica_compatibilidad(value: object) -> bool:
    if value is True:
        return True
    if isinstance(value, str):
        return _normalizar_filtro_publico(value) in {
            "apto",
            "compatible",
            "confirmado",
            "si",
        }
    if isinstance(value, dict):
        return any(
            _valor_indica_compatibilidad(value.get(key))
            for key in ("compatible", "estado", "valor")
            if key in value
        )
    return False


def _perfil_coincide_compatibilidad(profile: dict, key: str | None) -> bool:
    if not key:
        return True
    expected = _normalizar_filtro_publico(key)
    compatibility = profile.get("compatibilidad") or {}
    if not isinstance(compatibility, dict):
        return False
    return any(
        _normalizar_filtro_publico(name) == expected
        and _valor_indica_compatibilidad(value)
        for name, value in compatibility.items()
    )


def _catalogo_por_id(table: str, ids: set[str]) -> dict[str, dict]:
    if not ids:
        return {}
    rows = _query(
        f"resolver catálogo público {table}",
        lambda: supabase_admin.table(table)
        .select("id, clave, descripcion")
        .in_("id", sorted(ids)),
    )
    return {
        row["id"]: {
            "clave": row["clave"],
            "descripcion": row["descripcion"],
        }
        for row in rows
        if row.get("id") and row.get("clave") and row.get("descripcion")
    }


def _contexto_publico_perfiles(
    profiles: list[dict],
) -> tuple[dict[str, dict], dict[str, dict[str, dict]]]:
    association_ids = {
        profile["asociacion_id"]
        for profile in profiles
        if profile.get("asociacion_id")
    }
    associations: dict[str, dict] = {}
    if association_ids:
        rows = _query(
            "resolver asociaciones de adopciones públicas",
            lambda: supabase_admin.table("asociaciones")
            .select("id, nombre, acerca_de, logo_url, activo, verificado")
            .in_("id", sorted(association_ids))
            .eq("activo", True)
            .eq("verificado", True),
        )
        associations = {
            row["id"]: {
                "id": row["id"],
                "nombre": row["nombre"],
                "acerca_de": row.get("acerca_de"),
                "logo_url": row.get("logo_url"),
            }
            for row in rows
            if row.get("id")
            and row.get("nombre")
            and row.get("activo") is True
            and row.get("verificado") is True
        }

    catalog_ids = {
        "tipo_animal": {
            profile["tipo_animal_id"]
            for profile in profiles
            if profile.get("tipo_animal_id")
        },
        "tipo_animal_otro": {
            profile["tipo_animal_otro_id"]
            for profile in profiles
            if profile.get("tipo_animal_otro_id")
        },
        "tamanio": {
            profile["tamanio_id"]
            for profile in profiles
            if profile.get("tamanio_id")
        },
        "raza": {
            profile["raza_id"]
            for profile in profiles
            if profile.get("raza_id")
        },
    }
    catalogs = {
        "tipo_animal": _catalogo_por_id(
            "tipo_animal_catalogo", catalog_ids["tipo_animal"]
        ),
        "tipo_animal_otro": _catalogo_por_id(
            "tipo_animal_otro", catalog_ids["tipo_animal_otro"]
        ),
        "tamanio": _catalogo_por_id(
            "tamanio_catalogo", catalog_ids["tamanio"]
        ),
        "raza": _catalogo_por_id("raza_catalogo", catalog_ids["raza"]),
    }
    return associations, catalogs


def _serializar_perfil_publico(
    profile: dict,
    association: dict,
    catalogs: dict[str, dict[str, dict]],
) -> dict | None:
    animal_type = catalogs["tipo_animal"].get(profile.get("tipo_animal_id"))
    size = catalogs["tamanio"].get(profile.get("tamanio_id"))
    if not animal_type or not size:
        logger.warning(
            "Perfil público de adopción %s tiene catálogos incompletos",
            profile.get("id"),
        )
        return None
    return {
        "id": profile["id"],
        "nombre_publico": profile["nombre_publico"],
        "tipo_animal": animal_type,
        "tipo_animal_otro": catalogs["tipo_animal_otro"].get(
            profile.get("tipo_animal_otro_id")
        ),
        "tamanio": size,
        "raza": catalogs["raza"].get(profile.get("raza_id")),
        "sexo": profile["sexo"],
        "edad_aproximada": profile["edad_aproximada"],
        "zona_general": profile["zona_general"],
        "compatibilidad": profile.get("compatibilidad") or {},
        "asociacion": association,
        "publicado_at": profile["publicado_at"],
        "actualizado_at": profile["actualizado_at"],
    }


def _fotos_publicas(
    profile_ids: list[str],
    *,
    solo_portada: bool,
) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {
        profile_id: [] for profile_id in profile_ids
    }
    if not profile_ids:
        return grouped
    photos = _query(
        "listar fotografías públicas de adopción",
        lambda: supabase_admin.table("fotos_perfil_adopcion")
        .select(
            "id, perfil_adopcion_id, storage_path, orden, "
            "texto_alternativo, aprobada_publicacion"
        )
        .in_("perfil_adopcion_id", profile_ids)
        .eq("aprobada_publicacion", True)
        .order("orden"),
    )
    for photo in photos:
        profile_id = photo.get("perfil_adopcion_id")
        if (
            profile_id not in grouped
            or photo.get("aprobada_publicacion") is not True
            or (solo_portada and grouped[profile_id])
        ):
            continue
        try:
            access = crear_url_firmada_adopcion(photo["storage_path"])
        except Exception:
            logger.warning(
                "No se pudo firmar una fotografía pública de adopción",
                exc_info=True,
            )
            continue
        grouped[profile_id].append(
            {
                "id": photo["id"],
                "orden": photo["orden"],
                "texto_alternativo": photo.get("texto_alternativo"),
                "foto_url": access["url"],
                "foto_url_expira_at": access["expira_at"],
            }
        )
    return grouped


def _consultar_perfiles_publicos(profile_id: str | None = None) -> list[dict]:
    def query():
        result = (
            supabase_admin.table("perfiles_adopcion")
            .select(PUBLIC_PROFILE_FIELDS)
            .eq("estado", "publicado")
            .eq("estado_moderacion", "visible")
        )
        if profile_id:
            result = result.eq("id", profile_id).limit(1)
        else:
            result = result.order("publicado_at", desc=True).order(
                "id", desc=True
            )
        return result

    return _query("listar adopciones públicas", query)


def listar_adopciones_publicas(
    *,
    especie: str | None,
    tamanio: str | None,
    edad: str | None,
    zona: str | None,
    compatible_con: str | None,
    pagina: int,
    limite: int,
) -> dict:
    profiles = _consultar_perfiles_publicos()
    associations, catalogs = _contexto_publico_perfiles(profiles)
    species_filter = _normalizar_filtro_publico(especie)
    size_filter = _normalizar_filtro_publico(tamanio)
    zone_filter = _normalizar_filtro_publico(zona)
    public_profiles: list[dict] = []

    for profile in profiles:
        if (
            profile.get("estado") != "publicado"
            or profile.get("estado_moderacion") != "visible"
        ):
            continue
        association = associations.get(profile.get("asociacion_id"))
        if not association:
            continue
        shaped = _serializar_perfil_publico(profile, association, catalogs)
        if not shaped:
            continue
        if species_filter and _normalizar_filtro_publico(
            shaped["tipo_animal"]["clave"]
        ) != species_filter:
            continue
        if size_filter and _normalizar_filtro_publico(
            shaped["tamanio"]["clave"]
        ) != size_filter:
            continue
        if edad and shaped["edad_aproximada"] != edad:
            continue
        if zone_filter and zone_filter not in _normalizar_filtro_publico(
            shaped["zona_general"]
        ):
            continue
        if not _perfil_coincide_compatibilidad(profile, compatible_con):
            continue
        public_profiles.append(shaped)

    public_profiles.sort(
        key=lambda profile: (profile["publicado_at"], profile["id"]),
        reverse=True,
    )
    total = len(public_profiles)
    start = (pagina - 1) * limite
    page_items = public_profiles[start : start + limite]
    photos = _fotos_publicas(
        [profile["id"] for profile in page_items],
        solo_portada=True,
    )
    for profile in page_items:
        profile_photos = photos.get(profile["id"], [])
        profile["foto_portada"] = profile_photos[0] if profile_photos else None
    return {
        "items": page_items,
        "pagina": pagina,
        "limite": limite,
        "total": total,
        "tiene_mas": start + len(page_items) < total,
    }


def obtener_adopcion_publica(profile_id: str) -> dict:
    profiles = _consultar_perfiles_publicos(profile_id)
    if not profiles:
        raise AdoptionServiceError("adopcion_publica_no_encontrada")
    associations, catalogs = _contexto_publico_perfiles(profiles)
    profile = profiles[0]
    if (
        profile.get("estado") != "publicado"
        or profile.get("estado_moderacion") != "visible"
    ):
        raise AdoptionServiceError("adopcion_publica_no_encontrada")
    association = associations.get(profile.get("asociacion_id"))
    if not association:
        raise AdoptionServiceError("adopcion_publica_no_encontrada")
    shaped = _serializar_perfil_publico(profile, association, catalogs)
    if not shaped:
        raise AdoptionServiceError("adopcion_publica_no_encontrada")
    photos = _fotos_publicas([profile_id], solo_portada=False)[profile_id]
    shaped.update(
        {
            "foto_portada": photos[0] if photos else None,
            "descripcion": profile["descripcion"],
            "personalidad": profile["personalidad"],
            "salud_conocida": profile["salud_conocida"],
            "tratamientos": profile.get("tratamientos"),
            "necesidades_especiales": profile.get("necesidades_especiales"),
            "vacunacion_estado": profile["vacunacion_estado"],
            "esterilizacion_estado": profile["esterilizacion_estado"],
            "revision_medica_estado": profile["revision_medica_estado"],
            "fotos": photos,
        }
    )
    return shaped
