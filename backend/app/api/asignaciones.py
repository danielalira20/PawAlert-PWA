"""
Endpoints de matching y asignacion de voluntarios

Flujo: la asociacion pide candidatos -> asigna -> el voluntario confirma o
rechaza. Todo evento queda en historial_reporte
Los estados del reporte NO se tocan: la seleccion de voluntario vive dentro
del estado 'asignado'.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services import coverage_service, matching
from app.db.supabase import supabase, supabase_admin
from app.utils.animal_shaping import shape_animal_embed, condicion_mas_grave

router = APIRouter()

ESTADOS_ACTIVOS_VOLUNTARIO = ("activo_nivel_1", "activo_nivel_2")


def _obtener_usuario_autenticado(authorization: Optional[str]) -> dict:
    """
    Mismo patron que reports.py, con un extra: tambien trae el nombre del rol
    (join al catalogo roles) porque las validaciones de este router lo usan.
    Devuelve: {"id", "asociacion_id", "rol"}
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = (
        supabase.table("usuarios")
        .select("id, asociacion_id, roles(nombre)")
        .eq("auth_user_id", auth_response.user.id)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }


class AsignarBody(BaseModel):
    voluntario_id: str


class RechazarBody(BaseModel):
    motivo: Optional[str] = None


# ---------------------------------------------------------------------------
# Paso 3: candidatos
# ---------------------------------------------------------------------------
@router.get("/{reporte_id}/candidatos")
def obtener_candidatos(reporte_id: str, authorization: Optional[str] = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    reporte = _reporte_o_404(reporte_id)
    _validar_es_asociacion_duena(usuario, reporte)

    resultado = matching.obtener_candidatos(reporte_id)

    aso = (
        supabase.table("asociaciones")
        .select("modo_asignacion, timeout_grave, timeout_herido, timeout_estable")
        .eq("id", reporte["asociacion_asignada_id"]).single().execute().data
    )
    resultado["modo_asignacion"] = aso["modo_asignacion"]
    resultado["timeout_min"] = 0 if aso["modo_asignacion"] == "automatico" else _timeout_por_condicion(aso, reporte.get("condicion"))
    resultado["confirmacion_voluntario"] = reporte.get("confirmacion_voluntario")
    resultado["estado_cobertura"] = reporte.get("estado_cobertura")
    resultado["ofrecimientos_externos"] = (
        coverage_service.obtener_ofrecimientos_reporte(reporte_id)
    )

    # Primera presentacion: sellar timestamp + evento (solo una vez)
    if reporte.get("candidatos_presentados_at") is None and resultado["candidatos"]:
        supabase.table("reportes").update(
            {"candidatos_presentados_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", reporte_id).execute()
        _evento(
            reporte_id, None, "candidatos_presentados",
            f"{len(resultado['candidatos'])} candidatos presentados a la asociación",
            {"candidatos": [c["voluntario_id"] for c in resultado["candidatos"]]},
        )
    return resultado


# ---------------------------------------------------------------------------
# Paso 4: asignar / confirmar / rechazar
# ---------------------------------------------------------------------------
@router.post("/{reporte_id}/asignar")
def asignar_voluntario(
    reporte_id: str, body: AsignarBody, authorization: Optional[str] = Header(None)
):
    usuario = _obtener_usuario_autenticado(authorization)
    reporte = _reporte_o_404(reporte_id)
    _validar_es_asociacion_duena(usuario, reporte)

    try:
        vol = (
            supabase_admin.table("voluntarios")
            .select(
                "id, usuario_id, estado, "
                "usuarios(nombre, apellido_paterno, roles(nombre))"
            )
            .eq("id", body.voluntario_id).single().execute().data
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="No pudimos consultar el perfil del voluntario seleccionado",
        ) from exc
    if not vol or vol["estado"] not in ESTADOS_ACTIVOS_VOLUNTARIO:
        raise HTTPException(status_code=422, detail="El voluntario no existe o no está activo")

    rol = ((vol.get("usuarios") or {}).get("roles") or {}).get("nombre")
    if rol == "voluntario_externo":
        elegibles = coverage_service.obtener_ofrecimientos_reporte(reporte_id)
        origen = "ofrecimiento_externo"
    else:
        elegibles = matching.obtener_candidatos(reporte_id)["candidatos"]
        origen = "equipo_interno"

    if body.voluntario_id not in {item["voluntario_id"] for item in elegibles}:
        raise HTTPException(
            status_code=409,
            detail=(
                "La disponibilidad del voluntario cambió. "
                "Actualiza la lista y elige otro candidato"
            ),
        )

    coverage_service.reservar_cobertura(
        reporte_id=reporte_id,
        usuario_asignado_id=vol["usuario_id"],
        voluntario_id=vol["id"],
        asociacion_id=reporte["asociacion_asignada_id"],
        actor_id=usuario["id"],
        origen=origen,
    )

    nombre = f"{vol['usuarios']['nombre']} {vol['usuarios']['apellido_paterno']}"
    return {"ok": True, "voluntario_asignado": nombre, "confirmacion": "esperando"}


@router.post("/{reporte_id}/confirmar-asignacion")
def confirmar_asignacion(reporte_id: str, authorization: Optional[str] = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    reporte = _reporte_o_404(reporte_id)
    _validar_es_el_voluntario_asignado(usuario, reporte)

    return coverage_service.responder_propuesta(
        usuario["id"], reporte_id, True, rol=usuario.get("rol")
    )


@router.post("/{reporte_id}/rechazar-asignacion")
def rechazar_asignacion(
    reporte_id: str, body: RechazarBody, authorization: Optional[str] = Header(None)
):
    usuario = _obtener_usuario_autenticado(authorization)
    reporte = _reporte_o_404(reporte_id)
    _validar_es_el_voluntario_asignado(usuario, reporte)

    return coverage_service.responder_propuesta(
        usuario["id"], reporte_id, False, body.motivo, rol=usuario.get("rol")
    )

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _reporte_o_404(reporte_id: str) -> dict:
    res = (
        supabase.table("reportes")
        .select(
            "id, asociacion_asignada_id, staff_asignado_id, "
            "confirmacion_voluntario, candidatos_presentados_at, "
            "estado_reporte, estado_cobertura, "
            "animal(condicion_catalogo(clave))"
        )
        .eq("id", reporte_id).single().execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    data = res.data
    animales, _ = shape_animal_embed(data.get("animal"))
    data["condicion"] = condicion_mas_grave(animales)
    return data


def _validar_es_asociacion_duena(usuario: dict, reporte: dict):
    """Solo la cuenta de la asociacion duena (rol 'asociacion') o su
    staff-admin (rol 'staff') pueden ver candidatos y asignar."""
    if usuario.get("rol") not in ("asociacion", "staff"):
        raise HTTPException(status_code=403, detail="Solo la asociación puede gestionar asignaciones")
    if usuario.get("asociacion_id") != reporte["asociacion_asignada_id"]:
        raise HTTPException(status_code=403, detail="Este caso pertenece a otra asociación")


def _validar_es_el_voluntario_asignado(usuario: dict, reporte: dict):
    if reporte.get("staff_asignado_id") != usuario.get("id"):
        raise HTTPException(status_code=403, detail="No eres el voluntario asignado a este caso")
    if reporte.get("confirmacion_voluntario") != "esperando":
        raise HTTPException(status_code=409, detail="Este caso no está esperando tu confirmación")


def _timeout_por_condicion(aso: dict, condicion) -> int:
    mapa = {"grave": "timeout_grave", "herido": "timeout_herido", "estable": "timeout_estable"}
    return aso.get(mapa.get(str(condicion), "timeout_estable"), 60)


def _evento(reporte_id, usuario_id, tipo_evento, descripcion, datos_extra):
    """Contrato del log: todo evento de asignacion va a historial_reporte."""
    supabase.table("historial_reporte").insert({
        "reporte_id": reporte_id,
        "usuario_id": usuario_id,
        "tipo_evento": tipo_evento,
        "descripcion": descripcion,
        "datos_extra": datos_extra,
    }).execute()
