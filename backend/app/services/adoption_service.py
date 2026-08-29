from __future__ import annotations

import logging
from typing import Callable

from app.db.supabase import supabase_admin
from app.models.adoption import (
    AdoptionIntakeCancel,
    AdoptionIntakeClarification,
    AdoptionIntakeCreate,
    AdoptionIntakeResolve,
    AdoptionProfilePause,
    AdoptionProfilePublish,
    FormalAdoptionProfileCreate,
)


logger = logging.getLogger(__name__)


ERROR_STATUS = {
    "actor_no_encontrado": 404,
    "custodia_no_encontrada": 404,
    "solicitud_ingreso_no_encontrada": 404,
    "animal_no_pertenece_custodia": 404,
    "animal_ingreso_no_encontrado": 404,
    "perfil_adopcion_no_encontrado": 404,
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
    "idempotency_key_ingreso_en_conflicto": 409,
    "idempotency_key_aclaracion_en_conflicto": 409,
    "idempotency_key_cancelacion_en_conflicto": 409,
    "idempotency_key_resolucion_en_conflicto": 409,
    "idempotency_key_perfil_formal_en_conflicto": 409,
    "idempotency_key_publicacion_en_conflicto": 409,
    "idempotency_key_pausa_en_conflicto": 409,
    "individuo_animal_invalido": 422,
    "fecha_disponibilidad_custodia_invalida": 422,
    "fotos_propuesta_invalidas": 422,
    "perfil_adopcion_datos_publicacion_incompletos": 422,
    "perfil_adopcion_sin_foto_aprobada": 422,
    "revision_publicacion_incompleta": 422,
    "requisitos_base_adopcion_no_disponibles": 503,
}


ERROR_DETAIL = {
    "actor_no_encontrado": "La cuenta ya no está disponible.",
    "custodia_no_encontrada": "No se encontró una custodia propia con ese identificador.",
    "solicitud_ingreso_no_encontrada": "No se encontró la propuesta de adopción.",
    "animal_no_pertenece_custodia": "El animal seleccionado no pertenece a esta custodia.",
    "animal_ingreso_no_encontrado": "El animal de la propuesta ya no está disponible.",
    "perfil_adopcion_no_encontrado": "No se encontró el perfil dentro de tu asociación.",
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
    "individuo_animal_invalido": "Selecciona correctamente al animal de la ficha grupal.",
    "fecha_disponibilidad_custodia_invalida": "La disponibilidad del hogar temporal debe terminar en una fecha futura.",
    "fotos_propuesta_invalidas": "Adjunta entre una y cinco fotografías privadas válidas.",
    "perfil_adopcion_datos_publicacion_incompletos": "Completa los datos públicos del animal antes de publicar.",
    "perfil_adopcion_sin_foto_aprobada": "Aprueba al menos una fotografía antes de publicar.",
    "revision_publicacion_incompleta": "Confirma la revisión médica y jurídica antes de publicar.",
    "requisitos_base_adopcion_no_disponibles": "Los requisitos de adopción no están disponibles temporalmente.",
    "idempotency_key_ingreso_en_conflicto": "La misma operación fue enviada antes con datos diferentes.",
    "idempotency_key_aclaracion_en_conflicto": "La misma aclaración fue enviada antes con datos diferentes.",
    "idempotency_key_cancelacion_en_conflicto": "La misma cancelación fue enviada antes con datos diferentes.",
    "idempotency_key_resolucion_en_conflicto": "La misma resolución fue enviada antes con datos diferentes.",
    "idempotency_key_perfil_formal_en_conflicto": "El mismo alta formal fue enviada antes con datos diferentes.",
    "idempotency_key_publicacion_en_conflicto": "La misma publicación fue enviada antes para otro perfil.",
    "idempotency_key_pausa_en_conflicto": "La misma pausa fue enviada antes con datos diferentes.",
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
    return requests[0]


def listar_ingresos_asociacion(association_id: str) -> list[dict]:
    return _query(
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


def listar_perfiles_asociacion(association_id: str) -> list[dict]:
    return _query(
        "listar perfiles de asociación",
        lambda: supabase_admin.table("perfiles_adopcion")
        .select(
            "id, solicitud_ingreso_id, origen, custodia_id, reporte_id, animal_id, "
            "origen_individuo, nombre_publico, tipo_animal_id, tipo_animal_otro_id, "
            "tamanio_id, raza_id, sexo, edad_aproximada, descripcion, personalidad, "
            "salud_conocida, tratamientos, necesidades_especiales, vacunacion_estado, "
            "esterilizacion_estado, revision_medica_estado, compatibilidad, zona_general, "
            "estado, estado_moderacion, publicado_at, pausado_at, creado_at, actualizado_at"
        )
        .eq("asociacion_id", association_id)
        .order("actualizado_at", desc=True),
    )
