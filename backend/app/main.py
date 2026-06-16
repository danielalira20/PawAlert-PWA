from fastapi import FastAPI
from app.api import reports, associations, auth, users, report_acceptance

app = FastAPI(
    title="PawAlert API",
    version="1.0.0"
)

app.include_router(reports.router, prefix="/reports", tags=["Reportes"])
app.include_router(associations.router, prefix="/associations", tags=["Asociaciones"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Usuarios"])
app.include_router(report_acceptance.router, prefix="/reports", tags=["Aceptación"])

@app.get("/")
def health_check():
    return {"status": "ok", "message": "PawAlert API corriendo"}