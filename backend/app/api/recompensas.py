from fastapi import APIRouter, Header
from app.db.supabase import supabase
from app.services.recompensas_service import (
    crear_recompensa,
    obtener_mis_recompensas,
    cambiar_estado_recompensa,
)
from app.models.recompensas import (
    RecompensaCreate,
    RecompensaResponse,
    RecompensaEstadoRequest,
)

router = APIRouter()


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

    resultado = supabase.table("usuarios").select("id").eq(
        "auth_user_id", auth_response.user.id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return {"id": resultado.data[0]["id"]}


@router.post("", status_code=201, response_model=RecompensaResponse)
async def crear_recompensa_endpoint(body: RecompensaCreate, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await crear_recompensa(usuario["id"], body)


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
    return await cambiar_estado_recompensa(recompensa_id, usuario["id"], body.accion)
