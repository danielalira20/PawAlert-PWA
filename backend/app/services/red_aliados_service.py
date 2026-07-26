from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from app.db.supabase import supabase
from app.services.report_service import obtener_id_catalogo
from app.models.red_aliados import (
    ContribucionRequest,
    OfertaProactivaRequest,
    LoteRequest,
    InvitarAsociacionesRequest,
    ResponderInvitacionRequest,
)

# BACK07: vigencia del QR de recepción tras aceptar una invitación de lote.
VIGENCIA_QR_DIAS = 7


def _nombre_publico(nombre: str | None, apellido: str | None, datos_extra: dict | None, preferencia_visibilidad: str | None) -> str:
    """Mismo criterio de anonimato en directorio y mural — un
    donante_comunitario puede pedir no aparecer con su nombre real
    (preferencia_visibilidad = 'anonimo'); aliado_local/patrocinador casi
    siempre prefieren visibilidad (es parte del incentivo del sello)."""
    if preferencia_visibilidad == "anonimo":
        return "Aliado anónimo"
    razon_social = (datos_extra or {}).get("razon_social")
    if razon_social:
        return razon_social
    completo = f"{nombre or ''} {apellido or ''}".strip()
    return completo or "Aliado PawAlert"


def _validar_subcategoria(subcategoria_id: str, categoria: str) -> None:
    """Valida que subcategoria_id exista, esté activa, y pertenezca a la
    categoria declarada — subcategoria_id es str (no Enum) porque
    subcategoria_recurso puede crecer sin deploy, así que se checa contra
    la tabla en tiempo de ejecución en vez de contra un set fijo."""
    categoria_id = obtener_id_catalogo("categoria_recurso", categoria)
    if not categoria_id:
        raise HTTPException(status_code=500, detail="Error al resolver catálogo de categoría")

    resultado = supabase.table("subcategoria_recurso").select("id, categoria_id").eq(
        "id", subcategoria_id
    ).eq("activo", True).execute()

    if not resultado.data:
        raise HTTPException(status_code=422, detail="Subcategoría no válida")

    if resultado.data[0]["categoria_id"] != categoria_id:
        raise HTTPException(
            status_code=422,
            detail="La subcategoría no pertenece a la categoría seleccionada"
        )


def _empacar_detalle(body: ContribucionRequest | OfertaProactivaRequest, incluir_categoria: bool = False) -> dict:
    """Junta en `detalle` (jsonb) los campos del 'paso común' que no tienen
    columna propia en la tabla destino — ver nota de mapeo de columnas en
    crear_contribucion/crear_oferta_proactiva."""
    detalle = dict(body.detalle or {})
    if incluir_categoria:
        detalle.setdefault("categoria", body.categoria.value)
    if body.especies_aplica:
        detalle.setdefault("especies_aplica", [e.value for e in body.especies_aplica])
    if body.fecha_disponibilidad:
        detalle.setdefault("fecha_disponibilidad", body.fecha_disponibilidad)
    if body.lugar_entrega:
        detalle.setdefault("lugar_entrega", body.lugar_entrega)
    if body.forma_entrega:
        detalle.setdefault("forma_entrega", body.forma_entrega)
    if body.vigencia:
        detalle.setdefault("vigencia", body.vigencia)
    return detalle


async def crear_contribucion(usuario_id: str, body: ContribucionRequest) -> dict:
    necesidad = supabase.table("necesidades").select("id, estado").eq(
        "id", body.necesidad_id
    ).execute()
    if not necesidad.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")
    if necesidad.data[0]["estado"] != "activa":
        raise HTTPException(status_code=400, detail="Esta necesidad ya no está activa")

    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    # `contribuciones` no tiene columna `categoria` (solo `subcategoria_id`,
    # de donde se puede derivar) — se guarda también en `detalle` para no
    # perder el dato que sí mandó el formulario.
    detalle = _empacar_detalle(body, incluir_categoria=True)

    resultado = supabase.table("contribuciones").insert({
        "necesidad_id": body.necesidad_id,
        "usuario_id": usuario_id,
        "cantidad_valor": body.cantidad_valor,
        "cantidad_unidad": body.cantidad_unidad,
        "modo": "reactiva",
        "oferta_proactiva_id": body.oferta_proactiva_id,
        "subcategoria_id": body.subcategoria_id,
        "detalle": detalle,
    }).execute()

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "necesidad_id": fila["necesidad_id"],
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }


