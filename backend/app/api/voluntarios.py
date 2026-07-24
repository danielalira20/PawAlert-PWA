from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from app.db.supabase import supabase
from app.models.voluntario import PostulacionRequest, CapacidadesRequest
import json

from app.services.voluntario_service import (
    crear_postulacion,
    obtener_mi_voluntario,
    obtener_capacidades,
    guardar_capacidades,
    obtener_reportes_voluntario,
    crear_perfil_externo,
    obtener_perfil_externo,
)
from app.services.home_verification_service import finalizar_postulacion_externa

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
    # mode="json" convierte los Enum del contrato v2 a las claves de texto
    # que se persisten en PostgreSQL.
    return await guardar_capacidades(
        voluntario_id,
        body.model_dump(mode="json", exclude_unset=True),
    )


@router.get("/me/reportes", status_code=200)
async def get_mis_reportes_voluntario(authorization: str = Header(None)):
    """Reemplaza GET /staff/me/reportes (migración staff -> voluntario_interno).
    Mismos 4 buckets (pendientes/en_accion/completados/historial), pero ya no
    exige rol 'staff' literal — cualquier voluntario activo (interno o
    externo) puede ver sus casos asignados."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_reportes_voluntario(usuario["id"])


# ---------------------------------------------------------------------------
# NUEVO ENDPOINT: POSTULACIÓN VOLUNTARIO EXTERNO (CASA TEMPORAL)
# ---------------------------------------------------------------------------
@router.get("/externo/perfil", status_code=200)
async def get_perfil_voluntario_externo(
    authorization: str = Header(None),
):
    """Devuelve el borrador de casa temporal para editar o re-postular."""
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await obtener_perfil_externo(voluntario_id)


@router.post("/externo/postular", status_code=201)
async def postular_voluntario_externo(
    datos: str = Form(...),
    identificacion: UploadFile | None = File(None),
    video: UploadFile | None = File(None),
    authorization: str = Header(None)
):
    """Crea o actualiza el formulario de casa temporal y sus evidencias."""
    
    usuario = _obtener_usuario_autenticado(authorization)

    # 1. Asegurar que el usuario tenga un registro base en "voluntarios"
    resultado = supabase.table("voluntarios").select("id").eq("usuario_id", usuario["id"]).execute()
    
    if resultado.data:
        voluntario_id = resultado.data[0]["id"]
    else:
        nuevo = supabase.table("voluntarios").insert({
            "usuario_id": usuario["id"],
            "estado": "postulacion_pendiente"
        }).execute()
        voluntario_id = nuevo.data[0]["id"]

    # 2. Parsear el string JSON a diccionario de Python
    try:
        datos_json = json.loads(datos)
    except Exception:
        raise HTTPException(status_code=400, detail="El campo 'datos' no tiene un formato válido.")

    # 3. Enviar todo al servicio de lógica
    try:
        perfil = await crear_perfil_externo(
            voluntario_id=voluntario_id,
            datos_json=datos_json,
            identificacion_file=identificacion,
            video_file=video
        )
        return {
            "message": "Postulación como casa temporal recibida con éxito", 
            "perfil_id": perfil["id"]
        }
    except HTTPException:
        raise
    except Exception as e:
        # Esto atrapará errores de Supabase (como intentar postularse dos veces) o de storage
        raise HTTPException(status_code=400, detail=f"Error al guardar postulación: {str(e)}")


@router.post("/externo/finalizar", status_code=201)
async def finalizar_postulacion_voluntario_externo(
    authorization: str = Header(None),
):
    """Finaliza el expediente después de guardar casa y capacidades.

    Asigna la postulación a la asociación activa y verificada más cercana y
    crea el proceso de verificación de hogar. Repetir la petición no duplica
    el expediente.
    """
    usuario = _obtener_usuario_autenticado(authorization)
    voluntario_id = _obtener_voluntario_id_propio(usuario["id"])
    return await finalizar_postulacion_externa(voluntario_id)
