from __future__ import annotations

import logging
import unicodedata
import math
from hashlib import sha256
from typing import Callable

from fastapi import UploadFile

from app.db.supabase import supabase_admin
from app.models.adoption import (
    AdoptionApplicationAction,
    AdoptionApplicationDraftCreate,
    AdoptionApplicationDraftUpdate,
    AdoptionApplicationReject,
    AdoptionApplicationRequestInformation,
    AdoptionApplicationWithdraw,
    AdoptionIntakeCancel,
    AdoptionIntakeClarification,
    AdoptionIntakeCreate,
    AdoptionIntakeResolve,
    AdoptionProfilePause,
    AdoptionProfileMarkAdopted,
    AdoptionProfilePhotoRemove,
    AdoptionProfilePhotoReview,
    AdoptionProfilePublish,
    AdoptionProfileUpdate,
    AdoptionRequirementTemplateAction,
    AdoptionRequirementTemplateRetire,
    AdoptionRequirementTemplateWrite,
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
MAX_ADOPTION_DOCUMENT_BYTES = 10 * 1024 * 1024
PUBLIC_PROFILE_FIELDS = (
    "id, asociacion_id, nombre_publico, tipo_animal_id, "
    "tipo_animal_otro_id, tamanio_id, raza_id, sexo, edad_aproximada, "
    "descripcion, personalidad, salud_conocida, tratamientos, "
    "necesidades_especiales, vacunacion_estado, esterilizacion_estado, "
    "revision_medica_estado, compatibilidad, zona_general, publicado_at, "
    "actualizado_at, estado, estado_moderacion, requisitos_base_version, "
    "plantilla_requisitos_id, plantilla_version"
)


ERROR_STATUS = {
    "actor_no_encontrado": 404,
    "custodia_no_encontrada": 404,
    "solicitud_ingreso_no_encontrada": 404,
    "animal_no_pertenece_custodia": 404,
    "animal_ingreso_no_encontrado": 404,
    "perfil_adopcion_no_encontrado": 404,
    "adopcion_publica_no_encontrada": 404,
    "plantilla_requisitos_adopcion_no_encontrada": 404,
    "solicitud_adopcion_no_encontrada": 404,
    "solicitud_adopcion_no_encontrada_asociacion": 404,
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
    "plantilla_requisitos_adopcion_no_editable": 409,
    "plantilla_requisitos_adopcion_no_activable": 409,
    "plantilla_requisitos_adopcion_no_retirable": 409,
    "adopcion_publica_no_disponible": 409,
    "solicitud_adopcion_abierta_duplicada": 409,
    "solicitud_adopcion_respuestas_no_editables": 409,
    "solicitud_adopcion_no_enviable": 409,
    "solicitud_adopcion_no_retirable": 409,
    "solicitud_adopcion_no_admite_informacion": 409,
    "solicitud_adopcion_vencida": 409,
    "perfil_adopcion_no_admite_seleccion": 409,
    "solicitud_adopcion_no_seleccionable": 409,
    "perfil_adopcion_seleccion_en_conflicto": 409,
    "solicitud_adopcion_no_rechazable": 409,
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
    "idempotency_key_plantilla_creacion_en_conflicto": 409,
    "idempotency_key_plantilla_actualizacion_en_conflicto": 409,
    "idempotency_key_plantilla_activacion_en_conflicto": 409,
    "idempotency_key_plantilla_retiro_en_conflicto": 409,
    "idempotency_key_borrador_adopcion_en_conflicto": 409,
    "idempotency_key_respuestas_adopcion_en_conflicto": 409,
    "idempotency_key_envio_adopcion_en_conflicto": 409,
    "idempotency_key_retiro_adopcion_en_conflicto": 409,
    "idempotency_key_informacion_adopcion_en_conflicto": 409,
    "idempotency_key_seleccion_adopcion_en_conflicto": 409,
    "idempotency_key_rechazo_adopcion_en_conflicto": 409,
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
    "plantilla_requisitos_adopcion_invalida": 422,
    "preguntas_plantilla_adopcion_invalidas": 422,
    "activacion_plantilla_requisitos_incompleta": 422,
    "retiro_plantilla_requisitos_incompleto": 422,
    "clave_requisito_adopcion_reservada": 422,
    "borrador_solicitud_adopcion_incompleto": 422,
    "respuestas_solicitud_adopcion_invalidas": 422,
    "respuesta_solicitud_adopcion_invalida": 422,
    "documento_solicitud_adopcion_fuera_de_contexto": 422,
    "envio_solicitud_adopcion_incompleto": 422,
    "solicitud_adopcion_requisitos_obligatorios_incompletos": 422,
    "solicitud_adopcion_consentimientos_requeridos": 422,
    "retiro_solicitud_adopcion_incompleto": 422,
    "documento_solicitud_adopcion_invalido": 422,
    "solicitud_informacion_adopcion_incompleta": 422,
    "seleccion_solicitud_adopcion_incompleta": 422,
    "rechazo_solicitud_adopcion_incompleto": 422,
    "solicitante_requiere_cuenta": 403,
    "solicitante_requiere_contacto_verificado": 403,
    "adopcion_documento_storage_no_disponible": 503,
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
    "plantilla_requisitos_adopcion_no_encontrada": "No se encontró la plantilla dentro de tu asociación.",
    "solicitud_adopcion_no_encontrada": "No se encontró una solicitud de adopción propia con ese identificador.",
    "solicitud_adopcion_no_encontrada_asociacion": "No se encontró la solicitud dentro de tu asociación.",
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
    "plantilla_requisitos_adopcion_no_editable": "Solo puedes modificar una plantilla en borrador.",
    "plantilla_requisitos_adopcion_no_activable": "Solo puedes activar una plantilla en borrador.",
    "plantilla_requisitos_adopcion_no_retirable": "Solo puedes retirar la plantilla que está activa.",
    "adopcion_publica_no_disponible": "Este animal ya no está recibiendo solicitudes.",
    "solicitud_adopcion_abierta_duplicada": "Ya tienes una solicitud abierta para este animal.",
    "solicitud_adopcion_respuestas_no_editables": "Esta solicitud ya no permite modificar respuestas.",
    "solicitud_adopcion_no_enviable": "Esta solicitud no puede enviarse desde su estado actual.",
    "solicitud_adopcion_no_retirable": "La solicitud seleccionada debe cancelarse primero con la asociación.",
    "solicitud_adopcion_no_admite_informacion": "Esta solicitud no admite una nueva petición de información.",
    "solicitud_adopcion_vencida": "La solicitud venció y ya no admite decisiones.",
    "perfil_adopcion_no_admite_seleccion": "El perfil ya no admite seleccionar una solicitud.",
    "solicitud_adopcion_no_seleccionable": "Esta solicitud no puede seleccionarse desde su estado actual.",
    "perfil_adopcion_seleccion_en_conflicto": "Otra solicitud ya fue seleccionada para este animal.",
    "solicitud_adopcion_no_rechazable": "Esta solicitud ya no puede rechazarse.",
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
    "plantilla_requisitos_adopcion_invalida": "Revisa el nombre y las preguntas de la plantilla.",
    "preguntas_plantilla_adopcion_invalidas": "Una o más preguntas adicionales tienen un formato inválido.",
    "activacion_plantilla_requisitos_incompleta": "No se pudo identificar la plantilla que deseas activar.",
    "retiro_plantilla_requisitos_incompleto": "Indica por qué se retirará esta plantilla.",
    "clave_requisito_adopcion_reservada": "La clave de una pregunta ya pertenece a un requisito obligatorio de PawAlert.",
    "borrador_solicitud_adopcion_incompleto": "No se pudo identificar el perfil o la operación del borrador.",
    "respuestas_solicitud_adopcion_invalidas": "Revisa las respuestas antes de guardarlas.",
    "respuesta_solicitud_adopcion_invalida": "Una respuesta no coincide con el tipo u opciones de la pregunta.",
    "documento_solicitud_adopcion_fuera_de_contexto": "El documento no pertenece a esta solicitud.",
    "envio_solicitud_adopcion_incompleto": "No se pudo identificar la solicitud que deseas enviar.",
    "solicitud_adopcion_requisitos_obligatorios_incompletos": "Completa todos los requisitos obligatorios antes de enviar.",
    "solicitud_adopcion_consentimientos_requeridos": "Acepta los compromisos obligatorios de adopción para continuar.",
    "retiro_solicitud_adopcion_incompleto": "Indica por qué deseas retirar la solicitud.",
    "documento_solicitud_adopcion_invalido": "Adjunta una imagen o PDF válido de hasta 10 MB.",
    "solicitud_informacion_adopcion_incompleta": "Indica claramente la información que necesitas.",
    "seleccion_solicitud_adopcion_incompleta": "No se pudo identificar la solicitud que deseas seleccionar.",
    "rechazo_solicitud_adopcion_incompleto": "Registra un motivo interno y una categoría pública válidos.",
    "solicitante_requiere_cuenta": "Necesitas una cuenta para solicitar una adopción.",
    "solicitante_requiere_contacto_verificado": "Verifica tu correo o teléfono antes de solicitar una adopción.",
    "adopcion_documento_storage_no_disponible": "No se pudo guardar el documento. Intenta nuevamente.",
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
    "idempotency_key_plantilla_creacion_en_conflicto": "La misma creación fue enviada antes con una plantilla diferente.",
    "idempotency_key_plantilla_actualizacion_en_conflicto": "La misma actualización fue enviada antes con datos diferentes.",
    "idempotency_key_plantilla_activacion_en_conflicto": "La misma activación fue enviada antes para otra plantilla.",
    "idempotency_key_plantilla_retiro_en_conflicto": "El mismo retiro fue enviado antes con datos diferentes.",
    "idempotency_key_borrador_adopcion_en_conflicto": "La misma creación fue enviada antes para otro animal.",
    "idempotency_key_respuestas_adopcion_en_conflicto": "El mismo guardado fue enviado antes con respuestas diferentes.",
    "idempotency_key_envio_adopcion_en_conflicto": "El mismo envío fue utilizado antes para otra solicitud.",
    "idempotency_key_retiro_adopcion_en_conflicto": "El mismo retiro fue enviado antes con datos diferentes.",
    "idempotency_key_informacion_adopcion_en_conflicto": "La misma petición de información fue enviada antes con datos diferentes.",
    "idempotency_key_seleccion_adopcion_en_conflicto": "La misma selección fue utilizada antes para otra solicitud.",
    "idempotency_key_rechazo_adopcion_en_conflicto": "El mismo rechazo fue enviado antes con datos diferentes.",
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
    # 1. Si el voluntario mandó una foto nueva para aclarar, reemplazamos la anterior
    if body.nueva_foto_path:
        try:
            supabase_admin.table("solicitudes_ingreso_adopcion").update({
                "fotos_propuesta_paths": [body.nueva_foto_path]
            }).eq("id", request_id).execute()
        except Exception:
            logger.warning("No se pudo reemplazar la foto de la propuesta de adopción")

    # 2. Registramos el texto de la respuesta y cambiamos el estado
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
    # 1. Agregamos "fotos_propuesta_paths" al select
    solicitud = _query(
        "obtener_solicitud_base",
        lambda: supabase_admin.table("solicitudes_ingreso_adopcion")
        .select("custodia_id, propuesto_por_usuario_id, reporte_id, fotos_propuesta_paths") 
        .eq("id", request_id)
        .limit(1)
    )

    resultado = _rpc(
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

    # --- NUEVO: Copiar fotos de la propuesta al nuevo perfil ---
    if body.decision == "aprobar" and solicitud and solicitud[0].get("fotos_propuesta_paths"):
        try:
            perfiles = supabase_admin.table("perfiles_adopcion").select("id").eq("solicitud_ingreso_id", request_id).execute()
            if perfiles.data:
                perfil_id = perfiles.data[0]["id"]
                fotos_insert = []
                for i, path in enumerate(solicitud[0]["fotos_propuesta_paths"]):
                    fotos_insert.append({
                        "perfil_adopcion_id": perfil_id,
                        "storage_path": path,
                        "orden": i + 1,
                        "aprobada_publicacion": False
                    })
                if fotos_insert:
                    supabase_admin.table("fotos_perfil_adopcion").insert(fotos_insert).execute()
        except Exception as e:
            logger.warning(f"No se pudieron copiar las fotos al perfil: {e}")

    # 2. (El resto del código de notificaciones se queda igual...)
    if solicitud and body.decision == "solicitar_informacion":
        from datetime import datetime, timezone
        try:
            # Notificación en el dashboard de Custodia
            supabase_admin.table("notificaciones_custodia").insert({
                "custodia_id": solicitud[0]["custodia_id"],
                "usuario_id": solicitud[0]["propuesto_por_usuario_id"],
                "tipo": "aclaracion_adopcion",
                "mensaje": f"La asociación necesita más información sobre tu propuesta de adopción: {body.motivo}",
                "leida": False,
                "creada_at": datetime.now(timezone.utc).isoformat()
            }).execute()

            # NUEVO: Notificación en la campanita general (NotificacionesScreen)
            supabase_admin.table("notificaciones_moderacion").insert({
                "usuario_id": solicitud[0]["propuesto_por_usuario_id"],
                "reporte_id": solicitud[0]["reporte_id"],
                "tipo": "aclaracion_adopcion",
                "mensaje": "La asociación solicitó más información sobre tu propuesta de adopción.",
                "leida": False
            }).execute()
        except Exception:
            logger.warning("No se pudo crear la notificación de aclaración de adopción")

    return resultado

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

def marcar_perfil_adoptado(
    profile_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionProfileMarkAdopted,
) -> dict:
    perfil = _obtener_perfil_asociacion(profile_id, association_id)
    if perfil.get("estado") == "adoptado":
        return perfil

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    
    try:
        # 1. Actualizamos el estado del perfil
        response = supabase_admin.table("perfiles_adopcion").update({
            "estado": "adoptado",
            "adoptado_at": now,
            "actualizado_at": now
        }).eq("id", profile_id).eq("asociacion_id", association_id).execute()

        if not response.data:
            raise AdoptionServiceError("perfil_adopcion_no_encontrado")
            
        # 2. Registramos el movimiento en el historial
        supabase_admin.table("historial_adopcion").insert({
            "asociacion_id": association_id,
            "perfil_adopcion_id": profile_id,
            "actor_usuario_id": actor_user_id,
            "tipo_evento": "marcado_adoptado_directamente",
            "estado_anterior": perfil.get("estado"),
            "estado_nuevo": "adoptado",
            "idempotency_key": body.idempotency_key,
        }).execute()
            
        return response.data[0]
    except Exception as error:
        logger.exception("Fallo al marcar adopción como adoptada")
        raise AdoptionServiceError("adopcion_operacion_no_disponible") from error
    
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
        # --- AÑADIDO: Ocultar las aprobadas o rechazadas de la bandeja ---
        .in_("estado", ["pendiente", "en_revision", "requiere_informacion", "solicitando_informacion"])
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


def _asegurar_asociacion_operativa(association_id: str) -> None:
    associations = _query(
        "validar asociación para requisitos de adopción",
        lambda: supabase_admin.table("asociaciones")
        .select("id, activo, verificado")
        .eq("id", association_id)
        .eq("activo", True)
        .eq("verificado", True)
        .limit(1),
    )
    if (
        not associations
        or associations[0].get("activo") is not True
        or associations[0].get("verificado") is not True
    ):
        raise AdoptionServiceError("asociacion_no_operativa")


def _serializar_requisito(row: dict, origin: str) -> dict:
    return {
        "origen": origin,
        "clave": row["clave"],
        "titulo": row["titulo"],
        "descripcion": row.get("descripcion"),
        "tipo_respuesta": row["tipo_respuesta"],
        "opciones": row.get("opciones") or [],
        "obligatorio": row.get("obligatorio", False),
        "es_sensible": row.get("es_sensible", False),
        "orden": row["orden"],
    }


def _listar_requisitos_base(version: str) -> list[dict]:
    requirements = _query(
        "listar requisitos base de adopción",
        lambda: supabase_admin.table("requisitos_base_adopcion")
        .select(
            "clave, titulo, descripcion, tipo_respuesta, opciones, "
            "obligatorio, es_sensible, orden, activo"
        )
        .eq("version", version)
        .eq("activo", True)
        .order("orden"),
    )
    active_requirements = [
        _serializar_requisito(requirement, "pawalert")
        for requirement in requirements
        if requirement.get("activo") is True
    ]
    if not active_requirements:
        raise AdoptionServiceError("requisitos_base_adopcion_no_disponibles")
    return active_requirements


def _preguntas_de_plantillas(template_ids: list[str]) -> dict[str, list[dict]]:
    grouped = {template_id: [] for template_id in template_ids}
    if not template_ids:
        return grouped
    questions = _query(
        "listar preguntas de plantillas de adopción",
        lambda: supabase_admin.table("preguntas_requisito_adopcion")
        .select(
            "plantilla_id, clave, titulo, descripcion, tipo_respuesta, "
            "opciones, obligatorio, es_sensible, orden"
        )
        .in_("plantilla_id", template_ids)
        .order("orden"),
    )
    for question in questions:
        template_id = question.get("plantilla_id")
        if template_id in grouped:
            grouped[template_id].append(
                _serializar_requisito(question, "asociacion")
            )
    for template_questions in grouped.values():
        template_questions.sort(key=lambda question: question["orden"])
    return grouped


def _validar_claves_personalizadas(body: AdoptionRequirementTemplateWrite) -> None:
    base_keys = {
        requirement["clave"]
        for requirement in _listar_requisitos_base("pawalert-v1")
    }
    if any(question.clave in base_keys for question in body.preguntas):
        raise AdoptionServiceError("clave_requisito_adopcion_reservada")


def listar_plantillas_requisitos(association_id: str) -> dict:
    _asegurar_asociacion_operativa(association_id)
    base_requirements = _listar_requisitos_base("pawalert-v1")
    templates = _query(
        "listar plantillas de requisitos de asociación",
        lambda: supabase_admin.table("plantillas_requisitos_adopcion")
        .select(
            "id, version, nombre, descripcion, requisitos_base_version, "
            "estado, activada_at, retirada_at, creada_at, actualizada_at"
        )
        .eq("asociacion_id", association_id)
        .order("version", desc=True),
    )
    questions = _preguntas_de_plantillas(
        [template["id"] for template in templates]
    )
    return {
        "requisitos_base": base_requirements,
        "plantillas": [
            {
                "id": template["id"],
                "version": template["version"],
                "nombre": template["nombre"],
                "descripcion": template.get("descripcion"),
                "requisitos_base_version": template[
                    "requisitos_base_version"
                ],
                "estado": template["estado"],
                "activada_at": template.get("activada_at"),
                "retirada_at": template.get("retirada_at"),
                "creada_at": template["creada_at"],
                "actualizada_at": template["actualizada_at"],
                "preguntas": questions.get(template["id"], []),
            }
            for template in templates
        ],
    }


def crear_plantilla_requisitos(
    association_id: str,
    actor_user_id: str,
    body: AdoptionRequirementTemplateWrite,
) -> dict:
    _validar_claves_personalizadas(body)
    return _rpc(
        "crear_plantilla_requisitos_adopcion",
        {
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_nombre": body.nombre,
            "p_descripcion": body.descripcion,
            "p_preguntas": [
                question.model_dump(mode="json")
                for question in body.preguntas
            ],
            "p_idempotency_key": body.idempotency_key,
        },
    )


def actualizar_plantilla_requisitos(
    template_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionRequirementTemplateWrite,
) -> dict:
    _validar_claves_personalizadas(body)
    return _rpc(
        "actualizar_plantilla_requisitos_adopcion",
        {
            "p_plantilla_id": template_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_nombre": body.nombre,
            "p_descripcion": body.descripcion,
            "p_preguntas": [
                question.model_dump(mode="json")
                for question in body.preguntas
            ],
            "p_idempotency_key": body.idempotency_key,
        },
    )


def activar_plantilla_requisitos(
    template_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionRequirementTemplateAction,
) -> dict:
    return _rpc(
        "activar_plantilla_requisitos_adopcion",
        {
            "p_plantilla_id": template_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def retirar_plantilla_requisitos(
    template_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionRequirementTemplateRetire,
) -> dict:
    return _rpc(
        "retirar_plantilla_requisitos_adopcion",
        {
            "p_plantilla_id": template_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def crear_borrador_solicitud(
    profile_id: str,
    actor_user_id: str,
    body: AdoptionApplicationDraftCreate,
) -> dict:
    return _rpc(
        "crear_borrador_solicitud_adopcion",
        {
            "p_perfil_adopcion_id": profile_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def actualizar_respuestas_solicitud(
    application_id: str,
    actor_user_id: str,
    body: AdoptionApplicationDraftUpdate,
) -> dict:
    answers = []
    for answer in body.respuestas:
        if answer.eliminar:
            answers.append({"clave": answer.clave, "eliminar": True})
        else:
            answers.append({"clave": answer.clave, "valor": answer.valor})
    return _rpc(
        "actualizar_respuestas_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_actor_usuario_id": actor_user_id,
            "p_respuestas": answers,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def enviar_solicitud(
    application_id: str,
    actor_user_id: str,
    body: AdoptionApplicationAction,
) -> dict:
    return _rpc(
        "enviar_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def retirar_solicitud(
    application_id: str,
    actor_user_id: str,
    body: AdoptionApplicationWithdraw,
) -> dict:
    return _rpc(
        "retirar_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo": body.motivo,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def _obtener_solicitud_propia(
    application_id: str,
    actor_user_id: str,
    *,
    editable: bool,
) -> dict:
    applications = _query(
        "validar solicitud de adopción propia",
        lambda: supabase_admin.table("solicitudes_adopcion")
        .select("id, estado, requisitos_snapshot")
        .eq("id", application_id)
        .eq("solicitante_usuario_id", actor_user_id)
        .limit(1),
    )
    if not applications:
        raise AdoptionServiceError("solicitud_adopcion_no_encontrada")
    application = applications[0]
    if editable and application.get("estado") not in (
        "borrador",
        "requiere_informacion",
    ):
        raise AdoptionServiceError("solicitud_adopcion_respuestas_no_editables")
    return application


def _pregunta_documental_propia(application: dict, question_key: str) -> dict:
    requirements = application.get("requisitos_snapshot")
    if not isinstance(requirements, list):
        raise AdoptionServiceError("adopcion_respuesta_invalida")
    for requirement in requirements:
        if (
            isinstance(requirement, dict)
            and requirement.get("clave") == question_key
            and requirement.get("tipo_respuesta") == "documento"
            and requirement.get("es_sensible") is True
        ):
            return requirement
    raise AdoptionServiceError("documento_solicitud_adopcion_invalido")


def _procesar_documento_solicitud(
    content: bytes,
    declared_content_type: str | None,
) -> tuple[bytes, str, str]:
    content_type = (declared_content_type or "").split(";", 1)[0].lower()
    if content_type in {"image/jpeg", "image/png", "image/webp"}:
        try:
            processed = procesar_imagen_evidencia(content)
        except ImagenEvidenciaInvalida as error:
            raise AdoptionServiceError(
                "documento_solicitud_adopcion_invalido"
            ) from error
        return (
            processed.contenido_publico,
            processed.content_type_publico,
            processed.extension_publica,
        )
    if (
        content_type == "application/pdf"
        and content.startswith(b"%PDF-")
        and b"%%EOF" in content[-2048:]
    ):
        return content, "application/pdf", "pdf"
    raise AdoptionServiceError("documento_solicitud_adopcion_invalido")


async def subir_documento_solicitud(
    application_id: str,
    actor_user_id: str,
    document: UploadFile,
    *,
    question_key: str,
    idempotency_key: str,
) -> dict:
    question_key = question_key.strip()
    idempotency_key = idempotency_key.strip()
    if (
        not question_key
        or len(question_key) > 80
        or not question_key.isascii()
        or any(
            not (character.islower() or character.isdigit() or character == "_")
            for character in question_key
        )
        or len(idempotency_key) < 8
        or len(idempotency_key) > 200
    ):
        raise AdoptionServiceError("documento_solicitud_adopcion_invalido")
    application = _obtener_solicitud_propia(
        application_id,
        actor_user_id,
        editable=True,
    )
    _pregunta_documental_propia(application, question_key)

    raw_content = await document.read(MAX_ADOPTION_DOCUMENT_BYTES + 1)
    if not raw_content or len(raw_content) > MAX_ADOPTION_DOCUMENT_BYTES:
        raise AdoptionServiceError("documento_solicitud_adopcion_invalido")
    content, content_type, extension = _procesar_documento_solicitud(
        raw_content,
        document.content_type,
    )
    if len(content) > MAX_ADOPTION_DOCUMENT_BYTES:
        raise AdoptionServiceError("documento_solicitud_adopcion_invalido")

    digest = sha256()
    digest.update(application_id.encode("utf-8"))
    digest.update(actor_user_id.encode("utf-8"))
    digest.update(question_key.encode("utf-8"))
    digest.update(idempotency_key.encode("utf-8"))
    digest.update(content)
    filename = f"{digest.hexdigest()}.{extension}"
    folder = f"adopciones/solicitudes/{application_id}"
    storage_path = f"{folder}/{filename}"
    uploaded_now = False
    try:
        storage_path = await subir_bytes_adopcion(
            content,
            carpeta=folder,
            content_type=content_type,
            extension=extension,
            nombre_archivo=filename,
        )
        uploaded_now = True
    except ObjetoPrivadoYaExiste:
        pass
    except Exception as error:
        logger.exception("No se pudo cargar un documento de adopción")
        raise AdoptionServiceError(
            "adopcion_documento_storage_no_disponible"
        ) from error

    try:
        result = _rpc(
            "actualizar_respuestas_solicitud_adopcion",
            {
                "p_solicitud_adopcion_id": application_id,
                "p_actor_usuario_id": actor_user_id,
                "p_respuestas": [
                    {
                        "clave": question_key,
                        "documento": {
                            "storage_path": storage_path,
                            "mime_type": content_type,
                            "size_bytes": len(content),
                        },
                    }
                ],
                "p_idempotency_key": idempotency_key,
            },
        )
    except AdoptionServiceError as error:
        if uploaded_now and error.status_code < 500:
            eliminar_objeto_adopcion(storage_path)
        raise

    try:
        access = crear_url_firmada_adopcion(storage_path)
    except Exception:
        logger.warning(
            "El documento se guardó pero no pudo firmarse temporalmente",
            exc_info=True,
        )
        access = None
    return {
        **result,
        "clave": question_key,
        "documento": {
            "mime_type": content_type,
            "size_bytes": len(content),
            "documento_url": access["url"] if access else None,
            "documento_url_expira_at": access["expira_at"] if access else None,
        },
    }


def _requisitos_snapshot_publicables(snapshot: object) -> list[dict]:
    if not isinstance(snapshot, list):
        raise AdoptionServiceError("adopcion_respuesta_invalida")
    requirements = []
    allowed_origins = {"pawalert", "asociacion"}
    for requirement in snapshot:
        if (
            not isinstance(requirement, dict)
            or requirement.get("origen") not in allowed_origins
            or not requirement.get("clave")
            or not requirement.get("titulo")
        ):
            raise AdoptionServiceError("adopcion_respuesta_invalida")
        requirements.append(
            {
                "origen": requirement["origen"],
                "clave": requirement["clave"],
                "titulo": requirement["titulo"],
                "descripcion": requirement.get("descripcion"),
                "tipo_respuesta": requirement["tipo_respuesta"],
                "opciones": requirement.get("opciones") or [],
                "obligatorio": requirement.get("obligatorio", False),
                "es_sensible": requirement.get("es_sensible", False),
                "orden": requirement["orden"],
            }
        )
    return requirements


def _respuestas_solicitudes(
    application_ids: list[str],
) -> dict[str, list[dict]]:
    grouped = {application_id: [] for application_id in application_ids}
    if not application_ids:
        return grouped
    answers = _query(
        "listar respuestas de solicitudes de adopción",
        lambda: supabase_admin.table("respuestas_solicitud_adopcion")
        .select(
            "solicitud_adopcion_id, pregunta_clave_snapshot, respuesta_json, "
            "documento_storage_path, documento_mime_type, documento_size_bytes"
        )
        .in_("solicitud_adopcion_id", application_ids)
        .order("creada_at"),
    )
    for answer in answers:
        application_id = answer.get("solicitud_adopcion_id")
        if application_id not in grouped:
            continue
        document = None
        storage_path = answer.get("documento_storage_path")
        if storage_path:
            expected_folder = (
                f"adopciones/solicitudes/{application_id}/"
            )
            if (
                not storage_path.startswith(expected_folder)
                or ".." in storage_path.split("/")
            ):
                logger.error(
                    "Ruta documental fuera de la solicitud %s",
                    application_id,
                )
                access = None
            else:
                try:
                    access = crear_url_firmada_adopcion(storage_path)
                except Exception:
                    logger.warning(
                        "No se pudo firmar un documento privado de adopción",
                        exc_info=True,
                    )
                    access = None
            document = {
                "mime_type": answer["documento_mime_type"],
                "size_bytes": answer["documento_size_bytes"],
                "documento_url": access["url"] if access else None,
                "documento_url_expira_at": (
                    access["expira_at"] if access else None
                ),
            }
        grouped[application_id].append(
            {
                "clave": answer["pregunta_clave_snapshot"],
                "valor": answer.get("respuesta_json"),
                "documento": document,
            }
        )
    return grouped


def listar_mis_solicitudes(actor_user_id: str) -> list[dict]:
    applications = _query(
        "listar solicitudes propias de adopción",
        lambda: supabase_admin.table("solicitudes_adopcion")
        .select(
            "id, perfil_adopcion_id, asociacion_id, requisitos_snapshot, "
            "estado, informacion_solicitada, informacion_solicitada_at, "
            "entrevista_programada_at, entrevista_modalidad, "
            "entrevista_detalle_privado, categoria_rechazo_publica, "
            "enviada_at, retirada_at, vencimiento_at, creada_at, actualizada_at"
        )
        .eq("solicitante_usuario_id", actor_user_id)
        .order("actualizada_at", desc=True),
    )
    if not applications:
        return []
    application_ids = [application["id"] for application in applications]
    profile_ids = sorted(
        {application["perfil_adopcion_id"] for application in applications}
    )
    association_ids = sorted(
        {application["asociacion_id"] for application in applications}
    )
    profiles = _query(
        "resolver perfiles de solicitudes propias",
        lambda: supabase_admin.table("perfiles_adopcion")
        .select("id, nombre_publico, estado, zona_general")
        .in_("id", profile_ids),
    )
    associations = _query(
        "resolver asociaciones de solicitudes propias",
        lambda: supabase_admin.table("asociaciones")
        .select("id, nombre, acerca_de, logo_url")
        .in_("id", association_ids),
    )
    profiles_by_id = {profile["id"]: profile for profile in profiles}
    associations_by_id = {
        association["id"]: association for association in associations
    }
    answers = _respuestas_solicitudes(application_ids)
    photos = _fotos_publicas(profile_ids, solo_portada=True)
    result = []
    for application in applications:
        profile = profiles_by_id.get(application["perfil_adopcion_id"])
        association = associations_by_id.get(application["asociacion_id"])
        if not profile or not association:
            raise AdoptionServiceError("adopcion_respuesta_invalida")
        profile_photos = photos.get(profile["id"], [])
        result.append(
            {
                "id": application["id"],
                "estado": application["estado"],
                "perfil": {
                    "id": profile["id"],
                    "nombre_publico": profile["nombre_publico"],
                    "estado": profile["estado"],
                    "zona_general": profile.get("zona_general"),
                    "asociacion": {
                        "id": association["id"],
                        "nombre": association["nombre"],
                        "acerca_de": association.get("acerca_de"),
                        "logo_url": association.get("logo_url"),
                    },
                    "foto_portada": (
                        profile_photos[0] if profile_photos else None
                    ),
                },
                "requisitos": _requisitos_snapshot_publicables(
                    application.get("requisitos_snapshot")
                ),
                "respuestas": answers.get(application["id"], []),
                "informacion_solicitada": application.get(
                    "informacion_solicitada"
                ),
                "informacion_solicitada_at": application.get(
                    "informacion_solicitada_at"
                ),
                "entrevista_programada_at": application.get(
                    "entrevista_programada_at"
                ),
                "entrevista_modalidad": application.get(
                    "entrevista_modalidad"
                ),
                "entrevista_detalle_privado": application.get(
                    "entrevista_detalle_privado"
                ),
                "categoria_rechazo_publica": application.get(
                    "categoria_rechazo_publica"
                ),
                "enviada_at": application.get("enviada_at"),
                "retirada_at": application.get("retirada_at"),
                "vencimiento_at": application.get("vencimiento_at"),
                "creada_at": application["creada_at"],
                "actualizada_at": application["actualizada_at"],
            }
        )
    return result


def listar_solicitudes_asociacion(
    profile_id: str,
    association_id: str,
    *,
    state: str | None,
) -> list[dict]:
    allowed_states = {
        "enviada",
        "requiere_informacion",
        "en_evaluacion",
        "entrevista_programada",
        "seleccionada",
        "rechazada",
        "retirada",
        "vencida",
        "cerrada_por_adopcion",
        "adopcion_confirmada",
    }
    if state is not None and state not in allowed_states:
        raise AdoptionServiceError("adopcion_respuesta_invalida", 422)

    associations = _query(
        "validar asociación para revisar solicitudes de adopción",
        lambda: supabase_admin.table("asociaciones")
        .select("id, activo, verificado")
        .eq("id", association_id)
        .limit(1),
    )
    if (
        not associations
        or associations[0].get("activo") is not True
        or associations[0].get("verificado") is not True
    ):
        raise AdoptionServiceError("asociacion_no_operativa")

    profiles = _query(
        "validar perfil de adopción de la asociación",
        lambda: supabase_admin.table("perfiles_adopcion")
        .select("id, nombre_publico, estado")
        .eq("id", profile_id)
        .eq("asociacion_id", association_id)
        .limit(1),
    )
    if not profiles:
        raise AdoptionServiceError("perfil_adopcion_no_encontrado")
    profile = profiles[0]

    def application_query():
        query = (
            supabase_admin.table("solicitudes_adopcion")
            .select(
                "id, perfil_adopcion_id, solicitante_usuario_id, "
                "requisitos_snapshot, estado, informacion_solicitada, "
                "informacion_solicitada_at, entrevista_programada_at, "
                "entrevista_modalidad, entrevista_detalle_privado, "
                "seleccionada_at, motivo_rechazo_interno, "
                "categoria_rechazo_publica, rechazada_at, enviada_at, "
                "retirada_at, vencimiento_at, creada_at, actualizada_at"
            )
            .eq("perfil_adopcion_id", profile_id)
            .eq("asociacion_id", association_id)
            .neq("estado", "borrador")
        )
        if state is not None:
            query = query.eq("estado", state)
        return query.order("actualizada_at", desc=True)

    applications = _query(
        "listar solicitudes de adopción de la asociación",
        application_query,
    )
    if not applications:
        return []

    application_ids = [application["id"] for application in applications]
    applicant_ids = sorted(
        {
            application["solicitante_usuario_id"]
            for application in applications
        }
    )
    applicants = _query(
        "resolver solicitantes de adopción para la asociación",
        lambda: supabase_admin.table("usuarios")
        .select(
            "id, nombre, apellido_paterno, apellido_materno, email, telefono"
        )
        .in_("id", applicant_ids),
    )
    applicants_by_id = {
        applicant["id"]: applicant for applicant in applicants
    }
    answers = _respuestas_solicitudes(application_ids)
    result = []
    for application in applications:
        applicant = applicants_by_id.get(
            application["solicitante_usuario_id"]
        )
        if not applicant or not applicant.get("nombre"):
            raise AdoptionServiceError("adopcion_respuesta_invalida")
        result.append(
            {
                "id": application["id"],
                "estado": application["estado"],
                "perfil": {
                    "id": profile["id"],
                    "nombre_publico": profile["nombre_publico"],
                    "estado": profile["estado"],
                },
                "solicitante": {
                    "id": applicant["id"],
                    "nombre": applicant["nombre"],
                    "apellido_paterno": applicant.get("apellido_paterno"),
                    "apellido_materno": applicant.get("apellido_materno"),
                    "email": applicant.get("email"),
                    "telefono": applicant.get("telefono"),
                },
                "requisitos": _requisitos_snapshot_publicables(
                    application.get("requisitos_snapshot")
                ),
                "respuestas": answers.get(application["id"], []),
                "informacion_solicitada": application.get(
                    "informacion_solicitada"
                ),
                "informacion_solicitada_at": application.get(
                    "informacion_solicitada_at"
                ),
                "entrevista_programada_at": application.get(
                    "entrevista_programada_at"
                ),
                "entrevista_modalidad": application.get(
                    "entrevista_modalidad"
                ),
                "entrevista_detalle_privado": application.get(
                    "entrevista_detalle_privado"
                ),
                "seleccionada_at": application.get("seleccionada_at"),
                "motivo_rechazo_interno": application.get(
                    "motivo_rechazo_interno"
                ),
                "categoria_rechazo_publica": application.get(
                    "categoria_rechazo_publica"
                ),
                "rechazada_at": application.get("rechazada_at"),
                "enviada_at": application["enviada_at"],
                "retirada_at": application.get("retirada_at"),
                "vencimiento_at": application.get("vencimiento_at"),
                "creada_at": application["creada_at"],
                "actualizada_at": application["actualizada_at"],
            }
        )
    return result


def solicitar_informacion_solicitud(
    application_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionApplicationRequestInformation,
) -> dict:
    return _rpc(
        "solicitar_informacion_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_informacion_solicitada": body.informacion_solicitada,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def seleccionar_solicitud(
    application_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionApplicationAction,
) -> dict:
    return _rpc(
        "seleccionar_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_idempotency_key": body.idempotency_key,
        },
    )


def rechazar_solicitud(
    application_id: str,
    association_id: str,
    actor_user_id: str,
    body: AdoptionApplicationReject,
) -> dict:
    return _rpc(
        "rechazar_solicitud_adopcion",
        {
            "p_solicitud_adopcion_id": application_id,
            "p_asociacion_id": association_id,
            "p_actor_usuario_id": actor_user_id,
            "p_motivo_interno": body.motivo_interno,
            "p_categoria_publica": body.categoria_publica,
            "p_idempotency_key": body.idempotency_key,
        },
    )


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
            .select("id, nombre, acerca_de, logo_url, contacto_email, contacto_telefono, activo, verificado, latitud, longitud")
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
                "email": row.get("contacto_email"),
                "telefono": row.get("contacto_telefono"),
                "latitud": row.get("latitud"),
                "longitud": row.get("longitud"),
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


def _consultar_perfiles_publicos(profile_id: str | None = None, asociacion_id: str | None = None) -> list[dict]:
    def query():
        result = (
            supabase_admin.table("perfiles_adopcion")
            .select(PUBLIC_PROFILE_FIELDS)
            .eq("estado", "publicado")
            .eq("estado_moderacion", "visible")
        )
        if profile_id:
            result = result.eq("id", profile_id).limit(1)
        if asociacion_id:
            result = result.eq("asociacion_id", asociacion_id)
        if not profile_id:
            result = result.order("publicado_at", desc=True).order(
                "id", desc=True
            )
        return result

    return _query("listar adopciones públicas", query)


def _requisitos_perfil_publico(profile: dict) -> list[dict]:
    base_version = profile.get("requisitos_base_version")
    if not base_version:
        raise AdoptionServiceError("requisitos_base_adopcion_no_disponibles")
    requirements = _listar_requisitos_base(base_version)
    template_id = profile.get("plantilla_requisitos_id")
    if not template_id:
        return requirements

    templates = _query(
        "validar plantilla versionada del perfil público",
        lambda: supabase_admin.table("plantillas_requisitos_adopcion")
        .select("id")
        .eq("id", template_id)
        .eq("asociacion_id", profile["asociacion_id"])
        .eq("version", profile["plantilla_version"])
        .limit(1),
    )
    if not templates:
        raise AdoptionServiceError("requisitos_base_adopcion_no_disponibles")
    return requirements + _preguntas_de_plantillas([template_id])[template_id]


def listar_adopciones_publicas(
    *,
    especie: str | None,
    tamanio: str | None,
    edad: str | None,
    zona: str | None,
    compatible_con: str | None,
    asociacion_id: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    pagina: int,
    limite: int,
) -> dict:
    profiles = _consultar_perfiles_publicos(asociacion_id=asociacion_id)
    associations, catalogs = _contexto_publico_perfiles(profiles)
    species_filter = _normalizar_filtro_publico(especie)
    size_filter = _normalizar_filtro_publico(tamanio)
    zone_filter = _normalizar_filtro_publico(zona)
    public_profiles: list[dict] = []

    # Fórmula de Haversine para distancia en KM
    def calcular_distancia(lat1, lon1, lat2, lon2):
        if None in (lat1, lon1, lat2, lon2): return float('inf')
        R = 6371.0
        dlat = math.radians(float(lat2) - float(lat1))
        dlon = math.radians(float(lon2) - float(lon1))
        a = math.sin(dlat / 2)**2 + math.cos(math.radians(float(lat1))) * math.cos(math.radians(float(lat2))) * math.sin(dlon / 2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    for profile in profiles:
        if profile.get("estado") != "publicado" or profile.get("estado_moderacion") != "visible":
            continue
        association = associations.get(profile.get("asociacion_id"))
        if not association:
            continue
        shaped = _serializar_perfil_publico(profile, association, catalogs)
        if not shaped:
            continue
            
        # Filtros
        if species_filter and _normalizar_filtro_publico(shaped["tipo_animal"]["clave"]) != species_filter: continue
        if size_filter and _normalizar_filtro_publico(shaped["tamanio"]["clave"]) != size_filter: continue
        if edad and shaped["edad_aproximada"] != edad: continue
        if zone_filter and zone_filter not in _normalizar_filtro_publico(shaped["zona_general"]): continue
        if not _perfil_coincide_compatibilidad(profile, compatible_con): continue
        
        # Calcular distancia si se enviaron coordenadas
        shaped["distancia_km"] = calcular_distancia(lat, lng, association.get("latitud"), association.get("longitud"))
        public_profiles.append(shaped)

    # Ordenar primero por fecha (por defecto)
    public_profiles.sort(key=lambda p: (p["publicado_at"], p["id"]), reverse=True)
    
    # Si hay coordenadas, ordenar por distancia (los más cercanos primero)
    if lat is not None and lng is not None:
        public_profiles.sort(key=lambda p: p.get("distancia_km", float('inf')))

    total = len(public_profiles)
    start = (pagina - 1) * limite
    page_items = public_profiles[start : start + limite]
    photos = _fotos_publicas([profile["id"] for profile in page_items], solo_portada=True)
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
    requirements = _requisitos_perfil_publico(profile)
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
            "requisitos": requirements,
        }
    )
    return shaped