async def crear_oferta_proactiva(usuario_id: str, body: OfertaProactivaRequest) -> dict:
    perfil = supabase.table("perfil_apoyo").select("id, tipo").eq(
        "usuario_id", usuario_id
    ).execute()
    if not perfil.data:
        raise HTTPException(
            status_code=403,
            detail="Necesitas un perfil de aliado para ofrecer disponibilidad proactiva"
        )

    # Regla de negocio #4 (flujo-red-aliados-pawalert.md): el modo
    # proactivo es exclusivo de aliado_local / patrocinador_institucional,
    # nunca de donante_comunitario.
    if perfil.data[0]["tipo"] == "donante_comunitario":
        raise HTTPException(
            status_code=403,
            detail="El modo proactivo no está disponible para donantes comunitarios"
        )

    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    # `ofertas_proactivas` sí tiene columna `categoria` (varchar) — no hace
    # falta duplicarla en `detalle` como en contribuciones.
    detalle = _empacar_detalle(body, incluir_categoria=False)

    resultado = supabase.table("ofertas_proactivas").insert({
        "perfil_apoyo_id": perfil.data[0]["id"],
        "categoria": body.categoria.value,
        "capacidad_declarada": body.capacidad_declarada,
        "capacidad_disponible": body.capacidad_declarada,
        "unidad": body.unidad,
        "frecuencia": body.frecuencia,
        "subcategoria_id": body.subcategoria_id,
        "detalle": detalle,
    }).execute()

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "categoria": fila["categoria"],
        "capacidad_declarada": fila["capacidad_declarada"],
        "capacidad_disponible": fila["capacidad_disponible"],
        "unidad": fila["unidad"],
        "activa": fila["activa"],
        "created_at": str(fila["created_at"]),
    }


# ---------------------------------------------------------------------------
# FRONT13/14/15/16 + BACK07 — Lotes físicos, reparto entre asociaciones y
# confirmación de recepción por QR.
# ---------------------------------------------------------------------------

def _obtener_perfil_apoyo_o_falla(usuario_id: str) -> dict:
    """Mismo requisito que crear_oferta_proactiva: solo aliado_local /
    patrocinador_institucional pueden registrar lotes (regla de negocio
    #4) — un donante_comunitario no maneja volumen suficiente para
    justificar el flujo de reparto entre varias asociaciones."""
    perfil = supabase.table("perfil_apoyo").select("id, tipo, usuario_id").eq(
        "usuario_id", usuario_id
    ).execute()
    if not perfil.data:
        raise HTTPException(
            status_code=403,
            detail="Necesitas un perfil de aliado para registrar un lote"
        )
    if perfil.data[0]["tipo"] == "donante_comunitario":
        raise HTTPException(
            status_code=403,
            detail="Registrar lotes no está disponible para donantes comunitarios"
        )
    return perfil.data[0]


