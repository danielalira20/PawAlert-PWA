"""
Endpoints internos (no consumidos por el frontend).
Protegidos con el header X-Cron-Secret; el valor vive en la variable de
entorno CRON_SECRET (local y Railway), leída vía app.config.settings —
igual que el resto del proyecto (antes usaba os.getenv directo, que
nunca veía el valor: pydantic-settings no exporta el .env a os.environ).
"""
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from PIL import Image

from app.config import settings
from app.services.escalamiento import evaluar_escalamientos
from app.services.whatsapp_notification_service import (
    evaluar_recordatorios_seguridad,
    procesar_pendientes,
)
from app.api.custody import generar_notificaciones_vencimiento, escalar_relevos_sin_respuesta
from app.services import coverage_service
from app.services.recompensas_service import expirar_recompensas_vencidas

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


@router.post("/recompensas/run")
def correr_vencimiento_recompensas(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    return {"recompensas_vencidas": expirar_recompensas_vencidas()}


@router.post("/recompensas/canjes/run")
def correr_vencimiento_canjes(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.canjes_service import expirar_canjes_vencidos
    return {"canjes_vencidos": expirar_canjes_vencidos()}


@router.post("/gamificacion/run")
def correr_reputacion(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.reputacion_service import evaluar_reportes_validados_por_tiempo
    return {"reportes_validados_por_tiempo": evaluar_reportes_validados_por_tiempo()}


@router.post("/gamificacion/reevaluar-insignias-historicas")
def correr_reevaluacion_insignias_historicas(
    dry_run: bool = True,
    x_cron_secret: Optional[str] = Header(None),
):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.reputacion_service import reevaluar_insignias_historicas_reportante
    return {"insignias_historicas": reevaluar_insignias_historicas_reportante(dry_run=dry_run)}


@router.post(
    "/gamificacion/reevaluar-insignias-historicas/voluntarios-internos"
)
def correr_reevaluacion_insignias_historicas_voluntarios_internos(
    dry_run: bool = True,
    x_cron_secret: Optional[str] = Header(None),
):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.reputacion_service import (
        reevaluar_insignias_historicas_voluntario_interno,
    )
    return {
        "insignias_historicas": (
            reevaluar_insignias_historicas_voluntario_interno(dry_run=dry_run)
        )
    }

@router.post("/urgency/run")
def correr_urgency(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.urgency_scheduler_service import run_due_urgency_recalculations
    return run_due_urgency_recalculations(limit=100)

@router.post("/push/run")
def correr_push_dispatch(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.push_notification_service import dispatch_pending_pushes
    return dispatch_pending_pushes(limit=100)

@router.post("/reporter-confirmations/run")
def correr_confirmaciones_permanencia(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.permanencia_service import procesar_confirmaciones_permanencia
    return procesar_confirmaciones_permanencia()


@router.post("/clip-gray/run")
def correr_vencimientos_clip(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")
    from app.services.clip_gray_scheduler_service import procesar_vencimientos_clip

    return procesar_vencimientos_clip(limit=100)


@router.post("/clip/health")
def comprobar_clip(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")

    from app.services.clip_embedding_service import probe_clip_embedding

    image_buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(128, 128, 128)).save(
        image_buffer,
        format="JPEG",
    )
    result = probe_clip_embedding(image_buffer.getvalue(), "image/jpeg")
    return {
        "status": result.status.value,
        "dimensions": len(result.embedding) if result.embedding is not None else None,
        "model": result.model,
        "error_code": result.error_code.value if result.error_code else None,
    }


# TEMPORAL -- verificacion manual del cliente VROOM (Fase 1) contra la
# instancia real de Railway, no accesible desde fuera de su red privada.
# Quitar en cuanto se confirme un code=0 real.
@router.get("/diagnostics/vroom-check")
def comprobar_vroom(x_cron_secret: Optional[str] = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")

    from app.services import vroom_service

    request = vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[vroom_service.VroomJob(id=1, location_index=1)],
        matrix=[[0, 300], [300, 0]],
    )
    return vroom_service.get_optimization(request)
