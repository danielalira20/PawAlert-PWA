from fastapi import FastAPI
from app.api import reports, associations, catalogos

app = FastAPI(
    title="PawAlert API",
    version="1.0.0"
)

app.include_router(reports.router, prefix="/reports", tags=["Reportes"])
app.include_router(associations.router, prefix="/associations", tags=["Asociaciones"])
app.include_router(catalogos.router, prefix="/catalogos", tags=["Catálogos"])

@app.get("/")
def health_check():
    return {"status": "ok", "message": "PawAlert API corriendo"}