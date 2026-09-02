import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import (
    admin,
    adoptions,
    asignaciones,
    associations,
    auth,
    catalogos,
    coverage,
    custody,
    events,
    incidentes,
    internal,
    navigation,
    perfiles_apoyo,
    red_aliados,
    report_acceptance,
    reports,
    reputacion,
    recompensas,
    staff,
    stats,
    users,
    voluntarios,
    webhooks,
)
from app.config import settings

logger = logging.getLogger(__name__)


def _allowed_cors_origins() -> list[str]:
    configured = [
        origin.strip().rstrip("/")
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ]
    frontend_origin = settings.frontend_url.strip().rstrip("/")
    defaults = [frontend_origin] if frontend_origin else []
    defaults.extend(["http://localhost:8081", "http://localhost:19006"])
    return list(dict.fromkeys(configured + defaults))

app = FastAPI(
    title="PawAlert API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router, prefix="/reports", tags=["Reportes"])
app.include_router(associations.router, prefix="/associations", tags=["Asociaciones"])
app.include_router(catalogos.router, prefix="/catalogos", tags=["Catálogos"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Usuarios"])
app.include_router(report_acceptance.router, prefix="/reports", tags=["Aceptación"])
app.include_router(admin.router, prefix="/admin", tags=["Administración"])
app.include_router(staff.router, prefix="/staff", tags=["Staff"])
app.include_router(stats.router, prefix="/stats", tags=["Estadísticas"])
app.include_router(asignaciones.router, prefix="/reports", tags=["Asignaciones"])
app.include_router(voluntarios.router, prefix="/voluntarios", tags=["Voluntarios"])
app.include_router(navigation.router, prefix="/voluntarios", tags=["Navegación"])
app.include_router(internal.router, prefix="/internal", tags=["Interno"])
app.include_router(red_aliados.router, prefix="/red-aliados", tags=["Red de Aliados"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])
app.include_router(perfiles_apoyo.router, prefix="/perfiles-apoyo", tags=["Perfiles de Apoyo"])
app.include_router(coverage.router, prefix="/coverage", tags=["Cobertura"])
app.include_router(custody.router, prefix="/custody", tags=["Custodia temporal"])
app.include_router(recompensas.router, prefix="/recompensas", tags=["Recompensas"])
app.include_router(incidentes.router, prefix="/incidentes", tags=["Incidentes"])
app.include_router(reputacion.router, prefix="/reputacion", tags=["Reputación"])
app.include_router(adoptions.router, tags=["Adopciones"])
app.include_router(events.router, tags=["Eventos"])
from app.api import permanencia
app.include_router(permanencia.router, prefix="/reports", tags=["Permanencia"])
from app.api import avistamientos
app.include_router(avistamientos.router, prefix="/reports", tags=["Avistamientos"])

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error processing %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor. Intenta de nuevo más tarde."},
    )

@app.get("/")
def root():
    return {"status": "ok", "message": "PawAlert API corriendo"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

async def expiracion_en_segundo_plano():
    from app.services.canjes_service import expirar_canjes_vencidos
    while True:
        try:
            # Ejecutamos la función sincrónica en un hilo para no pausar el servidor
            total = await asyncio.to_thread(expirar_canjes_vencidos)
            if total > 0:
                print(f"[CRON INTERNO] Se expiraron {total} canjes vencidos.")
        except Exception as e:
            print(f"[CRON INTERNO ERROR] Error al expirar canjes: {e}")
        
        # Espera 1 hora (3600 segundos) antes de volver a revisar
        await asyncio.sleep(3600)


async def sesiones_whatsapp_en_segundo_plano():
    from app.services.whatsapp_report_service import procesar_inactividad_sesiones

    while True:
        try:
            resultado = await procesar_inactividad_sesiones()
            if resultado["avisadas"] or resultado["expiradas"]:
                print(
                    "[CRON WHATSAPP] "
                    f"Avisadas: {resultado['avisadas']}; "
                    f"expiradas: {resultado['expiradas']}."
                )
        except Exception as error:
            logger.exception("Error al procesar sesiones inactivas de WhatsApp: %s", error)

        await asyncio.sleep(60)

@app.on_event("startup")
async def iniciar_tareas_fondo():
    print("[SISTEMA] Iniciando Cron interno automático de expiración de canjes...")
    asyncio.create_task(expiracion_en_segundo_plano())
    asyncio.create_task(sesiones_whatsapp_en_segundo_plano())
