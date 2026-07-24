from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import reports, associations, catalogos, auth, users, report_acceptance, admin, staff, stats, asignaciones, voluntarios, internal, red_aliados

app = FastAPI(
    title="PawAlert API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # para desarrollo; en producción se restringe al dominio real
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
app.include_router(internal.router, prefix="/internal", tags=["Interno"])
app.include_router(red_aliados.router, prefix="/red-aliados", tags=["Red de Aliados"])

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[ERROR] {request.method} {request.url} — {exc}")
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

