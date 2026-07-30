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
    cambiar_estado_lote,
    obtener_asociaciones_compatibles,
    invitar_asociaciones,
    obtener_invitaciones_asociacion,
    obtener_invitaciones_lote,
    responder_invitacion,
    obtener_qr_invitacion,
    confirmar_recepcion_qr_generico,
    obtener_qr_contribucion,
    obtener_mis_contribuciones,
    obtener_necesidades_contribuidas,
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
    LoteRequest,
    LoteResponse,
    InvitarAsociacionesRequest,
    EstadoLoteRequest,
    ResponderInvitacionRequest,
    ConfirmarQrRequest,
    OfertaCompatibleResponse,
    AceptarOfertaGeneralRequest,
    AceptarOfertaGeneralResponse,
    PerfilApoyoMeResponse,
    ImpactoAliadoResponse,
)
from datetime import datetime

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


@router.patch("/lotes/{lote_id}/estado", status_code=200)
async def cambiar_estado_lote_endpoint(
    lote_id: str,
    body: EstadoLoteRequest,
    authorization: str = Header(None),
):
    """El aliado retira o reactiva un lote sin eliminar su historial."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await cambiar_estado_lote(lote_id, usuario["id"], body.activo)


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
    """FRONT16 — escanear el QR y confirmar recepción. Sirve tanto para
    QR de lotes como de contribuciones normales — confirmar_recepcion_qr_generico
    resuelve cuál de las dos tablas es dueña del token."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await confirmar_recepcion_qr_generico(body.token, usuario["id"])


@router.get("/me/contribuciones/{contribucion_id}/qr", status_code=200)
async def get_qr_contribucion_endpoint(contribucion_id: str, authorization: str = Header(None)):
    """Código QR (token + vigencia) de una contribución normal ya
    aceptada — análogo a GET /invitaciones/{id}/qr para lotes."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_qr_contribucion(contribucion_id, usuario["id"])


@router.get("/me/contribuciones", status_code=200)
async def get_mis_contribuciones_endpoint(tab: str = "pendientes", authorization: str = Header(None)):
    """Panel de aliado — 'Mis aportaciones' (contribuciones propias que
    no vinieron de un lote, esas se ven en Mis Lotes)."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_mis_contribuciones(usuario["id"], tab)


@router.get("/me/necesidades-contribuidas", status_code=200)
async def get_necesidades_contribuidas_endpoint(authorization: str = Header(None)):
    """Badge 'Ya ofreciste ayuda' en Cómo ayudar — no toca el endpoint
    público /necesidades/publicas, es una consulta aparte que el
    frontend cruza en cliente."""
    usuario = _obtener_usuario_autenticado(authorization)
    return await obtener_necesidades_contribuidas(usuario["id"])


@router.get("/directorio", status_code=200)
async def get_directorio_aliados():
    """FRONT17 — público, sin sesión. Lista/mapa de aliados con sello de
    verificación (verificado_admin=true)."""
    return await obtener_directorio_aliados()


@router.get("/mural", status_code=200)
async def get_mural_impacto():
    """FRONT17 — público, sin sesión. Historias de apoyo ya confirmado."""
    return await obtener_mural_impacto()


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


