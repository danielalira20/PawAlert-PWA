import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings
from app.db.supabase import supabase_admin
from app.services.push_notification_service import queue_and_send_push
from app.services.revision_manual_service import (
    AtencionEnCursoError,
    RevisionManualError,
    transicionar_a_revision_manual,
)
from app.services.whatsapp_notification_service import (
    encolar_notificacion,
    normalizar_telefono_whatsapp,
    procesar_notificacion,
)

logger = logging.getLogger(__name__)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _crear_solicitud(reporte: dict[str, Any]) -> bool:
    reporte_id = reporte["reporte_id"]
    usuario_id = reporte.get("usuario_id")
    ahora = _ahora()
    solicitada_at = ahora.isoformat()
    deadline_at = (ahora + timedelta(hours=2)).isoformat()

    actualizacion = (
        supabase_admin.table("reportes")
        .update(
            {
                "confirmacion_permanencia_solicitada_at": solicitada_at,
                "confirmacion_permanencia_deadline_at": deadline_at,
                "confirmacion_permanencia_respuesta": None,
                "confirmacion_permanencia_respondida_at": None,
            }
        )
        .eq("id", reporte_id)
        .is_("confirmacion_permanencia_solicitada_at", "null")
        .execute()
    )
    if not actualizacion.data:
        return False

    if usuario_id:
        queue_and_send_push(
            usuario_id=usuario_id,
            tipo_evento="confirmacion_permanencia_solicitada",
            idempotency_key=f"permanencia:{reporte_id}:{solicitada_at}",
            payload={
                "mensaje": (
                    "¿El animalito sigue ahí? Confírmanos para mantener "
                    "activo tu reporte."
                ),
                "reporte_id": reporte_id,
            },
            reporte_id=reporte_id,
        )
        return True

    telefono = normalizar_telefono_whatsapp(reporte.get("reportante_telefono"))
    if not telefono:
        logger.warning(
            "No se pudo entregar confirmación de permanencia al invitado del reporte %s",
            reporte_id,
        )
        return True

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    supabase_admin.table("tokens_confirmacion_permanencia").update(
        {"usado": True}
    ).eq("reporte_id", reporte_id).eq("usado", False).execute()
    token_creado = supabase_admin.table("tokens_confirmacion_permanencia").insert(
        {
            "token_hash": token_hash,
            "reporte_id": reporte_id,
            "expira_at": deadline_at,
        }
    ).execute()
    if not token_creado.data:
        logger.error(
            "No se pudo crear el enlace de permanencia del reporte %s",
            reporte_id,
        )
        return True

    enlace = (
        f"{settings.frontend_url.rstrip('/')}/confirmacion-permanencia"
        f"?token={token}"
    )
    aviso = encolar_notificacion(
        "confirmacion_permanencia_invitado",
        f"confirmacion_permanencia:{reporte_id}:{solicitada_at}",
        {
            "tipo": "reportante_invitado",
            "id": reporte_id,
            "telefono": telefono,
            "mensaje": (
                "¿El animalito de tu reporte sigue en el lugar? "
                "Confírmanos desde este enlace; vence en 2 horas."
            ),
            "enlace": enlace,
        },
    )
    if aviso:
        procesar_notificacion(aviso["id"])
    return True


def procesar_confirmaciones_permanencia() -> dict[str, Any]:
    """Solicita permanencia y pausa de forma atómica los casos vencidos."""
    caducados = (
        supabase_admin.table("reportes")
        .select("id")
        .not_("confirmacion_permanencia_solicitada_at", "is", "null")
        .is_("confirmacion_permanencia_respuesta", "null")
        .lt("confirmacion_permanencia_deadline_at", _ahora().isoformat())
        .execute()
        .data
        or []
    )

    enviados_revision = 0
    conflictos_revision = 0
    errores_revision = 0
    for reporte in caducados:
        try:
            transicionar_a_revision_manual(
                reporte["id"], "confirmacion_permanencia_timeout"
            )
            enviados_revision += 1
        except AtencionEnCursoError:
            conflictos_revision += 1
            logger.warning(
                "El reporte %s venció, pero ya tiene atención en curso",
                reporte["id"],
            )
        except RevisionManualError:
            errores_revision += 1
            logger.exception(
                "No se pudo pausar el reporte vencido %s", reporte["id"]
            )

    inactivos = (
        supabase_admin.rpc("obtener_reportes_inactivos_permanencia")
        .execute()
        .data
        or []
    )
    solicitudes = sum(1 for reporte in inactivos if _crear_solicitud(reporte))

    return {
        "caducados_procesados": enviados_revision,
        "caducados_con_atencion": conflictos_revision,
        "caducados_con_error": errores_revision,
        "solicitudes_creadas": solicitudes,
    }
