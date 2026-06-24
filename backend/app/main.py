from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import reports, associations, catalogos, auth, users, report_acceptance, admin
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
@app.get("/")
def root():
    return {"status": "ok", "message": "PawAlert API corriendo"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