async def crear_lote(usuario_id: str, body: LoteRequest) -> dict:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)
    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    resultado = supabase.table("lotes").insert({
        "perfil_apoyo_id": perfil["id"],
        "categoria": body.categoria.value,
        "subcategoria_id": body.subcategoria_id,
        "especies_aplica": [e.value for e in body.especies_aplica],
        "cantidad_valor": body.cantidad_valor,
        "cantidad_unidad": body.cantidad_unidad,
        "tipo_empaque": body.tipo_empaque,
        "divisible": body.divisible.value,
        "max_asociaciones": body.max_asociaciones,
        "forma_entrega": body.forma_entrega.value,
        "descripcion": body.descripcion,
    }).execute()

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "categoria": fila["categoria"],
        "subcategoria_id": fila["subcategoria_id"],
        "cantidad_valor": fila["cantidad_valor"],
        "cantidad_unidad": fila["cantidad_unidad"],
        "tipo_empaque": fila["tipo_empaque"],
        "divisible": fila["divisible"],
        "max_asociaciones": fila["max_asociaciones"],
        "forma_entrega": fila["forma_entrega"],
        "created_at": str(fila["created_at"]),
    }


async def obtener_mis_lotes(usuario_id: str) -> list:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)
    resultado = supabase.table("lotes").select(
        "id, categoria, subcategoria_id, cantidad_valor, cantidad_unidad, "
        "tipo_empaque, divisible, max_asociaciones, forma_entrega, created_at, "
        "subcategoria_recurso(descripcion), "
        "lote_asociaciones(id, estado)"
    ).eq("perfil_apoyo_id", perfil["id"]).order("created_at", desc=True).execute()

    lotes = []
    for l in resultado.data:
        invitaciones = l.get("lote_asociaciones") or []
        lotes.append({
            "id": l["id"],
            "categoria": l["categoria"],
            "subcategoria_descripcion": (l.get("subcategoria_recurso") or {}).get("descripcion"),
            "cantidad_valor": l["cantidad_valor"],
            "cantidad_unidad": l["cantidad_unidad"],
            "tipo_empaque": l["tipo_empaque"],
            "divisible": l["divisible"],
            "max_asociaciones": l["max_asociaciones"],
            "forma_entrega": l["forma_entrega"],
            "created_at": str(l["created_at"]),
            "asociaciones_invitadas": len(invitaciones),
            "asociaciones_aceptadas": len([i for i in invitaciones if i["estado"] in ("aceptada", "confirmada")]),
        })
    return lotes


async def _obtener_lote_propio_o_falla(lote_id: str, usuario_id: str) -> dict:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)
    lote = supabase.table("lotes").select(
        "id, perfil_apoyo_id, especies_aplica, max_asociaciones"
    ).eq("id", lote_id).execute()
    if not lote.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    if lote.data[0]["perfil_apoyo_id"] != perfil["id"]:
        raise HTTPException(status_code=403, detail="Este lote no te pertenece")
    return lote.data[0]


async def obtener_asociaciones_compatibles(lote_id: str, usuario_id: str) -> list:
    """FRONT14 — asociaciones activas/verificadas dentro del radio de
    cobertura que declararon, ordenadas por cercanía al aliado."""
    lote = await _obtener_lote_propio_o_falla(lote_id, usuario_id)
    especies = lote.get("especies_aplica") or None

    resultado = supabase.rpc("asociaciones_compatibles_lote", {
        "p_perfil_apoyo_id": lote["perfil_apoyo_id"],
        "p_especies": especies,
    }).execute()

    return [
        {
            "id": a["id"],
            "nombre": a["nombre"],
            "distancia_km": a["distancia_km"],
        }
        for a in resultado.data
    ]


async def invitar_asociaciones(lote_id: str, usuario_id: str, body: InvitarAsociacionesRequest) -> list:
    lote = await _obtener_lote_propio_o_falla(lote_id, usuario_id)

    ya_invitadas = supabase.table("lote_asociaciones").select("id").eq("lote_id", lote_id).execute()
    cupo_restante = lote["max_asociaciones"] - len(ya_invitadas.data)
    if len(body.asociacion_ids) > cupo_restante:
        raise HTTPException(
            status_code=400,
            detail=f"Este lote solo admite {cupo_restante} asociación(es) más"
        )

    filas = [{"lote_id": lote_id, "asociacion_id": aid} for aid in body.asociacion_ids]
    resultado = supabase.table("lote_asociaciones").insert(filas).execute()
    return [{"id": f["id"], "asociacion_id": f["asociacion_id"], "estado": f["estado"]} for f in resultado.data]


