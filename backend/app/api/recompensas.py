from fastapi import APIRouter, Header
from app.db.supabase import supabase
from app.services.recompensas_service import (
    crear_recompensa,
    obtener_mis_recompensas,
    cambiar_estado_recompensa,
    obtener_categorias_recompensa,
    eliminar_recompensa,
    emitir_canje,
    confirmar_canje,
    obtener_catalogo_recompensas,
)
from app.models.recompensas import (
    RecompensaCreate,
    RecompensaResponse,
    RecompensaEstadoRequest,
    CanjeEmitirRequest,
    CanjeConfirmarRequest,
    CanjeResponse,
    RecompensaCatalogoResponse,
)

router = APIRouter()


@router.get("/catalogo", status_code=200, response_model=list[RecompensaCatalogoResponse])
async def get_catalogo_recompensas_endpoint():
    """Catálogo público; no requiere sesión ni expone datos privados."""
    return obtener_catalogo_recompensas()


# Copia local, mismo patrón que red_aliados.py/reports.py/associations.py —
# la duplicación entre routers es intencional en este proyecto.
def _obtener_usuario_autenticado(authorization: str | None):
    from fastapi import HTTPException

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select("id, asociacion_id, roles(nombre)").eq(
        "auth_user_id", auth_response.user.id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }


def _rechazar_panel_asociacion(usuario: dict) -> None:
    if usuario.get("asociacion_id") or usuario.get("rol") == "asociacion":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Las asociaciones no pueden administrar recompensas desde su panel institucional")


@router.post("", status_code=201, response_model=RecompensaResponse)
async def crear_recompensa_endpoint(body: RecompensaCreate, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _rechazar_panel_asociacion(usuario)
    return await crear_recompensa(usuario["id"], body)


@router.get("/categorias", status_code=200)
async def get_categorias_recompensa_endpoint(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _rechazar_panel_asociacion(usuario)
    return obtener_categorias_recompensa(usuario["id"])


@router.post("/canjes", status_code=201, response_model=CanjeResponse)
async def emitir_canje_endpoint(body: CanjeEmitirRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return emitir_canje(body.recompensa_id, usuario["id"])


@router.post("/canjes/confirmar", status_code=200, response_model=CanjeResponse)
async def confirmar_canje_endpoint(body: CanjeConfirmarRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _rechazar_panel_asociacion(usuario)
    return confirmar_canje(body.codigo, usuario["id"])


@router.get("/mias", status_code=200, response_model=list[RecompensaResponse])
async def get_mis_recompensas_endpoint(estado: str | None = None, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_mis_recompensas(usuario["id"], estado)


@router.patch("/{recompensa_id}/estado", status_code=200, response_model=RecompensaResponse)
async def cambiar_estado_recompensa_endpoint(
    recompensa_id: str,
    body: RecompensaEstadoRequest,
    authorization: str = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _rechazar_panel_asociacion(usuario)
    return await cambiar_estado_recompensa(recompensa_id, usuario["id"], body.accion)


@router.delete("/{recompensa_id}", status_code=204)
async def eliminar_recompensa_endpoint(recompensa_id: str, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _rechazar_panel_asociacion(usuario)
    eliminar_recompensa(recompensa_id, usuario["id"])
