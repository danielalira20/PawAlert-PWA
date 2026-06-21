from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase

router = APIRouter()


class AcceptanceRequest(BaseModel):
    token: str
    notas: str | None = None


class AcceptanceRequestStaff(BaseModel):
    notas: str | None = None


def _aceptar_asignacion(asignacion_id: str, reporte_id: str, notas: str | None):
    supabase.table("reporte_asignaciones").update({
        "accepted_at": "now()",
        "notas": notas,
        "estado": "aceptada",
        "estado_id": "77a2e8ea-7ad6-4a65-bb25-f781d0074947"
    }).eq("id", asignacion_id).execute()

    supabase.table("reportes").update({
        "estado_reporte": "en_atencion",
    }).eq("id", reporte_id).execute()


def _rechazar_asignacion(asignacion_id: str, reporte_id: str, notas: str | None):
    supabase.table("reporte_asignaciones").update({
        "closed_at": "now()",
        "notas": notas,
        "estado": "rechazada",
        "estado_id": "54a8005a-4e1f-49b8-8858-12c5a2474daa"
    }).eq("id", asignacion_id).execute()

    supabase.table("reportes").update({
        "estado_reporte": "pendiente",
        "asociacion_asignada_id": None,
    }).eq("id", reporte_id).execute()


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, asociacion_id").eq(
        "auth_user_id", auth_response.user.id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return resultado.data[0]


def _obtener_asignacion_para_staff(reporte_id: str, asociacion_id: str | None) -> str:
    """Confirma que el reporte está asignado a la asociación del usuario
    logueado, y regresa el id de la asignación."""
    if not asociacion_id:
        raise HTTPException(status_code=403, detail="Este usuario no pertenece a ninguna asociación")

    asignacion = supabase.table("reporte_asignaciones").select(
        "id, asociacion_id"
    ).eq("reporte_id", reporte_id).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    if asignacion.data[0]["asociacion_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre este reporte")

    return asignacion.data[0]["id"]


# --- Flujo por link/token: sin necesidad de sesión, pensado para notificaciones
# por correo/SMS. El token llega embebido en el link que recibe la asociación. ---

@router.post("/{reporte_id}/accept", status_code=200)
async def accept_report(reporte_id: str, body: AcceptanceRequest):
    asignacion = supabase.table("reporte_asignaciones").select(
        "id"
    ).eq("reporte_id", reporte_id).eq("token", body.token).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    _aceptar_asignacion(asignacion.data[0]["id"], reporte_id, body.notas)
    return {"mensaje": "Reporte aceptado exitosamente", "reporte_id": reporte_id}


@router.post("/{reporte_id}/reject", status_code=200)
async def reject_report(reporte_id: str, body: AcceptanceRequest):
    asignacion = supabase.table("reporte_asignaciones").select(
        "id"
    ).eq("reporte_id", reporte_id).eq("token", body.token).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    _rechazar_asignacion(asignacion.data[0]["id"], reporte_id, body.notas)
    return {"mensaje": "Reporte rechazado. Queda pendiente para reasignación.", "reporte_id": reporte_id}


# --- Flujo autenticado: para el staff de la asociación ya logueado en la app,
# sin necesidad de pasar por el link del correo. ---

@router.post("/{reporte_id}/accept-staff", status_code=200)
async def accept_report_staff(reporte_id: str, body: AcceptanceRequestStaff, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    asignacion_id = _obtener_asignacion_para_staff(reporte_id, usuario["asociacion_id"])
    _aceptar_asignacion(asignacion_id, reporte_id, body.notas)
    return {"mensaje": "Reporte aceptado exitosamente", "reporte_id": reporte_id}


@router.post("/{reporte_id}/reject-staff", status_code=200)
async def reject_report_staff(reporte_id: str, body: AcceptanceRequestStaff, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    asignacion_id = _obtener_asignacion_para_staff(reporte_id, usuario["asociacion_id"])
    _rechazar_asignacion(asignacion_id, reporte_id, body.notas)
    return {"mensaje": "Reporte rechazado. Queda pendiente para reasignación.", "reporte_id": reporte_id}