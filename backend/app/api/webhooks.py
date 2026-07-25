from fastapi import APIRouter, HTTPException, Request
from twilio.request_validator import RequestValidator

from app.config import settings
from app.services.whatsapp_notification_service import actualizar_estado_twilio


router = APIRouter()


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
