import hashlib
import hmac
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from twilio.request_validator import RequestValidator

from app.config import settings
from app.services.whatsapp_notification_service import actualizar_estado_twilio
from app.services.whatsapp_report_service import procesar_webhook_meta


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/meta/whatsapp", response_class=PlainTextResponse)
def verificar_webhook_meta(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
):
    """Handshake que Meta ejecuta al registrar la URL del webhook."""
    if (
        hub_mode != "subscribe"
        or not settings.whatsapp_meta_verify_token
        or not hmac.compare_digest(
            hub_verify_token or "", settings.whatsapp_meta_verify_token
        )
    ):
        raise HTTPException(status_code=403, detail="Verificación de Meta inválida")
    return hub_challenge or ""


@router.post("/meta/whatsapp")
async def recibir_webhook_meta(request: Request):
    """Recibe respuestas de WhatsApp y avanza el formulario del reporte."""
    cuerpo = await request.body()
    firma = request.headers.get("X-Hub-Signature-256", "")
    secreto = settings.whatsapp_meta_app_secret
    if not secreto:
        raise HTTPException(status_code=503, detail="Meta App Secret no configurado")
    esperada = "sha256=" + hmac.new(
        secreto.encode("utf-8"), cuerpo, hashlib.sha256
    ).hexdigest()
    if not firma or not hmac.compare_digest(firma, esperada):
        raise HTTPException(status_code=403, detail="Firma de Meta inválida")

    try:
        payload = await request.json()
        await procesar_webhook_meta(payload)
    except Exception:
        logger.exception("No se pudo procesar el webhook conversacional de Meta")
        raise
    return {"status": "ok"}


@router.post("/twilio/whatsapp/status")
async def whatsapp_status_callback(request: Request):
    formulario = dict(await request.form())
    if settings.twilio_validate_signatures:
        firma = request.headers.get("X-Twilio-Signature", "")
        base = settings.twilio_webhook_base_url.rstrip("/")
        url = (
            f"{base}/webhooks/twilio/whatsapp/status"
            if base
            else str(request.url)
        )
        if (
            not settings.twilio_auth_token
            or not RequestValidator(settings.twilio_auth_token).validate(
                url,
                formulario,
                firma,
            )
        ):
            raise HTTPException(status_code=403, detail="Firma de Twilio inválida")

    message_sid = str(formulario.get("MessageSid") or "")
    message_status = str(formulario.get("MessageStatus") or "")
    if not message_sid or not message_status:
        raise HTTPException(status_code=422, detail="Callback incompleto")
    return actualizar_estado_twilio(
        message_sid=message_sid,
        message_status=message_status,
        error_code=(
            str(formulario.get("ErrorCode"))
            if formulario.get("ErrorCode")
            else None
        ),
    )
