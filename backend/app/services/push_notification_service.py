import logging
from typing import Dict, List, Optional
from app.db.supabase import supabase
from app.config import settings

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ImportError:
    firebase_admin = None
    messaging = None

logger = logging.getLogger(__name__)

# Initialize Firebase Admin if not already initialized
def _init_firebase():
    if not firebase_admin:
        logger.warning("firebase_admin is not installed")
        return
    
    if not firebase_admin._apps:
        # In a real scenario, credentials should be loaded from env vars securely
        # e.g., cred = credentials.Certificate(settings.firebase_service_account_dict)
        # For now, we leave a placeholder as we don't have the cert file.
        try:
            # Fallback to default credentials if running in a GCP environment
            firebase_admin.initialize_app()
        except Exception as e:
            logger.error(f"Failed to initialize firebase admin: {e}")

_init_firebase()

def queue_and_send_push(
    *,
    usuario_id: str,
    tipo_evento: str,
    idempotency_key: str,
    payload: dict,
    reporte_id: Optional[str] = None,
    propuesta_id: Optional[str] = None,
    custodia_id: Optional[str] = None,
) -> dict:
    """
    Guarda la notificación en el outbox (notificaciones_push).
    No revierte la transacción si falla.
    """
    try:
        # Validar payload (no enviar datos sensibles)
        _assert_safe_payload(payload)

        data = {
            "usuario_id": usuario_id,
            "tipo_evento": tipo_evento,
            "idempotency_key": idempotency_key,
            "payload": payload,
            "reporte_id": reporte_id,
            "propuesta_id": propuesta_id,
            "custodia_id": custodia_id,
            "estado": "pendiente"
        }
        
        result = supabase.table("notificaciones_push").insert(data).execute()
        return {"status": "queued", "id": result.data[0]["id"] if result.data else None}
    except ValueError:
        raise
    except Exception as e:
        # If there's a conflict (unique constraint on idempotency_key), it will raise an error
        # which means we can just return omitted.
        if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
            return {"status": "omitida", "reason": "idempotency_key exists"}
        logger.error(f"Failed to queue push {idempotency_key}: {e}")
        return {"status": "error_queueing", "error": str(e)}

def _assert_safe_payload(payload: dict) -> None:
    unsafe_keys = {"latitud", "longitud", "latitude", "longitude", "coordinates", "trust_score", "reputacion", "urgency_components"}
    for k in unsafe_keys:
        if k in payload:
            raise ValueError(f"Payload contains unsafe key: {k}")

def dispatch_pending_pushes(limit: int = 100) -> Dict[str, int]:
    """
    Called by the cron job to send pending pushes via FCM.
    """
    if not messaging:
        return {"error": "firebase_admin not initialized"}

    # Fetch pending pushes
    try:
        result = supabase.table("notificaciones_push").select("*") \
            .in_("estado", ["pendiente", "fallida"]) \
            .lt("intento", 3) \
            .order("created_at") \
            .limit(limit) \
            .execute()
    except Exception as e:
        logger.error(f"Error fetching pending pushes: {e}")
        return {"error": str(e)}

    pendientes = result.data or []
    if not pendientes:
        return {"dispatched": 0}

    contadores = {"enviada": 0, "fallida": 0, "omitida": 0}

    for push in pendientes:
        push_id = push["id"]
        usuario_id = push["usuario_id"]
        nuevo_intento = push["intento"] + 1

        try:
            tokens_result = supabase.table("dispositivos_push").select("token") \
                .eq("usuario_id", usuario_id) \
                .eq("active", True) \
                .execute()
            
            tokens = [r["token"] for r in (tokens_result.data or [])]
            
            if not tokens:
                _update_push_status(push_id, "omitida", nuevo_intento, error_sanitizado="sin_tokens_activos")
                contadores["omitida"] += 1
                continue

            # Construir el mensaje FCM
            # Firebase payload must be Dict[str, str]
            stringified_payload = {k: str(v) for k, v in push["payload"].items()}
            
            message = messaging.MulticastMessage(
                data=stringified_payload,
                tokens=tokens
            )
            
            response = messaging.send_each_for_multicast(message)
            
            if response.failure_count > 0:
                invalid_tokens = []
                for idx, res in enumerate(response.responses):
                    if not res.success:
                        # Identificar tokens inválidos
                        # res.exception.code might be 'messaging/invalid-registration-token' or 'messaging/registration-token-not-registered'
                        if getattr(res.exception, 'code', '') in [
                            'messaging/invalid-registration-token',
                            'messaging/registration-token-not-registered'
                        ]:
                            invalid_tokens.append(tokens[idx])
                
                if invalid_tokens:
                    _disable_invalid_tokens(invalid_tokens)
                
                if response.success_count == 0:
                    _update_push_status(push_id, "fallida", nuevo_intento, error_sanitizado="proveedor_no_disponible")
                    contadores["fallida"] += 1
                    continue

            _update_push_status(push_id, "enviada", nuevo_intento)
            contadores["enviada"] += 1

        except Exception as e:
            logger.error(f"Fallo enviando push {push_id}: {e}")
            _update_push_status(push_id, "fallida", nuevo_intento, error_sanitizado="error_interno")
            contadores["fallida"] += 1

    return contadores

def _disable_invalid_tokens(tokens: List[str]) -> None:
    try:
        supabase.table("dispositivos_push").update({"active": False}).in_("token", tokens).execute()
    except Exception as e:
        logger.error(f"Error disabling invalid tokens: {e}")

def _update_push_status(push_id: str, estado: str, intento: int, error_sanitizado: str = None) -> None:
    data = {
        "estado": estado,
        "intento": intento,
    }
    if error_sanitizado:
        data["error_sanitizado"] = error_sanitizado
    if estado == "enviada":
        data["enviada_at"] = "now()"
        
    try:
        supabase.table("notificaciones_push").update(data).eq("id", push_id).execute()
    except Exception as e:
        logger.error(f"Error updating push {push_id} status to {estado}: {e}")
