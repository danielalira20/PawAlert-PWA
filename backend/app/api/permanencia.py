import hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.db.supabase import supabase, supabase_admin
from app.services.push_notification_service import queue_and_send_push
from app.services.revision_manual_service import (
    AtencionEnCursoError,
    RevisionManualError,
    transicionar_a_revision_manual,
)

router = APIRouter()


class ConfirmacionRequest(BaseModel):
    respuesta: str


class ConfirmacionInvitadoRequest(BaseModel):
    token: str
    respuesta: str


def _fecha(valor: str | None) -> datetime | None:
    if not valor:
        return None
    return datetime.fromisoformat(valor.replace("Z", "+00:00"))


def _usuarios_de_asociacion(asociacion_id: str | None) -> list[str]:
    if not asociacion_id:
        return []
    resultado = (
        supabase_admin.table("usuarios")
        .select("id, roles(nombre)")
        .eq("asociacion_id", asociacion_id)
        .execute()
    )
    return [
        fila["id"]
        for fila in (resultado.data or [])
        if (fila.get("roles") or {}).get("nombre") in ("asociacion", "staff")
    ]


def _notificar_revision(resultado: dict) -> None:
    reporte_id = resultado["reporte_id"]
    destinatarios: dict[str, str] = {}
    reportante_id = resultado.get("reportante_id")
    if reportante_id:
        destinatarios[reportante_id] = (
            "Necesitamos revisar información adicional sobre tu reporte."
        )
    for usuario_id in resultado.get("usuarios_propuesta") or []:
        if usuario_id:
            destinatarios[usuario_id] = (
                "El caso que tenías propuesto quedó pausado para revisión."
            )
    for usuario_id in _usuarios_de_asociacion(
        resultado.get("asociacion_coordinadora_id")
    ):
        destinatarios[usuario_id] = (
            "Un reporte de tu asociación quedó pausado para revisión."
        )

    for usuario_id, mensaje in destinatarios.items():
        queue_and_send_push(
            usuario_id=usuario_id,
            tipo_evento="reporte_en_revision",
            idempotency_key=f"reporte_revision:{reporte_id}:{usuario_id}",
            payload={"mensaje": mensaje, "reporte_id": reporte_id},
            reporte_id=reporte_id,
        )


def procesar_respuesta_permanencia(
    reporte_id: str,
    respuesta: str,
    usuario_id: Optional[str] = None,
    *,
    es_invitado: bool = False,
):
    if respuesta not in ("sigue_ahi", "ya_no_esta"):
        raise HTTPException(status_code=400, detail="Respuesta inválida")

    consulta = (
        supabase_admin.table("reportes")
        .select(
            "usuario_id, confirmacion_permanencia_respuesta, "
            "confirmacion_permanencia_solicitada_at, "
            "confirmacion_permanencia_deadline_at"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = consulta.data[0]
    if not es_invitado and reporte.get("usuario_id") != usuario_id:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para responder por este reporte",
        )
    if (
        reporte.get("confirmacion_permanencia_respuesta") is not None
        or reporte.get("confirmacion_permanencia_solicitada_at") is None
    ):
        raise HTTPException(
            status_code=409,
            detail="Este reporte no tiene una confirmación pendiente",
        )
    deadline = _fecha(reporte.get("confirmacion_permanencia_deadline_at"))
    if not deadline or deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="La confirmación ha caducado")

    if respuesta == "ya_no_esta":
        try:
            resultado = transicionar_a_revision_manual(
                reporte_id, "confirmacion_permanencia_ya_no_esta"
            )
        except AtencionEnCursoError as error:
            raise HTTPException(
                status_code=409,
                detail=(
                    "El caso ya tiene una atención en curso. Una persona "
                    "responsable debe revisar el cambio."
                ),
            ) from error
        except RevisionManualError as error:
            raise HTTPException(
                status_code=503,
                detail="No pudimos pausar el reporte. Intenta nuevamente.",
            ) from error
        _notificar_revision(resultado)
        return {
            "mensaje": (
                "Registramos que el animal ya no está. El caso pasó a revisión."
            )
        }

    ahora = datetime.now(timezone.utc).isoformat()
    actualizacion = (
        supabase_admin.table("reportes")
        .update(
            {
                "confirmacion_permanencia_respuesta": "sigue_ahi",
                "confirmacion_permanencia_respondida_at": ahora,
                "confirmacion_permanencia_solicitada_at": None,
                "confirmacion_permanencia_deadline_at": None,
            }
        )
        .eq("id", reporte_id)
        .is_("confirmacion_permanencia_respuesta", "null")
        .execute()
    )
    if not actualizacion.data:
        raise HTTPException(
            status_code=409,
            detail="La confirmación ya fue respondida",
        )
    supabase_admin.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": usuario_id,
            "tipo_evento": "confirmacion_sigue_ahi",
            "descripcion": (
                "El reportante confirmó que el animal sigue en la zona"
            ),
        }
    ).execute()
    return {"mensaje": "Gracias por confirmar. El reporte se mantendrá activo."}


@router.post("/{reporte_id}/confirmacion-permanencia")
def confirmacion_permanencia_autenticada(
    reporte_id: str,
    payload: ConfirmacionRequest,
    authorization: Optional[str] = Header(None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.removeprefix("Bearer ")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception as error:
        raise HTTPException(
            status_code=401, detail="Token inválido o expirado"
        ) from error

    usuario = (
        supabase.table("usuarios")
        .select("id")
        .eq("auth_user_id", auth_response.user.id)
        .limit(1)
        .execute()
    )
    if not usuario.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return procesar_respuesta_permanencia(
        reporte_id, payload.respuesta, usuario.data[0]["id"]
    )


@router.post("/confirmacion-permanencia/invitado")
def confirmacion_permanencia_invitado(payload: ConfirmacionInvitadoRequest):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    consulta = (
        supabase_admin.table("tokens_confirmacion_permanencia")
        .select("reporte_id, expira_at, usado")
        .eq("token_hash", token_hash)
        .limit(1)
        .execute()
    )
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Enlace inválido")

    token = consulta.data[0]
    if token["usado"]:
        raise HTTPException(status_code=409, detail="Este enlace ya fue utilizado")
    if _fecha(token["expira_at"]) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Este enlace ha caducado")

    resultado = procesar_respuesta_permanencia(
        token["reporte_id"], payload.respuesta, es_invitado=True
    )
    supabase_admin.table("tokens_confirmacion_permanencia").update(
        {"usado": True}
    ).eq("token_hash", token_hash).eq("usado", False).execute()
    return resultado
