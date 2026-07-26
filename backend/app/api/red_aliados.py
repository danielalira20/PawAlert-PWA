from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
from app.services.red_aliados_service import (
    crear_contribucion,
    crear_oferta_proactiva,
    buscar_ofertas_compatibles,
    aceptar_sugerencia_general,
    obtener_mi_perfil_apoyo,
    obtener_impacto_aliado,
)
from app.models.red_aliados import (
    ContribucionRequest,
    ContribucionResponse,
    OfertaProactivaRequest,
    OfertaProactivaResponse,
    OfertaCompatibleResponse,
    AceptarOfertaGeneralRequest,
    AceptarOfertaGeneralResponse,
    PerfilApoyoMeResponse,
    ImpactoAliadoResponse,
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


@router.get("/me", status_code=200, response_model=PerfilApoyoMeResponse)
async def get_mi_perfil_apoyo(authorization: str = Header(None)):
    """FRONT03/BACK04 — chequeo de existencia, mismo patrón que
    GET /voluntarios/me: le dice a Mi Perfil si debe mostrar el segundo
    bloque de estadísticas (AliadoImpactStats) y con qué copy por tipo."""
    usuario = _obtener_usuario_autenticado(authorization)
    return obtener_mi_perfil_apoyo(usuario["id"])


@router.get("/me/impacto", status_code=200, response_model=ImpactoAliadoResponse)
async def get_mi_impacto_aliado(authorization: str = Header(None)):
    """Estadísticas de impacto del perfil_apoyo del usuario logueado —
    separado de GET /me a propósito (igual que /staff/me/reportes está
    separado de /voluntarios/me): /me es barato y se llama siempre,
    /me/impacto es la consulta pesada y solo se llama cuando /me dice
    tiene_perfil_apoyo=true."""
    usuario = _obtener_usuario_autenticado(authorization)
    return obtener_impacto_aliado(usuario["id"])


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


# ─── Motor de sugerencias, Ruta 2 (BACK03) — necesidades generales ───────

@router.get(
    "/necesidades/{necesidad_id}/ofertas-compatibles",
    status_code=200,
    response_model=list[OfertaCompatibleResponse],
)
async def get_ofertas_compatibles_endpoint(necesidad_id: str, authorization: str = Header(None)):
    _obtener_usuario_autenticado(authorization)
    return buscar_ofertas_compatibles(necesidad_id)


@router.post(
    "/necesidades/{necesidad_id}/aceptar-oferta",
    status_code=201,
    response_model=AceptarOfertaGeneralResponse,
)
async def aceptar_oferta_general_endpoint(
    necesidad_id: str, body: AceptarOfertaGeneralRequest, authorization: str = Header(None)
):
    usuario = _obtener_usuario_autenticado(authorization)

    necesidad = supabase.table("necesidades").select(
        "asociacion_id"
    ).eq("id", necesidad_id).execute()
    if not necesidad.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")
    if necesidad.data[0]["asociacion_id"] != usuario["asociacion_id"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para aceptar ofertas de esta necesidad"
        )

    return await aceptar_sugerencia_general(necesidad_id, body.oferta_id, body.cantidad)

@router.get("/necesidades/publicas", status_code=200)
def get_necesidades_publicas():
    """
    Endpoint público para la landing page ('Cómo ayudar').
    No requiere token de autenticación.
    """
    # 1. Hacemos la consulta a Supabase
    resultado = supabase.table("necesidades").select(
        "id, categoria, urgencia, cantidad_valor, cantidad_unidad, detalle, created_at, "
        "asociaciones(nombre, latitud, longitud), "
        "subcategoria_recurso(descripcion)"
    ).eq("estado", "activa").order("created_at", desc=True).execute()

    # 2. Formateamos la respuesta
    necesidades = []
    for row in resultado.data or []:
        necesidades.append({
            "id": row["id"],
            "categoria": row["categoria"],
            "urgencia": row["urgencia"],
            "cantidad_valor": row.get("cantidad_valor"),
            "cantidad_unidad": row.get("cantidad_unidad"),
            "detalle": row.get("detalle") or {},
            "created_at": row["created_at"],
            "asociaciones": {
                "nombre": row["asociaciones"]["nombre"] if row.get("asociaciones") else "Asociación Desconocida",
                "latitud": row["asociaciones"]["latitud"] if row.get("asociaciones") else None,
                "longitud": row["asociaciones"]["longitud"] if row.get("asociaciones") else None
            },
            "subcategoria_recurso": {
                "nombre": row["subcategoria_recurso"]["descripcion"] if row.get("subcategoria_recurso") else None
            }
        })

    return necesidades