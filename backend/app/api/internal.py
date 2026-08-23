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


# TEMPORAL -- diagnostico manual de por que obtener_candidatos() devolvio 0
# candidatos en la corrida real de evaluar_escalamientos() de las
# 2026-08-23T16:43:36Z. candidatos_para_reporte (SQL) y obtener_candidatos()
# (Python) aplican varios filtros en cadena -- este endpoint corre el mismo
# reporte contra cada filtro por separado para ver en cual llega a cero, en
# vez de solo el resultado final. Quitar en cuanto se confirme la causa.
@router.get("/diagnostics/candidatos-check")
def comprobar_candidatos(
    reporte_id: str,
    x_cron_secret: Optional[str] = Header(None),
):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="No autorizado")

    from app.services import matching

    reporte = matching._obtener_reporte(reporte_id)
    especies_caso = {
        animal["tipo_animal"]
        for animal in reporte["animales"]
        if animal.get("tipo_animal")
    }
    tamanios_caso = {
        animal["tamanio"]
        for animal in reporte["animales"]
        if animal.get("tamanio")
    }
    critico = any(
        animal.get("condicion") == "grave" for animal in reporte["animales"]
    )

    crudos = (
        matching.supabase.rpc(
            "candidatos_para_reporte", {"p_reporte_id": reporte_id}
        )
        .execute()
        .data
        or []
    )

    rechazaron = matching._voluntarios_que_rechazaron(reporte_id)
    bloqueados = matching.usuarios_bloqueados_nuevas_asignaciones(
        {
            candidato["usuario_id"]
            for candidato in crudos
            if candidato.get("rol") == matching.ROL_VOLUNTARIO_INTERNO
            and candidato.get("usuario_id")
        },
        matching.ROL_VOLUNTARIO_INTERNO,
    )
    con_propuesta_activa = matching._voluntarios_con_propuesta_activa()

    def pasa_especie(candidato: dict) -> bool:
        especies = set(
            candidato.get("especies_manejo") or candidato.get("especies") or []
        )
        return not especies_caso or especies_caso.issubset(especies)

    def pasa_tamanio(candidato: dict) -> bool:
        tamanios = set(
            candidato.get("tamanios_manejo") or candidato.get("tamanios") or []
        )
        return not tamanios_caso or tamanios_caso.issubset(tamanios)

    def pasa_radio(candidato: dict) -> bool:
        radio = min(
            float(candidato.get("radio_max_km") or matching.MAX_RADIO_KM),
            matching.MAX_RADIO_KM,
        )
        distancia = float(candidato.get("distancia_km") or 0)
        return distancia <= radio

    def pasa_disponibilidad_urgencias(candidato: dict) -> bool:
        # Unico filtro DURO de disponibilidad -- horario/tiempo_reaccion
        # solo bajan el score, nunca excluyen a nadie.
        return not (critico and candidato.get("disponibilidad_urgencias") == "no")

    def pasa_capacidad(candidato: dict) -> bool:
        max_casos = int(candidato.get("max_casos_simultaneos") or 1)
        carga_actual = int(candidato.get("carga_actual") or 0)
        return carga_actual < max_casos

    desglose = {
        "rol_voluntario_interno": sum(
            1 for c in crudos if c.get("rol") == "voluntario_interno"
        ),
        "no_rechazo_este_reporte": sum(
            1 for c in crudos if c.get("usuario_id") not in rechazaron
        ),
        "no_bloqueado_por_reputacion": sum(
            1 for c in crudos if c.get("usuario_id") not in bloqueados
        ),
        "sin_propuesta_activa_en_otro_reporte": sum(
            1 for c in crudos if c.get("usuario_id") not in con_propuesta_activa
        ),
        "especie_compatible": sum(1 for c in crudos if pasa_especie(c)),
        "tamanio_compatible": sum(1 for c in crudos if pasa_tamanio(c)),
        "disponibilidad_urgencias": sum(
            1 for c in crudos if pasa_disponibilidad_urgencias(c)
        ),
        "dentro_de_radio": sum(1 for c in crudos if pasa_radio(c)),
        "capacidad_disponible": sum(1 for c in crudos if pasa_capacidad(c)),
    }

    resultado_real = matching.obtener_candidatos(reporte_id)

    return {
        "reporte_id": reporte_id,
        "especies_caso": sorted(especies_caso),
        "tamanios_caso": sorted(tamanios_caso),
        "critico": critico,
        "total_filas_rpc": len(crudos),
        "nota": (
            "total_filas_rpc ya viene post-filtrada por la funcion SQL "
            "candidatos_para_reporte (estado del voluntario, "
            "disponible_operativamente, acepto_terminos, coordenadas, radio "
            "y capacidad ya se evaluaron ahi antes de que Python vea la "
            "fila) -- si este numero ya es 0, el problema esta en el lado "
            "SQL, no en el desglose de abajo. Cada filtro del desglose se "
            "evalua de forma INDEPENDIENTE sobre total_filas_rpc, no "
            "encadenado con los demas, asi que ninguno de ellos tiene que "
            "coincidir con candidatos_finales -- son para ver en cual cae "
            "a cero, no para sumarse."
        ),
        "desglose_filtros_independientes": desglose,
        "candidatos_finales": len(resultado_real["candidatos"]),
    }