async def obtener_invitaciones_lote(lote_id: str, usuario_id: str) -> list:
    """Panel de aliado — estado de cada invitación de un lote propio
    (para saber quién aceptó y poder mostrarle su QR)."""
    await _obtener_lote_propio_o_falla(lote_id, usuario_id)

    resultado = supabase.table("lote_asociaciones").select(
        "id, estado, cantidad_asignada, created_at, token_expira_at, "
        "asociaciones(nombre)"
    ).eq("lote_id", lote_id).order("created_at", desc=True).execute()

    return [
        {
            "id": i["id"],
            "estado": i["estado"],
            "cantidad_asignada": i.get("cantidad_asignada"),
            "created_at": str(i["created_at"]),
            "token_expira_at": str(i["token_expira_at"]) if i.get("token_expira_at") else None,
            "asociacion_nombre": (i.get("asociaciones") or {}).get("nombre"),
        }
        for i in resultado.data
    ]


# ---------------------------------------------------------------------------
# FRONT15 — Aceptar/rechazar la invitación (panel de asociación)
# ---------------------------------------------------------------------------

async def obtener_invitaciones_asociacion(asociacion_id: str) -> list:
    resultado = supabase.table("lote_asociaciones").select(
        "id, estado, cantidad_asignada, created_at, respondida_at, confirmada_at, "
        "lotes(id, categoria, cantidad_valor, cantidad_unidad, tipo_empaque, "
        "forma_entrega, descripcion, subcategoria_recurso(descripcion), "
        "perfil_apoyo(datos_extra, preferencia_visibilidad, usuarios(nombre, apellido_paterno)))"
    ).eq("asociacion_id", asociacion_id).order("created_at", desc=True).execute()

    invitaciones = []
    for i in resultado.data:
        lote = i.get("lotes") or {}
        perfil = lote.get("perfil_apoyo") or {}
        usuario = perfil.get("usuarios") or {}
        invitaciones.append({
            "id": i["id"],
            "estado": i["estado"],
            "cantidad_asignada": i.get("cantidad_asignada"),
            "created_at": str(i["created_at"]),
            "lote": {
                "id": lote.get("id"),
                "categoria": lote.get("categoria"),
                "subcategoria_descripcion": (lote.get("subcategoria_recurso") or {}).get("descripcion"),
                "cantidad_valor": lote.get("cantidad_valor"),
                "cantidad_unidad": lote.get("cantidad_unidad"),
                "tipo_empaque": lote.get("tipo_empaque"),
                "forma_entrega": lote.get("forma_entrega"),
                "descripcion": lote.get("descripcion"),
                "aliado_nombre": _nombre_publico(
                    usuario.get("nombre"), usuario.get("apellido_paterno"),
                    perfil.get("datos_extra"), perfil.get("preferencia_visibilidad"),
                ),
            },
        })
    return invitaciones


