from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db.supabase import supabase

router = APIRouter()


class AcceptanceRequest(BaseModel):
    token: str
    notas: str | None = None


@router.post("/{reporte_id}/accept", status_code=200)
async def accept_report(reporte_id: str, body: AcceptanceRequest):
    asignacion = supabase.table("reporte_asignaciones").select(
        "id"
    ).eq("reporte_id", reporte_id).eq("token", body.token).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    asignacion_id = asignacion.data[0]["id"]

    supabase.table("reporte_asignaciones").update({
        "accepted_at": "now()",
        "notas": body.notas,
    }).eq("id", asignacion_id).execute()

    supabase.table("reportes").update({
        "estado_reporte": "en_atencion",
    }).eq("id", reporte_id).execute()

    return {"mensaje": "Reporte aceptado exitosamente", "reporte_id": reporte_id}


@router.post("/{reporte_id}/reject", status_code=200)
async def reject_report(reporte_id: str, body: AcceptanceRequest):
    asignacion = supabase.table("reporte_asignaciones").select(
        "id"
    ).eq("reporte_id", reporte_id).eq("token", body.token).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    asignacion_id = asignacion.data[0]["id"]

    supabase.table("reporte_asignaciones").update({
        "closed_at": "now()",
        "notas": body.notas,
    }).eq("id", asignacion_id).execute()

    supabase.table("reportes").update({
        "estado_reporte": "pendiente",
        "asociacion_asignada_id": None,
    }).eq("id", reporte_id).execute()

    return {"mensaje": "Reporte rechazado. Queda pendiente para reasignación.", "reporte_id": reporte_id}
