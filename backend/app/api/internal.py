"""
Endpoints internos (no consumidos por el frontend).
Protegidos con el header X-Cron-Secret; el valor vive en la variable de
entorno CRON_SECRET (local y Railway).
"""
import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from app.services.escalamiento import evaluar_escalamientos

router = APIRouter()

CRON_SECRET = os.getenv("CRON_SECRET", "")


@router.post("/escalamiento/run")
def correr_escalamiento(x_cron_secret: Optional[str] = Header(None)):
    if not CRON_SECRET or x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="No autorizado")
    return evaluar_escalamientos()

