from fastapi import APIRouter, HTTPException, Header
from app.db.supabase import supabase
from app.models.voluntario import PostulacionRequest, CapacidadesRequest
from app.services.voluntario_service import (
    crear_postulacion,
    obtener_mi_voluntario,
    obtener_capacidades,
    guardar_capacidades,
    obtener_reportes_voluntario,
)

router = APIRouter()


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


@router.post("/postulaciones", status_code=201)
async def postularse_como_voluntario(body: PostulacionRequest, authorization: str = Header(None)):
    """El usuario logueado se postula como voluntario interno o externo de
    una asociación. Si ya existe un perfil de voluntario rechazado, esto
    cuenta como una re-postulación (numero_intento + 1)."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await crear_postulacion(
        usuario_id=usuario["id"],
        tipo=body.tipo.value,
        asociacion_id=body.asociacion_id,
    )


@router.get("/me", status_code=200)
async def get_mi_voluntario(authorization: str = Header(None)):
    """Estado actual del perfil de voluntario del usuario logueado (para la
    pantalla 'Mi postulación')."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_mi_voluntario(usuario["id"])


def _obtener_voluntario_id_propio(usuario_id: str) -> str:
    """Resuelve el id de voluntarios a partir del usuario logueado. Se usa en
    los endpoints de capacidades, que operan sobre el perfil de voluntario,
    no directamente sobre el usuario."""
    resultado = supabase.table("voluntarios").select("id").eq(
        "usuario_id", usuario_id
    ).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="No tienes un perfil de voluntario")

    return resultado.data[0]["id"]


@router.get("/me/capacidades", status_code=200)
async def get_mis_capacidades(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await obtener_capacidades(voluntario_id)


@router.put("/me/capacidades", status_code=200)
async def put_mis_capacidades(body: CapacidadesRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await guardar_capacidades(voluntario_id, body.model_dump())


@router.get("/me/reportes", status_code=200)
async def get_mis_reportes_voluntario(authorization: str = Header(None)):
    """Reemplaza GET /staff/me/reportes (migración staff -> voluntario_interno).
    Mismos 4 buckets (pendientes/en_accion/completados/historial), pero ya no
    exige rol 'staff' literal — cualquier voluntario activo (interno o
    externo) puede ver sus casos asignados."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_reportes_voluntario(usuario["id"])
