"""
Router de resumen de reputación para Mi Perfil (Persona 1 - Jass).

Sigue el patrón confirmado de red_aliados.py: _obtener_usuario_autenticado
copiado localmente (duplicación intencional en el proyecto), un GET /me
barato y subrutas separadas para lo pesado (/me/historial, /me/insignias)
-- misma forma que /red-aliados/me vs /me/impacto vs /me/insignias.

IMPORTANTE: el Trust Score numérico y su estado_interno NUNCA se
exponen aquí -- es información interna del backend, no del usuario
(regla ya establecida desde el diseño de Trust Score). Lo que sí se
expone son las RESTRICCIONES ya traducidas a mensaje humano
("no puedes recibir nuevas asignaciones por ahora"), nunca el número
ni la etiqueta interna que lo origina.
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.db.supabase import supabase, supabase_admin
# Dos clientes a propósito: `supabase` (key anon) solo para verificar el
# token via auth.get_user() y leer `usuarios` (sin RLS restrictivo).
# `supabase_admin` (service_role) para leer movimientos_puntos/insignias
# -- esas tablas tienen RLS habilitado + REVOKE ALL FROM anon,
# authenticated (0046/0047), así que el cliente anon SIEMPRE recibe
# "permission denied" ahí, sin importar el token. Bug real detectado en
# producción: las dos consultas directas de este archivo usaban
# `supabase` por error -- reputacion_service.py (que sí usa
# supabase_admin internamente) nunca tuvo este problema, por eso
# GET /reputacion/me funcionaba pero /me/historial y /me/insignias no.
from app.services import reputacion_service

router = APIRouter()


# ============================================================
# Auth -- copia local, mismo patrón que red_aliados.py / recompensas.py.
# ============================================================

def _obtener_usuario_autenticado(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    resultado = supabase.table("usuarios").select(
        "id, roles(nombre)"
    ).eq("auth_user_id", auth_response.user.id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "rol_principal": (fila.get("roles") or {}).get("nombre"),
    }


def _roles_aplicables(rol_principal: str | None) -> list[str]:
    """Cualquier usuario autenticado puede reportar, así que
    'reportante' siempre aplica. 'voluntario_interno'/'voluntario_externo'
    solo si ese es su rol principal -- no existe transición entre ellos
    (ver 0047_gamificacion_ajustes.sql)."""
    roles = ["reportante"]
    if rol_principal in ("voluntario_interno", "voluntario_externo"):
        roles.append(rol_principal)
    return roles


# ============================================================
# Mensajes de restricción -- traducen consultar_restricciones() a texto
# para el usuario, sin exponer puntaje ni estado_interno.
# ============================================================

def _mensaje_restriccion(rol: str, restricciones: dict) -> str | None:
    if rol == "reportante":
        if restricciones.get("requiere_revision_administrativa_total"):
            return "Tus reportes requieren revisión administrativa antes de publicarse."
        if restricciones.get("requiere_revision_previa"):
            limite = restricciones.get("maximo_reportes_activos_dia")
            if limite:
                return f"Tus reportes requieren revisión previa. Máximo {limite} reportes activos por día."
            return "Tus reportes requieren revisión previa antes de publicarse."
        return None
    # voluntario_interno / voluntario_externo
    if restricciones.get("suspension_operativa"):
        return "Tu cuenta está en suspensión operativa. Puedes finalizar tus casos activos."
    if restricciones.get("bloqueado_nuevas_asignaciones"):
        return "No puedes recibir nuevas asignaciones por ahora. Puedes finalizar tus casos activos."
    if restricciones.get("en_observacion"):
        return "Tu cuenta está en observación interna."
    return None


# ============================================================
# Modelos
# ============================================================

class SaldoRolResponse(BaseModel):
    rol: str
    saldo_disponible: int
    saldo_reservado: int
    saldo_total: int
    restriccion_activa: bool
    mensaje_restriccion: str | None = None


class ReputacionMeResponse(BaseModel):
    roles: list[SaldoRolResponse]


class MovimientoPuntosResponse(BaseModel):
    id: str
    rol: str
    tipo_movimiento: str
    puntos: int
    regla: str
    tipo_origen: str
    creado_at: str


class InsigniaResponse(BaseModel):
    id: str
    rol: str
    codigo_insignia: str
    nivel: str | None = None
    progreso: int
    obtenido_at: str | None = None
    mejorado_at: str | None = None


# ============================================================
# Endpoints
# ============================================================

@router.get("/me", response_model=ReputacionMeResponse)
async def get_mi_reputacion(authorization: str = Header(None)):
    """Endpoint barato: saldo desglosado + restricciones por cada rol
    aplicable al usuario. Sin historial ni insignias (eso va en las
    subrutas, son más pesadas)."""
    usuario = _obtener_usuario_autenticado(authorization)
    roles = _roles_aplicables(usuario.get("rol_principal"))

    respuesta = []
    for rol in roles:
        saldo = reputacion_service.consultar_saldo_desglosado(usuario["id"], rol)
        restricciones = reputacion_service.consultar_restricciones(usuario["id"], rol)
        mensaje = _mensaje_restriccion(rol, restricciones)
        respuesta.append(SaldoRolResponse(
            rol=rol,
            saldo_disponible=saldo.get("saldo_disponible", 0),
            saldo_reservado=saldo.get("saldo_reservado", 0),
            saldo_total=saldo.get("saldo_total", 0),
            restriccion_activa=mensaje is not None,
            mensaje_restriccion=mensaje,
        ))

    return ReputacionMeResponse(roles=respuesta)


@router.get("/me/historial", response_model=list[MovimientoPuntosResponse])
async def get_mi_historial_puntos(rol: str, limit: int = 50, authorization: str = Header(None)):
    """Historial privado de movimientos de puntos, más reciente primero."""
    usuario = _obtener_usuario_autenticado(authorization)
    if rol not in _roles_aplicables(usuario.get("rol_principal")):
        raise HTTPException(status_code=403, detail="Ese rol no aplica a tu cuenta")

    resultado = (
        supabase_admin.table("movimientos_puntos")
        .select("id, rol, tipo_movimiento, puntos, regla, tipo_origen, creado_at")
        .eq("usuario_id", usuario["id"])
        .eq("rol", rol)
        .order("creado_at", desc=True)
        .limit(min(limit, 200))
        .execute()
    )
    return resultado.data or []


@router.get("/me/insignias", response_model=list[InsigniaResponse])
async def get_mis_insignias(rol: str, authorization: str = Header(None)):
    """Insignias del usuario para el rol pedido. rol='reportante' o el
    rol de voluntario del usuario (mismo criterio de _roles_aplicables)."""
    usuario = _obtener_usuario_autenticado(authorization)
    if rol not in _roles_aplicables(usuario.get("rol_principal")):
        raise HTTPException(status_code=403, detail="Ese rol no aplica a tu cuenta")

    resultado = (
        supabase_admin.table("insignias")
        .select("id, rol, codigo_insignia, nivel, progreso, obtenido_at, mejorado_at")
        .eq("usuario_id", usuario["id"])
        .eq("rol", rol)
        .execute()
    )
    return resultado.data or []