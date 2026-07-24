from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
from app.services.red_aliados_service import crear_contribucion, crear_oferta_proactiva
from app.models.red_aliados import (
    ContribucionRequest,
    ContribucionResponse,
    OfertaProactivaRequest,
    OfertaProactivaResponse,
)

router = APIRouter()


# Copia local, mismo patrón que reports.py/associations.py — la
# duplicación entre routers es intencional en este proyecto, no se
# refactoriza a un helper compartido.
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


@router.get("/categorias", status_code=200)
async def get_categorias_recurso():
    resultado = supabase.table("categoria_recurso").select(
        "id, clave, descripcion"
    ).eq("activo", True).execute()
    return resultado.data


@router.get("/subcategorias/{categoria_clave}", status_code=200)
async def get_subcategorias_recurso(categoria_clave: str):
    categoria_id = obtener_id_catalogo("categoria_recurso", categoria_clave)
    if not categoria_id:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    resultado = supabase.table("subcategoria_recurso").select(
        "id, clave, descripcion, especies_aplicables, requiere_tamanio"
    ).eq("categoria_id", categoria_id).eq("activo", True).execute()
    return resultado.data


@router.post("/foto", status_code=200)
async def subir_foto_recurso(foto: UploadFile = File(...), authorization: str = Header(None)):
    """Sube la evidencia fotográfica (opcional) del Formulario 3 y regresa
    la URL — el frontend la incluye luego dentro de `detalle.foto_url` al
    mandar POST /red-aliados/contribuciones o /ofertas-proactivas."""
    _obtener_usuario_autenticado(authorization)

    if foto.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/webp"]:
        raise HTTPException(status_code=422, detail="La foto debe ser JPG, PNG o WEBP")

    foto_url = await subir_foto(foto, carpeta="recursos-aliados")
    return {"foto_url": foto_url}


@router.post("/contribuciones", status_code=201, response_model=ContribucionResponse)
async def crear_contribucion_endpoint(body: ContribucionRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await crear_contribucion(usuario["id"], body)


@router.post("/ofertas-proactivas", status_code=201, response_model=OfertaProactivaResponse)
async def crear_oferta_proactiva_endpoint(body: OfertaProactivaRequest, authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await crear_oferta_proactiva(usuario["id"], body)