async def responder_invitacion(invitacion_id: str, asociacion_id: str, body: ResponderInvitacionRequest) -> dict:
    invitacion = supabase.table("lote_asociaciones").select(
        "id, asociacion_id, estado, lote_id, lotes(perfil_apoyo_id, subcategoria_id, cantidad_valor, cantidad_unidad, perfil_apoyo(usuario_id))"
    ).eq("id", invitacion_id).execute()
    if not invitacion.data:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")

    fila = invitacion.data[0]
    if fila["asociacion_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Esta invitación no es para tu asociación")
    if fila["estado"] != "invitada":
        raise HTTPException(status_code=400, detail="Esta invitación ya fue respondida")

    ahora = datetime.now(timezone.utc)

    if not body.aceptar:
        supabase.table("lote_asociaciones").update({
            "estado": "rechazada",
            "respondida_at": ahora.isoformat(),
        }).eq("id", invitacion_id).execute()
        return {"id": invitacion_id, "estado": "rechazada"}

    lote = fila["lotes"]
    token_expira_at = ahora + timedelta(days=VIGENCIA_QR_DIAS)

    supabase.table("lote_asociaciones").update({
        "estado": "aceptada",
        "cantidad_asignada": body.cantidad_asignada or lote["cantidad_valor"],
        "respondida_at": ahora.isoformat(),
        "token_expira_at": token_expira_at.isoformat(),
    }).eq("id", invitacion_id).execute()

    # Se crea la contribución en cuanto se acepta (no hasta confirmar
    # recepción) — mismo criterio que "comprometida" en el flujo reactivo:
    # confirmar_recepcion_qr (FRONT16) la pasa a 'confirmada' después.
    supabase.table("contribuciones").insert({
        "usuario_id": lote["perfil_apoyo"]["usuario_id"],
        "modo": "lote",
        "lote_asociacion_id": invitacion_id,
        "subcategoria_id": lote["subcategoria_id"],
        "cantidad_valor": body.cantidad_asignada or lote["cantidad_valor"],
        "cantidad_unidad": lote["cantidad_unidad"],
    }).execute()

    return {"id": invitacion_id, "estado": "aceptada", "token_expira_at": token_expira_at.isoformat()}


# ---------------------------------------------------------------------------
# BACK07 + FRONT16 — QR de recepción con vigencia limitada
# ---------------------------------------------------------------------------

async def obtener_qr_invitacion(invitacion_id: str, usuario_id: str) -> dict:
    """BACK07 — el token ya se generó al crear la fila (default
    gen_random_uuid()); esto solo lo expone una vez la invitación fue
    aceptada y valida que quien lo pide sea parte de la operación (el
    aliado dueño del lote o la asociación invitada)."""
    invitacion = supabase.table("lote_asociaciones").select(
        "id, estado, token, token_usado, token_expira_at, asociacion_id, "
        "lotes(perfil_apoyo(usuario_id))"
    ).eq("id", invitacion_id).execute()
    if not invitacion.data:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")

    fila = invitacion.data[0]
    if fila["estado"] not in ("aceptada", "confirmada"):
        raise HTTPException(status_code=400, detail="Esta invitación todavía no fue aceptada")

    lote_usuario_id = (fila.get("lotes") or {}).get("perfil_apoyo", {}).get("usuario_id")
    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", usuario_id).execute()
    asociacion_id_usuario = usuario.data[0]["asociacion_id"] if usuario.data else None

    es_aliado_dueno = usuario_id == lote_usuario_id
    es_asociacion_invitada = asociacion_id_usuario == fila["asociacion_id"]
    if not es_aliado_dueno and not es_asociacion_invitada:
        raise HTTPException(status_code=403, detail="No tienes acceso a este QR")

    return {
        "token": fila["token"],
        "token_usado": fila["token_usado"],
        "token_expira_at": str(fila["token_expira_at"]) if fila["token_expira_at"] else None,
    }