# Registrado DESPUÉS de /necesidades/publicas a propósito: FastAPI matchea
# rutas en orden de declaración y ambos paths tienen un solo segmento tras
# /necesidades — si este fuera primero, capturaría también
# necesidad_id="publicas".
@router.get("/necesidades/{necesidad_id}", status_code=200)
async def get_necesidad_detalle(necesidad_id: str, authorization: str = Header(None)):
    """Detalle de una necesidad para quien va a aportarle
    (AportacionFormScreen, vieneDeNecesidad) — no es parte del motor de
    sugerencias, solo lectura de la fila para armar la tarjeta de resumen."""
    _obtener_usuario_autenticado(authorization)

    resultado = supabase.table("necesidades").select(
        "id, categoria, urgencia, cantidad_valor, cantidad_unidad, detalle, asociacion_id, "
        "subcategoria_recurso(id, clave, descripcion, requiere_tamanio), "
        "asociaciones(nombre, calle, colonia, municipio, referencia, latitud, longitud)"
    ).eq("id", necesidad_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")

    return resultado.data[0]


# tipo -> mensaje amigable. 'oferta_aceptada' no es un "match" (el aliado
# ya envió su oferta y fue aceptada), así que necesita texto propio; el
# resto de tipos ('necesidad_disponible', 'proximidad', ...) sigue con el
# genérico de siempre.
MENSAJES_POR_TIPO_NOTIFICACION = {
    "oferta_aceptada": "¡Tu oferta de ayuda fue aceptada!",
}


@router.get("/me/notificaciones", status_code=200)
def get_notificaciones_aliado(resuelta: bool | None = None, authorization: str = Header(None)):
    """
    FRONT09: Obtiene la lista de notificaciones de match para el aliado logueado.
    `resuelta` filtra Nuevas (false) / Resueltas (true) cuando se manda.
    """
    usuario = _obtener_usuario_autenticado(authorization)

    # 1. Obtenemos el perfil de apoyo del usuario logueado
    perfil_res = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario["id"]).execute()

    if not perfil_res.data:
        return [] # Si no es un aliado registrado, devolvemos lista vacía

    perfil_apoyo_id = perfil_res.data[0]["id"]

    # 2. Consultamos usando 'tipo' en lugar de 'mensaje'
    query = supabase.table("notificaciones_aliado").select(
        "id, necesidad_id, tipo, leida, resuelta, created_at, "
        "necesidades(categoria, asociaciones(nombre))"
    ).eq("perfil_apoyo_id", perfil_apoyo_id)
    if resuelta is not None:
        query = query.eq("resuelta", resuelta)
    noti_res = query.order("created_at", desc=True).execute()

    # 3. Formateamos la respuesta para la pantalla FRONT09
    notificaciones = []
    for row in noti_res.data or []:
        necesidad = row.get("necesidades") or {}
        asociacion = necesidad.get("asociaciones") or {}

        fecha_raw = row.get("created_at")
        fecha_str = fecha_raw[:10] if fecha_raw else "Reciente"

        # Generamos un mensaje amigable basándonos en el tipo de notificación
        tipo_notificacion = row.get("tipo", "compatibilidad")
        mensaje_dinamico = MENSAJES_POR_TIPO_NOTIFICACION.get(
            tipo_notificacion,
            f"¡Match encontrado por {tipo_notificacion}! Tienes una necesidad compatible.",
        )

        notificaciones.append({
            "id": row["id"],
            "necesidad_id": row["necesidad_id"],
            "tipo": tipo_notificacion,
            "resuelta": row.get("resuelta", False),
            "asociacion_nombre": asociacion.get("nombre", "Asociación Desconocida"),
            "categoria": necesidad.get("categoria", "Recurso solicitado"),
            "mensaje": mensaje_dinamico,
            "leida": row.get("leida", False),
            "fecha": fecha_str
        })

    return notificaciones

@router.patch("/me/notificaciones/{notificacion_id}/leer", status_code=200)
def marcar_notificacion_leida(notificacion_id: str, authorization: str = Header(None)):
    """
    FRONT12: Marca una notificación específica como leída cuando el aliado la abre.
    """
    usuario = _obtener_usuario_autenticado(authorization)

    # 1. Validar que el usuario tiene un perfil de apoyo
    perfil_res = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario["id"]).execute()
    if not perfil_res.data:
        raise HTTPException(status_code=403, detail="No eres un aliado registrado")
    
    perfil_apoyo_id = perfil_res.data[0]["id"]

    # 2. Actualizar la notificación a leída asegurando que le pertenezca a este aliado
    res = supabase.table("notificaciones_aliado").update({"leida": True}).eq(
        "id", notificacion_id
    ).eq("perfil_apoyo_id", perfil_apoyo_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Notificación no encontrada o acceso denegado")

    return {"status": "success", "leida": True}


@router.get("/ofertas-proactivas/mias")
async def listar_mis_ofertas_proactivas(authorization: str = Header(None)):
    usuario =  _obtener_usuario_autenticado(authorization)

    perfil = supabase.table("perfil_apoyo").select("id").eq(
        "usuario_id", usuario["id"]
    ).execute()

    if not perfil.data:
        return {"ofertas": []}

    perfil_apoyo_id = perfil.data[0]["id"]

    ofertas = supabase.table("ofertas_proactivas").select(
        "id, categoria, capacidad_declarada, capacidad_disponible, unidad, activa, created_at, "
        "detalle,subcategoria_recurso(descripcion)"
    ).eq("perfil_apoyo_id", perfil_apoyo_id).order("created_at", desc=True).execute()

    return {"ofertas": ofertas.data or []}

@router.patch("/ofertas-proactivas/{oferta_id}/estado")
async def cambiar_estado_oferta_proactiva(
    oferta_id: str, body: dict, authorization: str = Header(None)
):
    usuario =  _obtener_usuario_autenticado(authorization)
    nuevo_activo = body.get("activa")

    oferta = supabase.table("ofertas_proactivas").select(
        "id, perfil_apoyo_id, perfil_apoyo(usuario_id)"
    ).eq("id", oferta_id).execute()

    if not oferta.data:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")

    if oferta.data[0]["perfil_apoyo"]["usuario_id"] != usuario["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre esta oferta")

    # Regla de negocio: no pausar si tiene contribuciones activas esperando
    if nuevo_activo is False:
        pendientes = supabase.table("contribuciones").select("id").eq(
            "oferta_proactiva_id", oferta_id
        ).in_("estado", ["comprometida", "confirmada", "parcial"]).execute()

        if pendientes.data:
            raise HTTPException(
                status_code=400,
                detail="No puedes pausar esta oferta: tiene compromisos activos pendientes de completarse.",
            )

    actualizado = supabase.table("ofertas_proactivas").update({
        "activa": nuevo_activo
    }).eq("id", oferta_id).execute()

    return actualizado.data[0]
