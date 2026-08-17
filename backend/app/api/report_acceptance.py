from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from app.db.supabase import supabase, supabase_admin

router = APIRouter()


class AcceptanceRequest(BaseModel):
    token: str
    notas: str | None = None


class AcceptanceRequestStaff(BaseModel):
    notas: str | None = None


def _aceptar_asignacion(asignacion_id: str, reporte_id: str, notas: str | None):
    reporte = _obtener_reporte_coordinable(reporte_id)
    ahora = datetime.now(timezone.utc).isoformat()
    estado_id = _obtener_estado_asignacion_id("aceptada")
    supabase.table("reporte_asignaciones").update({
        "accepted_at": ahora,
        "notas": notas,
        "estado": "aceptada",
        "estado_id": estado_id,
    }).eq("id", asignacion_id).execute()

    _registrar_evento(
        reporte_id,
        "asociacion_acepta_coordinacion",
        "La asociación aceptó coordinar el reporte; falta elegir voluntario.",
        {"asignacion_id": asignacion_id, "asociacion_id": reporte["asociacion_asignada_id"]},
    )


def _rechazar_asignacion(asignacion_id: str, reporte_id: str, notas: str | None):
    _obtener_reporte_coordinable(reporte_id)
    ahora = datetime.now(timezone.utc).isoformat()
    estado_asignacion_id = _obtener_estado_asignacion_id("rechazada")
    supabase.table("reporte_asignaciones").update({
        "closed_at": ahora,
        "notas": notas,
        "estado": "rechazada",
        "estado_id": estado_asignacion_id,
    }).eq("id", asignacion_id).execute()

    estado_reporte_id = _obtener_estado_reporte_id("sin_cobertura")
    supabase.table("reportes").update({
        "estado_id": estado_reporte_id,
        "estado_reporte": "sin_cobertura",
        "estado_cobertura": None,
        "asociacion_asignada_id": None,
        "candidatos_presentados_at": None,
    }).eq("id", reporte_id).execute()
    supabase_admin.table("casos_administrativos").insert({
        "reporte_id": reporte_id,
        "tipo": "reporte_sin_coordinadora",
        "prioridad": "alta",
        "estado": "pendiente",
        "detalle": "La asociación asignada rechazó coordinar el reporte.",
    }).execute()
    _registrar_evento(
        reporte_id,
        "asociacion_rechaza_coordinacion",
        "La asociación rechazó coordinar el reporte; se escaló a administración.",
        {"asignacion_id": asignacion_id, "notas": notas},
    )


def _obtener_reporte_coordinable(reporte_id: str) -> dict:
    resultado = supabase.table("reportes").select(
        "id, estado_validacion_reporte, estado_reporte, estado_cobertura, "
        "asociacion_asignada_id"
    ).eq("id", reporte_id).limit(1).execute()
    reporte = resultado.data[0] if resultado.data else None
    if (
        not reporte
        or reporte.get("estado_validacion_reporte") != "aprobado"
        or reporte.get("estado_reporte") != "asignado"
        or reporte.get("estado_cobertura") != "abierto"
        or not reporte.get("asociacion_asignada_id")
    ):
        raise HTTPException(
            status_code=409,
            detail="El reporte ya no está disponible para esta respuesta",
        )
    return reporte


def _obtener_estado_asignacion_id(clave: str) -> str:
    resultado = supabase.table("asignacion_estados").select("id").eq(
        "clave", clave
    ).limit(1).execute()
    if not resultado.data:
        raise HTTPException(status_code=500, detail="No se pudo resolver la respuesta")
    return resultado.data[0]["id"]


def _obtener_estado_reporte_id(clave: str) -> str:
    resultado = supabase.table("reporte_estados").select("id").eq(
        "clave", clave
    ).limit(1).execute()
    if not resultado.data:
        raise HTTPException(status_code=500, detail="No se pudo resolver el estado")
    return resultado.data[0]["id"]


def _registrar_evento(
    reporte_id: str, tipo_evento: str, descripcion: str, datos_extra: dict
) -> None:
    supabase.table("historial_reporte").insert({
        "reporte_id": reporte_id,
        "usuario_id": None,
        "tipo_evento": tipo_evento,
        "descripcion": descripcion,
        "datos_extra": datos_extra,
    }).execute()


def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select(
        "id, asociacion_id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }

def _verificar_rol(usuario: dict, roles_permitidos: tuple[str, ...]) -> None:
    """Bloquea el acceso si el rol del usuario no está entre los permitidos.
    Necesario desde que voluntario_interno/externo también reciben
    asociacion_id al ser aceptados — sin este check, cualquier voluntario
    pasaría la validación de 'está vinculado a una asociación'."""
    if usuario.get("rol") not in roles_permitidos:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para realizar esta acción"
        )
    
def _obtener_asignacion_para_staff(reporte_id: str, asociacion_id: str | None) -> str:
    """Confirma que el reporte está asignado a la asociación del usuario
    logueado, y regresa el id de la asignación."""
    if not asociacion_id:
        raise HTTPException(status_code=403, detail="Este usuario no pertenece a ninguna asociación")

    asignacion = supabase.table("reporte_asignaciones").select(
        "id, asociacion_id"
    ).eq("reporte_id", reporte_id).eq("estado", "notificada").execute()

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
    ).eq("reporte_id", reporte_id).eq("token", body.token).eq(
        "estado", "notificada"
    ).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    _aceptar_asignacion(asignacion.data[0]["id"], reporte_id, body.notas)
    return {
        "mensaje": "Coordinación aceptada; ahora selecciona un voluntario",
        "reporte_id": reporte_id,
    }


@router.post("/{reporte_id}/reject", status_code=200)
async def reject_report(reporte_id: str, body: AcceptanceRequest):
    asignacion = supabase.table("reporte_asignaciones").select(
        "id"
    ).eq("reporte_id", reporte_id).eq("token", body.token).eq(
        "estado", "notificada"
    ).execute()

    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o token inválido")

    _rechazar_asignacion(asignacion.data[0]["id"], reporte_id, body.notas)
    return {"mensaje": "Coordinación rechazada y escalada a administración", "reporte_id": reporte_id}


# --- Flujo autenticado: para el staff de la asociación ya logueado en la app,
# sin necesidad de pasar por el link del correo. ---

@router.post("/{reporte_id}/accept-staff", status_code=200)
async def accept_report_staff(reporte_id: str, body: AcceptanceRequestStaff, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    asignacion_id = _obtener_asignacion_para_staff(reporte_id, usuario["asociacion_id"])
    _aceptar_asignacion(asignacion_id, reporte_id, body.notas)
    return {
        "mensaje": "Coordinación aceptada; ahora selecciona un voluntario",
        "reporte_id": reporte_id,
    }


@router.post("/{reporte_id}/reject-staff", status_code=200)
async def reject_report_staff(reporte_id: str, body: AcceptanceRequestStaff, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _verificar_rol(usuario, ("asociacion", "staff"))
    asignacion_id = _obtener_asignacion_para_staff(reporte_id, usuario["asociacion_id"])
    _rechazar_asignacion(asignacion_id, reporte_id, body.notas)
    return {"mensaje": "Coordinación rechazada y escalada a administración", "reporte_id": reporte_id}