async def confirmar_recepcion_qr(token: str, usuario_id: str) -> dict:
    """FRONT16 — cualquiera de las dos partes puede escanear (el aliado
    confirma que entregó, la asociación confirma que recibió); el primero
    que escanea marca token_usado y ya no se puede repetir."""
    invitacion = supabase.table("lote_asociaciones").select(
        "id, estado, token_usado, token_expira_at, asociacion_id, lote_id, "
        "lotes(perfil_apoyo(usuario_id))"
    ).eq("token", token).execute()
    if not invitacion.data:
        raise HTTPException(status_code=404, detail="Código QR no válido")

    fila = invitacion.data[0]
    if fila["estado"] != "aceptada":
        raise HTTPException(status_code=400, detail="Esta entrega no está lista para confirmarse")
    if fila["token_usado"]:
        raise HTTPException(status_code=400, detail="Este código ya fue usado")
    if fila["token_expira_at"] and datetime.fromisoformat(fila["token_expira_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Este código QR ya venció")

    lote_usuario_id = (fila.get("lotes") or {}).get("perfil_apoyo", {}).get("usuario_id")
    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", usuario_id).execute()
    asociacion_id_usuario = usuario.data[0]["asociacion_id"] if usuario.data else None

    if usuario_id != lote_usuario_id and asociacion_id_usuario != fila["asociacion_id"]:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta entrega")

    ahora = datetime.now(timezone.utc).isoformat()

    supabase.table("lote_asociaciones").update({
        "estado": "confirmada",
        "token_usado": True,
        "confirmada_at": ahora,
    }).eq("id", fila["id"]).execute()

    supabase.table("contribuciones").update({
        "estado": "confirmada",
        "confirmada_at": ahora,
    }).eq("lote_asociacion_id", fila["id"]).execute()

    return {"id": fila["id"], "estado": "confirmada"}


# ---------------------------------------------------------------------------
# FRONT17 — Directorio, mapa de aliados y mural "Huellas que ayudan"
# ---------------------------------------------------------------------------

async def obtener_directorio_aliados() -> list:
    """Público, sin auth — usa la función RPC directorio_aliados() porque
    zona_cobertura es geography y PostgREST no expone ST_X/ST_Y en un
    select normal."""
    resultado = supabase.rpc("directorio_aliados").execute()

    aliados = []
    for p in resultado.data:
        aliados.append({
            "id": p["id"],
            "tipo": p["tipo"],
            "categorias": p.get("categorias") or [],
            "sello_verificado": p.get("aliado_verificado_por") is not None,
            "latitud": p.get("latitud"),
            "longitud": p.get("longitud"),
            "nombre": _nombre_publico(
                p.get("nombre"), p.get("apellido_paterno"),
                p.get("datos_extra"), p.get("preferencia_visibilidad"),
            ),
        })
    return aliados


async def obtener_mural_impacto() -> list:
    """Público, sin auth — historias de apoyo ya confirmado. No es
    contabilidad exacta, solo un registro de que el recurso tuvo destino
    real (mismo criterio que FRONT03)."""
    resultado = supabase.table("contribuciones").select(
        "id, cantidad_valor, cantidad_unidad, confirmada_at, "
        "subcategoria_recurso(clave, descripcion, categoria_recurso(clave)), "
        "usuarios(nombre, apellido_paterno, perfil_apoyo(datos_extra, preferencia_visibilidad)), "
        "necesidades(asociacion_id, asociaciones(nombre))"
    ).eq("estado", "confirmada").order("confirmada_at", desc=True).limit(50).execute()

    historias = []
    for c in resultado.data:
        usuario = c.get("usuarios") or {}
        perfiles = usuario.get("perfil_apoyo") or []
        perfil = perfiles[0] if isinstance(perfiles, list) and perfiles else (perfiles or {})
        subcat = c.get("subcategoria_recurso") or {}
        necesidad = c.get("necesidades") or {}
        asociacion = (necesidad.get("asociaciones") or {}) if necesidad else {}

        historias.append({
            "id": c["id"],
            "aliado_nombre": _nombre_publico(
                usuario.get("nombre"), usuario.get("apellido_paterno"),
                perfil.get("datos_extra"), perfil.get("preferencia_visibilidad"),
            ),
            "categoria": (subcat.get("categoria_recurso") or {}).get("clave"),
            "subcategoria": subcat.get("clave"),
            "cantidad_valor": c.get("cantidad_valor"),
            "cantidad_unidad": c.get("cantidad_unidad"),
            "asociacion_nombre": asociacion.get("nombre"),
            "confirmada_at": str(c["confirmada_at"]) if c.get("confirmada_at") else None,
        })
    return historias
