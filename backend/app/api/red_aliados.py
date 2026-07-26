from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.report_service import obtener_id_catalogo
from app.services.red_aliados_service import (
    crear_contribucion,
    crear_oferta_proactiva,
    obtener_directorio_aliados,
    obtener_mural_impacto,
    crear_lote,
    obtener_mis_lotes,
    obtener_asociaciones_compatibles,
    invitar_asociaciones,
    obtener_invitaciones_asociacion,
    obtener_invitaciones_lote,
    responder_invitacion,
    obtener_qr_invitacion,
    confirmar_recepcion_qr,
)
from app.models.red_aliados import (
    ContribucionRequest,
    ContribucionResponse,
    OfertaProactivaRequest,
    OfertaProactivaResponse,
    LoteRequest,
    LoteResponse,
    InvitarAsociacionesRequest,
    ResponderInvitacionRequest,
    ConfirmarQrRequest,
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


@router.post("/lotes", status_code=201, response_model=LoteResponse)
async def crear_lote_endpoint(body: LoteRequest, authorization: str = Header(None)):
    """FRONT13 — registrar un lote físico (panel de aliado)."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await crear_lote(usuario["id"], body)


@router.get("/lotes/mios", status_code=200)
async def get_mis_lotes_endpoint(authorization: str = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_mis_lotes(usuario["id"])


@router.get("/lotes/{lote_id}/invitaciones", status_code=200)
async def get_invitaciones_lote_endpoint(lote_id: str, authorization: str = Header(None)):
    """Panel de aliado — estado de las invitaciones de un lote propio."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_invitaciones_lote(lote_id, usuario["id"])


@router.get("/lotes/{lote_id}/asociaciones-compatibles", status_code=200)
async def get_asociaciones_compatibles_endpoint(lote_id: str, authorization: str = Header(None)):
    """FRONT14 — asociaciones cercanas y compatibles para invitar."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_asociaciones_compatibles(lote_id, usuario["id"])


@router.post("/lotes/{lote_id}/invitar", status_code=201)
async def invitar_asociaciones_endpoint(lote_id: str, body: InvitarAsociacionesRequest, authorization: str = Header(None)):
    """FRONT14 — invitar asociaciones a aceptar su parte del lote."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await invitar_asociaciones(lote_id, usuario["id"], body)


@router.get("/invitaciones", status_code=200)
async def get_invitaciones_endpoint(authorization: str = Header(None)):
    """FRONT15 — invitaciones de lote recibidas por la asociación del
    usuario en sesión (panel de asociación)."""
    usuario = _obtener_usuario_autenticado(authorization)
    if not usuario["asociacion_id"]:
        raise HTTPException(status_code=403, detail="Tu usuario no pertenece a una asociación")
    return await obtener_invitaciones_asociacion(usuario["asociacion_id"])


@router.post("/invitaciones/{invitacion_id}/responder", status_code=200)
async def responder_invitacion_endpoint(invitacion_id: str, body: ResponderInvitacionRequest, authorization: str = Header(None)):
    """FRONT15 — aceptar o rechazar la parte del lote."""
    usuario = _obtener_usuario_autenticado(authorization)
    if not usuario["asociacion_id"]:
        raise HTTPException(status_code=403, detail="Tu usuario no pertenece a una asociación")
    return await responder_invitacion(invitacion_id, usuario["asociacion_id"], body)


@router.get("/invitaciones/{invitacion_id}/qr", status_code=200)
async def get_qr_invitacion_endpoint(invitacion_id: str, authorization: str = Header(None)):
    """BACK07 — código QR (token + vigencia) de una invitación aceptada."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_qr_invitacion(invitacion_id, usuario["id"])


@router.post("/qr/confirmar", status_code=200)
async def confirmar_qr_endpoint(body: ConfirmarQrRequest, authorization: str = Header(None)):
    """FRONT16 — escanear el QR y confirmar recepción."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await confirmar_recepcion_qr(body.token, usuario["id"])


@router.get("/directorio", status_code=200)
async def get_directorio_aliados():
    """FRONT17 — público, sin sesión. Lista/mapa de aliados con sello de
    verificación (verificado_admin=true)."""
    return await obtener_directorio_aliados()


@router.get("/mural", status_code=200)
async def get_mural_impacto():
    """FRONT17 — público, sin sesión. Historias de apoyo ya confirmado."""
    return await obtener_mural_impacto()
