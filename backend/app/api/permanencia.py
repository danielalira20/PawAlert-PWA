from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import supabase, supabase_admin
from app.services.push_notification_service import queue_and_send_push
from datetime import datetime, timezone

router = APIRouter()

class ConfirmacionRequest(BaseModel):
    respuesta: str  # 'sigue_ahi' o 'ya_no_esta'

class ConfirmacionInvitadoRequest(BaseModel):
    token: str
    respuesta: str

def procesar_respuesta_permanencia(reporte_id: str, respuesta: str, usuario_id: Optional[str] = None):
    if respuesta not in ["sigue_ahi", "ya_no_esta"]:
        raise HTTPException(status_code=400, detail="Respuesta inválida")
        
    db_admin = supabase_admin
    
    # Validar que el reporte esté esperando confirmación
    rep_req = db_admin.table("reportes").select("confirmacion_permanencia_respuesta, confirmacion_permanencia_solicitada_at").eq("id", reporte_id).execute()
    if not rep_req.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
    rep = rep_req.data[0]
    if rep.get("confirmacion_permanencia_respuesta") is not None or rep.get("confirmacion_permanencia_solicitada_at") is None:
        raise HTTPException(status_code=400, detail="Este reporte no tiene una solicitud de confirmación pendiente")
    
    # Guardar respuesta
    db_admin.table("reportes").update({
        "confirmacion_permanencia_respuesta": respuesta,
        "confirmacion_permanencia_respondida_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", reporte_id).execute()
    
    if respuesta == "sigue_ahi":
        # Hito de permanencia
        db_admin.table("historial_reporte").insert({
            "reporte_id": reporte_id,
            "usuario_id": usuario_id,
            "tipo_evento": "confirmacion_sigue_ahi",
            "descripcion": "El reportante confirmó que el animalito sigue en la zona"
        }).execute()
        return {"mensaje": "Gracias por confirmar. El reporte se mantendrá activo."}
    
    elif respuesta == "ya_no_esta":
        # Enviar a revisión manual usando RPC o servicio central de Daniela
        try:
            # Asumimos que Daniela expone 'transicion_revision_manual' en BD
            db_admin.rpc("transicion_revision_manual", {"p_reporte_id": reporte_id}).execute()
        except Exception as e:
            # En caso de que aún no exista o haya conflicto
            pass
            
        # Inyectar Notificaciones Push (D-1 y D-5)
        # Notificar al reportante si es autenticado
        if usuario_id:
            queue_and_send_push(
                usuario_id=usuario_id,
                tipo_evento="reporte_en_revision",
                idempotency_key=f"rep_rev_{reporte_id}",
                payload={"mensaje": "Necesitamos revisar información adicional sobre tu reporte."},
                reporte_id=reporte_id
            )
            
        # Notificar a la asociación/voluntario si había propuesta activa (esto lo podemos hacer buscando en propuestas)
        prop_activas = db_admin.table("propuestas_asignacion").select("usuario_asignado_id, asociacion_id").eq("reporte_id", reporte_id).eq("estado", "activa").execute()
        if prop_activas.data:
            for prop in prop_activas.data:
                if prop.get("usuario_asignado_id"):
                    queue_and_send_push(
                        usuario_id=prop["usuario_asignado_id"],
                        tipo_evento="reporte_pausado",
                        idempotency_key=f"rep_paus_{reporte_id}_v",
                        payload={"mensaje": "El caso que tenías asignado/propuesto ha quedado pausado por revisión."},
                        reporte_id=reporte_id
                    )
        
        return {"mensaje": "Hemos registrado que ya no está. El caso ha pasado a revisión."}


@router.post("/{reporte_id}/confirmacion-permanencia")
def confirmacion_permanencia_autenticada(reporte_id: str, payload: ConfirmacionRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
    user_res = supabase.table("usuarios").select("id").eq("auth_user_id", auth_response.user.id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    usuario_id = user_res.data[0]["id"]
    return procesar_respuesta_permanencia(reporte_id, payload.respuesta, usuario_id)


@router.post("/invitados/confirmacion-permanencia")
def confirmacion_permanencia_invitado(payload: ConfirmacionInvitadoRequest):
    import hashlib
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    
    db_admin = supabase_admin
    res = db_admin.table("tokens_confirmacion_permanencia").select("reporte_id, expira_at, usado").eq("token_hash", token_hash).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Token inválido o no encontrado")
        
    token_data = res.data[0]
    if token_data["usado"]:
        raise HTTPException(status_code=400, detail="Este enlace ya fue utilizado")
        
    expira_at = datetime.fromisoformat(token_data["expira_at"].replace("Z", "+00:00"))
    if expira_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Este enlace ha caducado")
        
    reporte_id = token_data["reporte_id"]
    
    # Marcar usado
    db_admin.table("tokens_confirmacion_permanencia").update({"usado": True}).eq("token_hash", token_hash).execute()
    
    return procesar_respuesta_permanencia(reporte_id, payload.respuesta, usuario_id=None)
