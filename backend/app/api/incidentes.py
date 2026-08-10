"""
Router del sistema de Incidentes (Persona 1 - Jass).

Sigue la plantilla de app/api/recompensas.py (Miguel): helper de auth
duplicado local (patron de duplicacion intencional confirmado en el
proyecto -- ver comentario de Miguel en recompensas.py), un BaseModel
por operacion, response_model en cada endpoint, y las excepciones del
service traducidas a HTTPException aqui en el router (primer archivo
del proyecto que hace captura-por-tipo de excepciones custom, ya que
incidentes_service.py no importa FastAPI ni lanza HTTPException el
mismo, a diferencia de recompensas_service.py/red_aliados_service.py).
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.db.supabase import supabase
from app.services import incidentes_service
from app.services.incidentes_service import (
    PermisoDenegadoError,
    IncidenteNoEncontradoError,
    IncidenteEnEstadoInvalidoError,
)

try:
    from postgrest.exceptions import APIError as PostgrestAPIError
except ImportError:  # pragma: no cover - solo por si el paquete cambia de nombre
    PostgrestAPIError = None

router = APIRouter()


# ============================================================
# Auth -- copias locales, mismo patron que report_acceptance.py /
# recompensas.py / red_aliados.py / associations.py.
# ============================================================

def _verificar_admin(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    resultado = supabase.table("usuarios").select("id, roles(nombre)").eq(
        "auth_user_id", auth_response.user.id
    ).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario = resultado.data[0]
    rol = usuario.get("roles")
    if not rol or rol.get("nombre") != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")
    return usuario


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
    if usuario.get("rol") not in roles_permitidos:
        raise HTTPException(status_code=403, detail="No tienes permiso para realizar esta acción")


def _actor_admin(authorization: str | None) -> tuple[str, str]:
    """Retorna (actor_id, actor_tipo='admin')."""
    admin = _verificar_admin(authorization)
    return admin["id"], "admin"


def _actor_asociacion_o_admin(authorization: str | None) -> tuple[str, str]:
    """Endpoints de registro/revision los puede usar tanto una
    asociacion (actor_tipo='asociacion', el service valida coordinacion
    sobre el reporte) como un admin (actor_tipo='admin', sin
    restriccion). Se intenta primero como admin; si no lo es, se exige
    asociacion/staff."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    usuario = _obtener_usuario_autenticado(authorization)
    if usuario.get("rol") == "admin":
        return usuario["id"], "admin"
    _verificar_rol(usuario, ("asociacion", "staff"))
    return usuario["id"], "asociacion"


# ============================================================
# Traduccion de excepciones del service a HTTPException.
# ============================================================

