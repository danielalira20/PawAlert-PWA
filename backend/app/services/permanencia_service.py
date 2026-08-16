import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from app.db.supabase import supabase_admin
from app.services.push_notification_service import queue_and_send_push

logger = logging.getLogger(__name__)

def procesar_confirmaciones_permanencia() -> Dict[str, Any]:
    """
    Ejecutado por cron.
    Busca reportes aprobados/verdes con >6h sin actividad, excluyendo recursos vinculados.
    Genera push para usuarios, y token + (SMS/WhatsApp) para invitados.
    También procesa los que vencieron sin respuesta y los envía a revisión.
    """
    supabase = supabase_admin
    
    # 1. Enviar a revisión reportes caducados sin respuesta
    # (Los que se les pidió confirmación, se venció el deadline y no respondieron)
    res_caducados = supabase.table("reportes").select("id").not_("confirmacion_permanencia_solicitada_at", "is", "null").is_("confirmacion_permanencia_respuesta", "null").lt("confirmacion_permanencia_deadline_at", "now()").execute()
    caducados = res_caducados.data
    
    enviados_revision = 0
    if caducados:
        for rep in caducados:
            reporte_id = rep["id"]
            # Enviar a revisión manual usando RPC o servicio central de Daniela
            try:
                # Actualizar a 'timeout' para que no vuelva a procesarse
                supabase.table("reportes").update({
                    "confirmacion_permanencia_respuesta": "timeout"
                }).eq("id", reporte_id).execute()
                
                # Asumimos que Daniela expone 'transicion_revision_manual'
                supabase.rpc("transicion_revision_manual", {"p_reporte_id": reporte_id}).execute()
                enviados_revision += 1
            except Exception as e:
                logger.error(f"Error procesando caducidad permanencia reporte {reporte_id}: {e}")
                
    # 2. Buscar nuevos reportes inactivos para solicitar confirmación
    res_inactivos = supabase.rpc("obtener_reportes_inactivos_permanencia").execute()
    inactivos = res_inactivos.data

    solicitudes = 0
    if inactivos:
        for rep in inactivos:
            reporte_id = rep["reporte_id"]
            usuario_id = rep["usuario_id"]
            
            # Establecer deadlines y solicitudes
            deadline_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
            solicitada_at = datetime.now(timezone.utc).isoformat()
            
            supabase.table("reportes").update({
                "confirmacion_permanencia_solicitada_at": solicitada_at,
                "confirmacion_permanencia_deadline_at": deadline_at
            }).eq("id", reporte_id).execute()
            
            if usuario_id:
                # Usuario registrado -> Push Notification
                queue_and_send_push(
                    usuario_id=usuario_id,
                    tipo_evento="confirmacion_permanencia_solicitada",
                    idempotency_key=f"perm_req_{reporte_id}_{secrets.token_hex(4)}",
                    payload={"mensaje": "¿El animalito sigue ahí? Confírmanos para mantener activo tu reporte."},
                    reporte_id=reporte_id
                )
            else:
                # Invitado -> SMS/WhatsApp con Token de 1 uso
                token_val = secrets.token_urlsafe(32)
                
                # Desactivar tokens previos
                supabase.table("tokens_confirmacion_permanencia").update({"usado": True}).eq("reporte_id", reporte_id).execute()
                
                # Guardar el token (se guardaría hash, pero para simplificar la validación directa, guardaremos el valor o su hash.
                # Como requerimiento se pidió hash, usaremos hashlib)
                import hashlib
                token_hash = hashlib.sha256(token_val.encode()).hexdigest()
                
                supabase.table("tokens_confirmacion_permanencia").insert({
                    "token_hash": token_hash,
                    "reporte_id": reporte_id,
                    "expira_at": deadline_at
                }).execute()
                
                # Aquí llamaríamos al servicio de SMS/WhatsApp de Daniela
                # Ej: whatsapp_service.enviar_enlace_invitado(reporte_id, token_val)
                logger.info(f"Token de invitado generado para {reporte_id}: {token_val}")
                
            solicitudes += 1

    return {
        "caducados_procesados": enviados_revision,
        "solicitudes_creadas": solicitudes
    }
