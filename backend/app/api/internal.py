"""
Endpoints internos (no consumidos por el frontend).
Protegidos con el header X-Cron-Secret; el valor vive en la variable de
entorno CRON_SECRET (local y Railway), leída vía app.config.settings —
igual que el resto del proyecto (antes usaba os.getenv directo, que
nunca veía el valor: pydantic-settings no exporta el .env a os.environ).
"""
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.services.escalamiento import evaluar_escalamientos
from app.services.whatsapp_notification_service import (
    evaluar_recordatorios_seguridad,
    procesar_pendientes,
)
from app.api.custody import generar_notificaciones_vencimiento, escalar_relevos_sin_respuesta
from app.services import coverage_service

router = APIRouter()


@router.post("/escalamiento/run")
def correr_escalamiento(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    vencidas = coverage_service.expirar_propuestas_vencidas()
    return {
        "propuestas_vencidas": vencidas,
        "escalamiento": evaluar_escalamientos(),
    }


@router.post("/whatsapp/run")
def correr_notificaciones_whatsapp(
    x_cron_secret: Optional[str] = Header(None),
):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    seguridad = evaluar_recordatorios_seguridad()
    envios = procesar_pendientes()
    return {"seguridad": seguridad, "envios": envios}


@router.post("/custody-notifications/run")
def correr_notificaciones_custodia(
    x_cron_secret: Optional[str] = Header(None),
):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    return {
        "notificaciones": generar_notificaciones_vencimiento(),
        "relevos": escalar_relevos_sin_respuesta(),
    }