def _ejecutar(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except PermisoDenegadoError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except IncidenteNoEncontradoError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IncidenteEnEstadoInvalidoError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        # Cubre postgrest.exceptions.APIError propagado desde las RPC de
        # 0049 (confirmar_incidente_atomico / revertir_incidente_atomico):
        # P0001 = condicion de carrera / estado invalido al momento exacto
        # de la RPC (ej. dos personas confirmando casi simultaneo) -> 409;
        # P0004 = intento de autoconfirmacion que se coló hasta la RPC -> 403.
        # A diferencia de recompensas_service.py (donde este caso queda sin
        # capturar y cae en 500 generico), aqui se captura explicitamente
        # porque la condicion de carrera es un caso esperable en produccion,
        # no una excepcion rara.
        codigo = getattr(e, "code", None) or (e.args[0].get("code") if e.args and isinstance(e.args[0], dict) else None)
        if PostgrestAPIError is not None and isinstance(e, PostgrestAPIError):
            if codigo == "P0004":
                raise HTTPException(status_code=403, detail="El usuario involucrado no puede confirmar su propio incidente")
            if codigo == "P0001":
                raise HTTPException(status_code=409, detail="El incidente ya no está disponible para esta operación")
        raise


# ============================================================
# Modelos
# ============================================================

class RegistrarIncidenteBody(BaseModel):
    usuario_id: str
    rol: str
    tipo_incidente: str
    descripcion: str
    reporte_id: str | None = None
    evidencias: list[str] = []


class RequiereInformacionBody(BaseModel):
    motivo: str


class RechazarIncidenteBody(BaseModel):
    motivo: str


class IncidenteResponse(BaseModel):
    id: str
    usuario_id: str
    rol: str
    reporte_id: str | None = None
    tipo_incidente: str
    descripcion: str
    evidencias: list = []
    registrado_por: str
    estado: str
    confirmado_por: str | None = None
    motivo_resolucion: str | None = None
    trust_score_movimiento_id: str | None = None
    creado_at: str
    actualizado_at: str
    resuelto_at: str | None = None


class TipoIncidenteResponse(BaseModel):
    clave: str
    valor_reduccion: int
    descripcion: str


# ============================================================
# Endpoints
# ============================================================

@router.post("", response_model=IncidenteResponse, status_code=201)
async def registrar_incidente(body: RegistrarIncidenteBody, authorization: str = Header(None)):
    """Asociacion (solo sobre casos bajo su coordinacion) o admin."""
    actor_id, actor_tipo = _actor_asociacion_o_admin(authorization)
    return _ejecutar(
        incidentes_service.registrar_incidente,
        usuario_id=body.usuario_id,
        rol=body.rol,
        tipo_incidente=body.tipo_incidente,
        descripcion=body.descripcion,
        registrado_por=actor_id,
        actor_tipo=actor_tipo,
        reporte_id=body.reporte_id,
        evidencias=body.evidencias,
    )


@router.patch("/{incidente_id}/requiere-informacion", response_model=IncidenteResponse)
async def marcar_requiere_informacion(incidente_id: str, body: RequiereInformacionBody, authorization: str = Header(None)):
    actor_id, actor_tipo = _actor_asociacion_o_admin(authorization)
    return _ejecutar(
        incidentes_service.marcar_requiere_informacion,
        incidente_id, actor_id, actor_tipo, body.motivo,
    )


@router.patch("/{incidente_id}/rechazar", response_model=IncidenteResponse)
async def rechazar_incidente(incidente_id: str, body: RechazarIncidenteBody, authorization: str = Header(None)):
    actor_id, actor_tipo = _actor_asociacion_o_admin(authorization)
    return _ejecutar(
        incidentes_service.rechazar_incidente,
        incidente_id, actor_id, actor_tipo, body.motivo,
    )


@router.patch("/{incidente_id}/confirmar", response_model=IncidenteResponse)
async def confirmar_incidente(incidente_id: str, authorization: str = Header(None)):
    """El usuario involucrado nunca puede llegar aqui como confirmador:
    validado en 3 capas (service, RPC, CHECK de la tabla)."""
    actor_id, actor_tipo = _actor_asociacion_o_admin(authorization)
    return _ejecutar(incidentes_service.confirmar_incidente, incidente_id, actor_id, actor_tipo)


@router.patch("/{incidente_id}/revertir", response_model=IncidenteResponse)
async def revertir_incidente(incidente_id: str, authorization: str = Header(None)):
    """Solo admin -- quien confirmo la sancion no puede deshacerla sin
    supervision externa."""
    admin_id, actor_tipo = _actor_admin(authorization)
    return _ejecutar(incidentes_service.revertir_incidente, incidente_id, admin_id, actor_tipo)


@router.get("/tipos", response_model=list[TipoIncidenteResponse])
async def obtener_tipos_incidente(rol: str, authorization: str = Header(None)):
    """Catalogo para poblar el formulario de registro en frontend.
    Cualquier usuario autenticado con permiso de registrar (asociacion o
    admin) puede consultarlo."""
    _actor_asociacion_o_admin(authorization)
    return incidentes_service.obtener_tipos_incidente(rol)