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

    # Best-effort: si esta necesidad ya había generado una notificación
    # para este aliado, se marca resuelta — ya no debe contar como
    # "nueva" en la pantalla de notificaciones. Nunca debe tumbar la
    # contribución ya creada si falla.
    try:
        perfil = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
        if perfil.data:
            supabase.table("notificaciones_aliado").update({
                "resuelta": True,
                "resuelta_at": datetime.now(timezone.utc).isoformat(),
            }).eq("perfil_apoyo_id", perfil.data[0]["id"]).eq("necesidad_id", body.necesidad_id).execute()
    except Exception as error:
        print(f"[WARN] No se pudo marcar notificaciones_aliado como resuelta para necesidad {body.necesidad_id}: {error}")

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


CATEGORIAS_LOTE_VALIDAS = {"alimentos", "insumos"}


async def crear_lote(usuario_id: str, body: LoteRequest) -> dict:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)

    # Un lote es un envío físico con empaques (tipo_empaque, divisible,
    # cantidad en kg/piezas) — no tiene sentido para servicios_veterinarios
    # ni difusion_campanas, que no se "empacan". Esos siguen su propio
    # camino por crear_oferta_proactiva/crear_contribucion.
    if body.categoria.value not in CATEGORIAS_LOTE_VALIDAS:
        raise HTTPException(
            status_code=422,
            detail="Los lotes físicos solo aplican a alimentos e insumos"
        )

    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    try:
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
            "fecha_disponibilidad": body.fecha_disponibilidad,
            "vigencia": body.vigencia,
            "lugar_entrega": body.lugar_entrega,
            "direccion_entrega": body.direccion_entrega,
            "direccion_detalle": body.direccion_detalle,
            "detalle": body.detalle,
        }).execute()
    except Exception as exc:
        # PostgREST devuelve PGRST204 cuando el código ya usa las columnas
        # nuevas pero la migración aún no se aplicó en la base conectada.
        # Convertirlo en una respuesta legible evita el 500 genérico y deja
        # claro qué acción de infraestructura falta.
        if "PGRST204" in str(exc) or "schema cache" in str(exc):
            raise HTTPException(
                status_code=503,
                detail=(
                    "La base de datos no está actualizada para registrar lotes. "
                    "Aplica backend/migrations/0023_datos_completos_lotes.sql "
                    "en Supabase y vuelve a intentarlo."
                ),
            ) from exc
        raise

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
        "descripcion": fila.get("descripcion"),
        "fecha_disponibilidad": str(fila["fecha_disponibilidad"]) if fila.get("fecha_disponibilidad") else None,
        "vigencia": str(fila["vigencia"]) if fila.get("vigencia") else None,
        "lugar_entrega": fila.get("lugar_entrega"),
        "direccion_entrega": fila.get("direccion_entrega"),
        "direccion_detalle": fila.get("direccion_detalle") or {},
        "detalle": fila.get("detalle") or {},
        "created_at": str(fila["created_at"]),
    }


async def obtener_mis_lotes(usuario_id: str) -> list:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)
    resultado = supabase.table("lotes").select(
        "id, categoria, subcategoria_id, especies_aplica, cantidad_valor, cantidad_unidad, "
        "tipo_empaque, divisible, max_asociaciones, forma_entrega, descripcion, "
        "fecha_disponibilidad, vigencia, lugar_entrega, direccion_entrega, direccion_detalle, detalle, "
        "activo, deshabilitado_at, created_at, "
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
            "especies_aplica": l.get("especies_aplica") or [],
            "cantidad_valor": l["cantidad_valor"],
            "cantidad_unidad": l["cantidad_unidad"],
            "tipo_empaque": l["tipo_empaque"],
            "divisible": l["divisible"],
            "max_asociaciones": l["max_asociaciones"],
            "forma_entrega": l["forma_entrega"],
            "descripcion": l.get("descripcion"),
            "fecha_disponibilidad": str(l["fecha_disponibilidad"]) if l.get("fecha_disponibilidad") else None,
            "vigencia": str(l["vigencia"]) if l.get("vigencia") else None,
            "lugar_entrega": l.get("lugar_entrega"),
            "direccion_entrega": l.get("direccion_entrega"),
            "direccion_detalle": l.get("direccion_detalle") or {},
            "detalle": l.get("detalle") or {},
            "activo": l.get("activo", True),
            "deshabilitado_at": str(l["deshabilitado_at"]) if l.get("deshabilitado_at") else None,
            "created_at": str(l["created_at"]),
            "asociaciones_invitadas": len(invitaciones),
            "asociaciones_cupo_ocupado": len([
                i for i in invitaciones if i["estado"] != "rechazada"
            ]),
            "asociaciones_aceptadas": len([i for i in invitaciones if i["estado"] in ("aceptada", "confirmada")]),
        })
    return lotes


async def cambiar_estado_lote(lote_id: str, usuario_id: str, activo: bool) -> dict:
    await _obtener_lote_propio_o_falla(lote_id, usuario_id)

    if not activo:
        invitaciones_aceptadas = supabase.table("lote_asociaciones").select(
            "id"
        ).eq("lote_id", lote_id).eq("estado", "aceptada").limit(1).execute()
        if invitaciones_aceptadas.data:
            raise HTTPException(
                status_code=409,
                detail="No puedes deshabilitar un lote con una entrega aceptada pendiente",
            )

    ahora = datetime.now(timezone.utc).isoformat() if not activo else None
    resultado = supabase.table("lotes").update({
        "activo": activo,
        "deshabilitado_at": ahora,
    }).eq("id", lote_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    return {
        "id": lote_id,
        "activo": activo,
        "deshabilitado_at": ahora,
    }


async def _obtener_lote_propio_o_falla(lote_id: str, usuario_id: str) -> dict:
    perfil = _obtener_perfil_apoyo_o_falla(usuario_id)
    lote = supabase.table("lotes").select(
        "id, perfil_apoyo_id, especies_aplica, max_asociaciones, activo, "
        "cantidad_valor, cantidad_unidad, divisible"
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
    if lote.get("activo") is False:
        raise HTTPException(status_code=409, detail="Este lote está deshabilitado")
    especies = lote.get("especies_aplica") or None

    resultado = supabase.rpc("asociaciones_compatibles_lote", {
        "p_perfil_apoyo_id": lote["perfil_apoyo_id"],
        "p_especies": especies,
    }).execute()

    invitaciones = supabase.table("lote_asociaciones").select(
        "asociacion_id"
    ).eq("lote_id", lote_id).execute()
    ya_invitadas = {fila["asociacion_id"] for fila in invitaciones.data}

    return [
        {
            "id": a["id"],
            "nombre": a["nombre"],
            "distancia_km": a["distancia_km"],
        }
        for a in resultado.data
        if a["id"] not in ya_invitadas
    ]


async def invitar_asociaciones(lote_id: str, usuario_id: str, body: InvitarAsociacionesRequest) -> list:
    lote = await _obtener_lote_propio_o_falla(lote_id, usuario_id)
    if lote.get("activo") is False:
        raise HTTPException(status_code=409, detail="Reactiva el lote antes de enviar nuevas invitaciones")

    ya_invitadas = supabase.table("lote_asociaciones").select(
        "id, asociacion_id"
    ).eq("lote_id", lote_id).execute()
    ids_ya_invitados = {fila["asociacion_id"] for fila in ya_invitadas.data}
    repetidas = [aid for aid in body.asociacion_ids if aid in ids_ya_invitados]
    if repetidas:
        raise HTTPException(
            status_code=409,
            detail="Una o más asociaciones seleccionadas ya fueron invitadas a este lote",
        )

    invitaciones_vigentes = supabase.table("lote_asociaciones").select(
        "id"
    ).eq("lote_id", lote_id).neq("estado", "rechazada").execute()
    cupo_restante = lote["max_asociaciones"] - len(invitaciones_vigentes.data)
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
        "lotes(id, categoria, especies_aplica, cantidad_valor, cantidad_unidad, tipo_empaque, "
        "divisible, forma_entrega, descripcion, fecha_disponibilidad, vigencia, lugar_entrega, direccion_entrega, direccion_detalle, detalle, "
        "subcategoria_recurso(descripcion), "
        "perfil_apoyo(id, datos_extra, preferencia_visibilidad, usuarios(nombre, apellido_paterno)))"
    ).eq("asociacion_id", asociacion_id).order("created_at", desc=True).execute()

    invitaciones = []
    for i in resultado.data:
        lote = i.get("lotes") or {}
        reparto = supabase.table("lote_asociaciones").select(
            "id, estado, cantidad_asignada"
        ).eq("lote_id", lote.get("id")).execute()
        cantidad_total = float(lote.get("cantidad_valor") or 0)
        cantidad_comprometida = sum(
            float(fila.get("cantidad_asignada") or 0)
            for fila in reparto.data
            if fila.get("estado") in ("aceptada", "confirmada")
        )
        cantidad_disponible = max(0, cantidad_total - cantidad_comprometida)
        pendientes = [
            fila for fila in reparto.data if fila.get("estado") == "invitada"
        ]
        cantidad_sugerida = cantidad_disponible
        if lote.get("divisible") != "no" and pendientes:
            cantidad_sugerida = cantidad_disponible / len(pendientes)

        perfil = lote.get("perfil_apoyo") or {}
        usuario = perfil.get("usuarios") or {}
        datos_extra = perfil.get("datos_extra") or {}
        ubicacion_aliado = {
            "calle": None,
            "colonia": None,
            "municipio": None,
            "referencia": None,
            "latitud": None,
            "longitud": None,
        }
        if perfil.get("id"):
            ubicacion = supabase.rpc(
                "ubicacion_perfil_apoyo", {"p_perfil_apoyo_id": perfil.get("id")}
            ).execute()
            if ubicacion.data:
                fila_ubicacion = ubicacion.data[0]
                ubicacion_aliado = {
                    "calle": fila_ubicacion.get("calle"),
                    "colonia": fila_ubicacion.get("colonia"),
                    "municipio": fila_ubicacion.get("municipio"),
                    "referencia": fila_ubicacion.get("referencia"),
                    "latitud": float(fila_ubicacion["latitud"]) if fila_ubicacion.get("latitud") is not None else None,
                    "longitud": float(fila_ubicacion["longitud"]) if fila_ubicacion.get("longitud") is not None else None,
                }
        invitaciones.append({
            "id": i["id"],
            "estado": i["estado"],
            "cantidad_asignada": i.get("cantidad_asignada"),
            "cantidad_disponible": cantidad_disponible,
            "cantidad_sugerida": cantidad_sugerida,
            "created_at": str(i["created_at"]),
            "lote": {
                "id": lote.get("id"),
                "categoria": lote.get("categoria"),
                "subcategoria_descripcion": (lote.get("subcategoria_recurso") or {}).get("descripcion"),
                "especies_aplica": lote.get("especies_aplica") or [],
                "cantidad_valor": lote.get("cantidad_valor"),
                "cantidad_unidad": lote.get("cantidad_unidad"),
                "tipo_empaque": lote.get("tipo_empaque"),
                "divisible": lote.get("divisible"),
                "forma_entrega": lote.get("forma_entrega"),
                "descripcion": lote.get("descripcion"),
                "fecha_disponibilidad": str(lote["fecha_disponibilidad"]) if lote.get("fecha_disponibilidad") else None,
                "vigencia": str(lote["vigencia"]) if lote.get("vigencia") else None,
                "lugar_entrega": lote.get("lugar_entrega"),
                "direccion_entrega": lote.get("direccion_entrega"),
                "direccion_detalle": lote.get("direccion_detalle") or {},
                "detalle": lote.get("detalle") or {},
                "aliado_logo_url": datos_extra.get("logo_url"),
                "aliado_nombre": _nombre_publico(
                    usuario.get("nombre"), usuario.get("apellido_paterno"),
                    perfil.get("datos_extra"), perfil.get("preferencia_visibilidad"),
                ),
                "ubicacion_aliado": ubicacion_aliado,
            },
        })
    return invitaciones


async def responder_invitacion(invitacion_id: str, asociacion_id: str, body: ResponderInvitacionRequest) -> dict:
    invitacion = supabase.table("lote_asociaciones").select(
        "id, asociacion_id, estado, lote_id, "
        "lotes(perfil_apoyo_id, subcategoria_id, cantidad_valor, cantidad_unidad, divisible, perfil_apoyo(usuario_id))"
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
    reparto = supabase.table("lote_asociaciones").select(
        "id, estado, cantidad_asignada"
    ).eq("lote_id", fila["lote_id"]).execute()
    cantidad_total = float(lote["cantidad_valor"])
    cantidad_comprometida = sum(
        float(asignacion.get("cantidad_asignada") or 0)
        for asignacion in reparto.data
        if asignacion["id"] != invitacion_id
        and asignacion.get("estado") in ("aceptada", "confirmada")
    )
    cantidad_disponible = max(0, cantidad_total - cantidad_comprometida)
    pendientes = [
        asignacion for asignacion in reparto.data
        if asignacion.get("estado") == "invitada"
    ]
    cantidad_sugerida = cantidad_disponible
    if lote.get("divisible") != "no" and pendientes:
        cantidad_sugerida = cantidad_disponible / len(pendientes)
    cantidad_solicitada = float(body.cantidad_asignada) if body.cantidad_asignada is not None else cantidad_sugerida

    if cantidad_disponible <= 0:
        raise HTTPException(
            status_code=409,
            detail="La cantidad total de este lote ya fue asignada",
        )
    if cantidad_solicitada > cantidad_disponible:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Solo quedan {cantidad_disponible:g} {lote['cantidad_unidad']} "
                "disponibles de este lote"
            ),
        )
    if lote.get("divisible") == "no" and cantidad_solicitada != cantidad_total:
        raise HTTPException(
            status_code=400,
            detail="Este lote no se reparte; debes aceptar la cantidad completa",
        )

    token_expira_at = ahora + timedelta(days=VIGENCIA_QR_DIAS)

    supabase.table("lote_asociaciones").update({
        "estado": "aceptada",
        "cantidad_asignada": cantidad_solicitada,
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
        "cantidad_valor": cantidad_solicitada,
        "cantidad_unidad": lote["cantidad_unidad"],
    }).execute()

    return {"id": invitacion_id, "estado": "aceptada", "token_expira_at": token_expira_at.isoformat()}


# ---------------------------------------------------------------------------
# BACK07 + FRONT16 — QR de recepción con vigencia limitada
# ---------------------------------------------------------------------------

async def obtener_qr_invitacion(invitacion_id: str, usuario_id: str) -> dict:
    """BACK07 — el token ya se generó al crear la fila (default
    gen_random_uuid()); esto solo lo expone una vez la invitación fue
    aceptada. El código pertenece al aliado dueño del lote; la asociación
    únicamente cuenta con la acción de escanearlo."""
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
    if usuario_id != lote_usuario_id:
        raise HTTPException(status_code=403, detail="Solo el aliado dueño del lote puede ver este QR")

    return {
        "token": fila["token"],
        "token_usado": fila["token_usado"],
        "token_expira_at": str(fila["token_expira_at"]) if fila["token_expira_at"] else None,
    }


async def confirmar_recepcion_qr(token: str, usuario_id: str) -> dict:
    """FRONT16 — la asociación invitada escanea el código que muestra el
    aliado y confirma la recepción; el token solo se puede usar una vez."""
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

    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", usuario_id).execute()
    asociacion_id_usuario = usuario.data[0]["asociacion_id"] if usuario.data else None

    if asociacion_id_usuario != fila["asociacion_id"]:
        raise HTTPException(status_code=403, detail="Solo la asociación invitada puede confirmar esta entrega")

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

    # Insignias de aliado (Persona 4) — nunca debe tronar la confirmación
    # de entrega si falla; la gamificación es secundaria al flujo principal.
    lote_usuario_id = (fila.get("lotes") or {}).get("perfil_apoyo", {}).get("usuario_id")
    if lote_usuario_id:
        try:
            from app.services.insignias_aliado_service import evaluar_insignias_aliado
            evaluar_insignias_aliado(lote_usuario_id)
        except Exception:
            pass

    return {"id": fila["id"], "estado": "confirmada"}


# ---------------------------------------------------------------------------
# Ciclo de entrega para contribuciones normales (reactiva/proactiva, no
# lotes) — mismo mecanismo de QR de arriba, pero contra `contribuciones`
# en vez de `lote_asociaciones`. No modifica ninguna función de lotes,
# solo las usa/llama donde corresponde (confirmar_recepcion_qr_generico).
# ---------------------------------------------------------------------------

async def obtener_qr_contribucion(contribucion_id: str, usuario_id: str) -> dict:
    """Análogo a obtener_qr_invitacion (lotes), para una contribución
    normal. 'confirmada'/'parcial' = ya aceptada, lista para mostrar el
    QR; 'entregada' = ya se confirmó (el modal la pinta como usada)."""
    contrib = supabase.table("contribuciones").select(
        "id, estado, usuario_id, token, token_usado, token_expira_at, "
        "necesidad_id, reporte_id, necesidades(asociacion_id), reportes(asociacion_asignada_id)"
    ).eq("id", contribucion_id).execute()
    if not contrib.data:
        raise HTTPException(status_code=404, detail="Contribución no encontrada")

    fila = contrib.data[0]
    if fila["estado"] not in ("confirmada", "parcial", "entregada"):
        raise HTTPException(status_code=400, detail="Esta contribución todavía no fue aceptada")

    asociacion_id = (fila.get("necesidades") or {}).get("asociacion_id") or (fila.get("reportes") or {}).get("asociacion_asignada_id")
    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", usuario_id).execute()
    asociacion_id_usuario = usuario.data[0]["asociacion_id"] if usuario.data else None

    if usuario_id != fila["usuario_id"] and asociacion_id_usuario != asociacion_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este QR")

    return {
        "token": fila["token"],
        "token_usado": fila["token_usado"],
        "token_expira_at": str(fila["token_expira_at"]) if fila["token_expira_at"] else None,
    }


async def confirmar_recepcion_qr_contribucion(token: str, usuario_id: str) -> dict:
    """Hermano de confirmar_recepcion_qr (lotes) — misma validación
    (estado correcto, no usado, no vencido, alguna de las dos partes),
    pero contra `contribuciones`. Pasa a 'entregada' (no 'confirmada' —
    ese estado ya significa "aceptada" en contribuciones, a diferencia
    de lote_asociaciones donde 'confirmada' es el estado final)."""
    contrib = supabase.table("contribuciones").select(
        "id, estado, usuario_id, token_usado, token_expira_at, "
        "necesidad_id, reporte_id, necesidades(asociacion_id), reportes(asociacion_asignada_id)"
    ).eq("token", token).execute()
    if not contrib.data:
        raise HTTPException(status_code=404, detail="Código QR no válido")

    fila = contrib.data[0]
    if fila["estado"] not in ("confirmada", "parcial"):
        raise HTTPException(status_code=400, detail="Esta entrega no está lista para confirmarse")
    if fila["token_usado"]:
        raise HTTPException(status_code=400, detail="Este código ya fue usado")
    if fila["token_expira_at"] and datetime.fromisoformat(fila["token_expira_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Este código QR ya venció")

    asociacion_id = (fila.get("necesidades") or {}).get("asociacion_id") or (fila.get("reportes") or {}).get("asociacion_asignada_id")
    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", usuario_id).execute()
    asociacion_id_usuario = usuario.data[0]["asociacion_id"] if usuario.data else None

    if usuario_id != fila["usuario_id"] and asociacion_id_usuario != asociacion_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta entrega")

    ahora = datetime.now(timezone.utc).isoformat()
    supabase.table("contribuciones").update({
        "estado": "entregada",
        "token_usado": True,
        "confirmada_at": ahora,
    }).eq("id", fila["id"]).execute()

    # Insignias de aliado (Persona 4) — igual que en confirmar_recepcion_qr,
    # nunca debe tronar la confirmación de entrega si esto falla.
    try:
        from app.services.insignias_aliado_service import evaluar_insignias_aliado
        evaluar_insignias_aliado(fila["usuario_id"])
    except Exception:
        pass

    return {"id": fila["id"], "estado": "entregada"}


async def confirmar_recepcion_qr_generico(token: str, usuario_id: str) -> dict:
    """Dispatcher usado por POST /qr/confirmar — resuelve si el token
    pertenece a un lote o a una contribución normal y delega. No
    modifica confirmar_recepcion_qr (lotes, de Miguel), solo la llama."""
    en_lote = supabase.table("lote_asociaciones").select("id").eq("token", token).execute()
    if en_lote.data:
        return await confirmar_recepcion_qr(token, usuario_id)
    return await confirmar_recepcion_qr_contribucion(token, usuario_id)


async def obtener_mis_contribuciones(usuario_id: str, tab: str) -> list:
    """Panel de aliado (FRONT — 'Mis aportaciones'): contribuciones
    propias que NO vinieron de un lote (esas ya se ven en Mis Lotes, no
    se duplican aquí)."""
    query = supabase.table("contribuciones").select(
        "id, cantidad_valor, cantidad_unidad, estado, created_at, confirmada_at, detalle, "
        "token, token_usado, token_expira_at, modo, "
        "necesidades(id, categoria, asociaciones(nombre, calle, colonia, municipio, referencia, latitud, longitud)), "
        "reportes(id, asociacion_asignada_id), "
        "subcategoria_recurso(clave, descripcion, categoria_recurso(clave, descripcion))"
    ).eq("usuario_id", usuario_id).neq("modo", "lote")

    if tab == "aceptadas":
        query = query.in_("estado", ["confirmada", "parcial"])
    elif tab == "historial":
        query = query.in_("estado", ["entregada", "rechazada", "retirada"])
    else:
        query = query.eq("estado", "comprometida")

    resultado = query.order("created_at", desc=True).execute()
    return resultado.data or []


async def obtener_necesidades_contribuidas(usuario_id: str) -> dict:
    """Punto 10 (badge 'Ya ofreciste ayuda' en Cómo ayudar) — no toca el
    endpoint público /necesidades/publicas, es una consulta aparte,
    autenticada, que el frontend cruza en cliente."""
    resultado = supabase.table("contribuciones").select("necesidad_id").eq(
        "usuario_id", usuario_id
    ).not_.is_("necesidad_id", "null").execute()
    return {"necesidad_ids": list({r["necesidad_id"] for r in (resultado.data or [])})}


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


# ─── Motor de sugerencias, Ruta 1 (BACK01) ───────────────────────────────
# Se llama desde POST /reports/{id}/hitos (registrar_hito en reports.py)
# cuando se registra el hito "encontre_animal". Solo lee — nunca reserva
# capacidad (eso es BACK02) ni persiste nada (la sugerencia se regresa en
# la respuesta del hito, no se guarda en ninguna tabla).

_CONDICION_A_URGENCIA = {"grave": "critico", "herido": "urgente", "estable": "no_urgente"}
_ORDEN_URGENCIA = {"no_urgente": 0, "urgente": 1, "critico": 2}


def _nivel_urgencia_efectivo(condicion_animal: str | None, condicion_observada: str | None) -> str | None:
    """Nivel de urgencia para el motor de sugerencias — puramente
    lógico/temporal para decidir a quién sugerir en este instante. Nunca
    escribe en animal.condicion_id ni en ninguna otra columna: el reporte
    se queda exactamente como se creó.

    Base: animal.condicion_id (grave/herido/estable) tal como se declaró al
    crear el reporte. `condicion_observada` (texto libre de
    HitoRequest.condicion_observada en el hito 'encontre_animal') solo
    puede ESCALAR ese nivel hacia arriba, nunca bajarlo:
    - 'Igual que en el reporte' -> sin cambio
    - 'Peor de lo esperado' -> sube a mínimo 'urgente'
    - 'En estado crítico' -> fuerza 'critico'
    - 'No estaba en el lugar' -> None (no se ejecuta el matching)
    - None o cualquier otro valor no reconocido -> sin cambio (mismo
      tratamiento que 'Igual que en el reporte')
    """
    nivel = _CONDICION_A_URGENCIA.get(condicion_animal or "", "no_urgente")

    if condicion_observada == "No estaba en el lugar":
        return None
    if condicion_observada == "En estado crítico":
        return "critico"
    if condicion_observada == "Peor de lo esperado":
        if _ORDEN_URGENCIA[nivel] < _ORDEN_URGENCIA["urgente"]:
            return "urgente"
        return nivel
    return nivel


def sugerir_aliado_veterinario(reporte_id: str, nivel_urgencia: str) -> dict | None:
    """Busca la oferta proactiva de servicios veterinarios más cercana
    compatible por categoría + zona + nivel de urgencia, vía la función SQL
    sugerencia_veterinaria_cercana (migrations/0011_sugerencia_veterinaria.sql)
    — mismo patrón que assignment_service.asignar_asociacion() con
    encontrar_asociacion_cercana."""
    resultado = supabase.rpc(
        "sugerencia_veterinaria_cercana",
        {"p_reporte_id": reporte_id, "p_nivel_urgencia": nivel_urgencia},
    ).execute()

    if not resultado.data:
        return None

    fila = resultado.data[0]
    return {
        "oferta_id": fila["oferta_id"],
        "perfil_apoyo_id": fila["perfil_apoyo_id"],
        "nombre": fila["nombre"],
        "distancia_km": fila["distancia_km"],
        "unidad": fila["unidad"],
        "capacidad_disponible": fila["capacidad_disponible"],
        "nivel_urgencia": nivel_urgencia,
    }


# ─── BACK02 — aceptar la sugerencia y reservar capacidad ─────────────────
# reservar_capacidad_oferta() es genérica a propósito (ver
# migrations/0012_aceptar_sugerencia_aliado.sql): cualquier flujo que
# necesite descontar capacidad de una oferta_proactiva la puede llamar
# igual, no solo Ruta 1 — por ejemplo BACK06 de Diego más adelante, cuando
# exista el flujo de aceptar una contribución reactiva normal que también
# venga de una oferta_proactiva_id.

def reservar_capacidad_oferta(oferta_id: str, cantidad: float) -> float | None:
    resultado = supabase.rpc(
        "reservar_capacidad_oferta",
        {"p_oferta_id": oferta_id, "p_cantidad": cantidad},
    ).execute()
    return resultado.data  # número resultante, o None si no alcanzaba/no existe/no está activa


async def aceptar_sugerencia_veterinaria(reporte_id: str, oferta_id: str) -> dict:
    """Acepta la sugerencia que regresó POST /reports/{id}/hitos y reserva
    de inmediato 1 unidad de la oferta — Ruta 1 siempre reserva una sola
    unidad (una cita/consulta), no una cantidad variable, porque la
    urgencia médica pesa más que esperar aprobación (flujo-red-aliados-pawalert.md,
    sección 6, Ruta 1, paso 5).

    Crea la contribución en estado 'comprometida', NO 'confirmada' — la
    asociación confirma DESPUÉS que el servicio se usó (mismo doc, paso 6);
    ese endpoint de confirmación todavía no existe (trabajo futuro,
    probablemente de Diego), así que aquí solo se deja el estado correcto
    para cuando exista."""
    capacidad_resultante = reservar_capacidad_oferta(oferta_id, 1)
    if capacidad_resultante is None:
        raise HTTPException(
            status_code=409,
            detail="Ya no hay capacidad disponible en esta oferta — alguien más la tomó primero."
        )

    oferta = supabase.table("ofertas_proactivas").select(
        "unidad, subcategoria_id, perfil_apoyo(id, usuario_id)"
    ).eq("id", oferta_id).execute()

    if not oferta.data:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")

    fila_oferta = oferta.data[0]
    perfil_apoyo = fila_oferta.get("perfil_apoyo") or {}
    # El usuario_id de la contribución es el del aliado dueño de la oferta
    # (quien ofrece, según el esquema documentado en tareas-red-aliados-pawalert.md),
    # no el del staff/voluntario que acepta la sugerencia.
    usuario_aliado_id = perfil_apoyo.get("usuario_id")
    perfil_apoyo_id = perfil_apoyo.get("id")

    resultado = supabase.table("contribuciones").insert({
        "reporte_id": reporte_id,
        "necesidad_id": None,
        "usuario_id": usuario_aliado_id,
        "cantidad_valor": 1,
        "cantidad_unidad": fila_oferta.get("unidad"),
        "modo": "proactiva",
        "oferta_proactiva_id": oferta_id,
        "subcategoria_id": fila_oferta.get("subcategoria_id"),
        "estado": "comprometida",
        "detalle": {"origen": "sugerencia_ruta1"},
    }).execute()

    fila = resultado.data[0]
    contribucion = {
        "id": fila["id"],
        "necesidad_id": fila.get("necesidad_id"),
        "reporte_id": fila.get("reporte_id"),
        "oferta_proactiva_id": fila.get("oferta_proactiva_id"),
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }

    # Datos de contacto y ubicación del aliado para que el voluntario/staff
    # que trae el caso pueda llevar al animal a la veterinaria — mismo
    # criterio que contacto_aliado/contacto_asociacion de Ruta 2
    # (aceptar_sugerencia_general), duplicado a propósito en vez de
    # extraído a un helper compartido.
    contacto_aliado = {"nombre": None, "telefono": None, "email": None}
    if usuario_aliado_id:
        usuario_aliado = supabase.table("usuarios").select(
            "nombre, apellido_paterno, telefono, email"
        ).eq("id", usuario_aliado_id).execute()
        if usuario_aliado.data:
            fila_usuario = usuario_aliado.data[0]
            contacto_aliado = {
                "nombre": " ".join(
                    filter(None, [fila_usuario.get("nombre"), fila_usuario.get("apellido_paterno")])
                ).strip() or None,
                "telefono": fila_usuario.get("telefono"),
                "email": fila_usuario.get("email"),
            }

    ubicacion_aliado = {
        "calle": None, "colonia": None, "municipio": None,
        "referencia": None, "latitud": None, "longitud": None,
    }
    if perfil_apoyo_id:
        ubicacion = supabase.rpc(
            "ubicacion_perfil_apoyo", {"p_perfil_apoyo_id": perfil_apoyo_id}
        ).execute()
        if ubicacion.data:
            fila_ubicacion = ubicacion.data[0]
            ubicacion_aliado = {
                "calle": fila_ubicacion.get("calle"),
                "colonia": fila_ubicacion.get("colonia"),
                "municipio": fila_ubicacion.get("municipio"),
                "referencia": fila_ubicacion.get("referencia"),
                "latitud": float(fila_ubicacion["latitud"]) if fila_ubicacion.get("latitud") is not None else None,
                "longitud": float(fila_ubicacion["longitud"]) if fila_ubicacion.get("longitud") is not None else None,
            }

    return {
        "contribucion": contribucion,
        "contacto_aliado": contacto_aliado,
        "ubicacion_aliado": ubicacion_aliado,
    }


# ─── Motor de sugerencias, Ruta 2 (BACK03) — necesidades generales ───────
# A diferencia de Ruta 1 (ligada a un hito de un reporte con urgencia
# médica, match único automático), aquí la asociación consulta bajo
# demanda contra una necesidad general (sin reporte de por medio) y elige
# entre una lista de ofertas compatibles, aceptando la cantidad que
# quiera. Función SQL propia (ofertas_compatibles_necesidad,
# migrations/0013_ofertas_compatibles_necesidad.sql) — no se reusa la de
# Ruta 1 porque el ancla geográfica, el filtro de categoría y la
# cardinalidad del resultado son distintos.

def buscar_ofertas_compatibles(necesidad_id: str) -> list[dict]:
    resultado = supabase.rpc(
        "ofertas_compatibles_necesidad",
        {"p_necesidad_id": necesidad_id},
    ).execute()

    return [
        {
            "oferta_id": fila["oferta_id"],
            "perfil_apoyo_id": fila["perfil_apoyo_id"],
            "nombre": fila["nombre"],
            "distancia_km": fila["distancia_km"],
            "unidad": fila["unidad"],
            "capacidad_disponible": fila["capacidad_disponible"],
        }
        for fila in (resultado.data or [])
    ]


async def aceptar_sugerencia_general(necesidad_id: str, oferta_id: str, cantidad: float) -> dict:
    """Acepta una oferta compatible con una necesidad general y reserva la
    cantidad indicada — a diferencia de Ruta 1 (siempre 1 unidad fija),
    aquí la cantidad es variable y la elige la asociación.

    Crea la contribución en estado 'comprometida' (mismo criterio que
    Ruta 1 — la confirmación de uso es un paso futuro que todavía no
    existe) y regresa, además de la contribución, los datos de contacto
    de ambas partes para que coordinen la entrega fuera de la plataforma
    (no hay chat ni logística interna en este alcance)."""
    capacidad_resultante = reservar_capacidad_oferta(oferta_id, cantidad)
    if capacidad_resultante is None:
        # Mensaje distinto al de Ruta 1: ahí la cantidad siempre es 1 fija,
        # así que un 409 solo puede ser una carrera con otra asociación.
        # Aquí la cantidad es variable, así que el motivo más probable es
        # simplemente pedir más de lo disponible, no necesariamente una
        # carrera.
        raise HTTPException(
            status_code=409,
            detail="La cantidad solicitada supera la capacidad disponible en esta oferta"
        )

    oferta = supabase.table("ofertas_proactivas").select(
        "unidad, subcategoria_id, perfil_apoyo(usuario_id)"
    ).eq("id", oferta_id).execute()
    if not oferta.data:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    fila_oferta = oferta.data[0]
    usuario_aliado_id = (fila_oferta.get("perfil_apoyo") or {}).get("usuario_id")

    necesidad = supabase.table("necesidades").select(
        "asociacion_id"
    ).eq("id", necesidad_id).execute()
    if not necesidad.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")
    asociacion_id = necesidad.data[0]["asociacion_id"]

    resultado = supabase.table("contribuciones").insert({
        "necesidad_id": necesidad_id,
        "reporte_id": None,
        "usuario_id": usuario_aliado_id,
        "cantidad_valor": cantidad,
        "cantidad_unidad": fila_oferta.get("unidad"),
        "modo": "proactiva",
        "oferta_proactiva_id": oferta_id,
        "subcategoria_id": fila_oferta.get("subcategoria_id"),
        "estado": "comprometida",
        "detalle": {"origen": "sugerencia_ruta2"},
    }).execute()
    fila = resultado.data[0]

    contribucion = {
        "id": fila["id"],
        "necesidad_id": fila.get("necesidad_id"),
        "reporte_id": fila.get("reporte_id"),
        "oferta_proactiva_id": fila.get("oferta_proactiva_id"),
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }

    contacto_aliado = {"nombre": None, "telefono": None, "email": None}
    if usuario_aliado_id:
        usuario_aliado = supabase.table("usuarios").select(
            "nombre, apellido_paterno, telefono, email"
        ).eq("id", usuario_aliado_id).execute()
        if usuario_aliado.data:
            fila_usuario = usuario_aliado.data[0]
            contacto_aliado = {
                "nombre": " ".join(
                    filter(None, [fila_usuario.get("nombre"), fila_usuario.get("apellido_paterno")])
                ).strip() or None,
                "telefono": fila_usuario.get("telefono"),
                "email": fila_usuario.get("email"),
            }

    contacto_asociacion = {"nombre": None, "telefono": None, "email": None}
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_telefono, contacto_email"
    ).eq("id", asociacion_id).execute()
    if asociacion.data:
        fila_asociacion = asociacion.data[0]
        contacto_asociacion = {
            "nombre": fila_asociacion.get("nombre"),
            "telefono": fila_asociacion.get("contacto_telefono"),
            "email": fila_asociacion.get("contacto_email"),
        }

    # Notificación best-effort al aliado — nunca debe tumbar la aceptación
    # ya confirmada si falla (por ejemplo, si el esquema de
    # notificaciones_aliado cambia). tipo='oferta_aceptada' no tiene CHECK
    # constraint en la tabla, así que no requiere cambio de esquema.
    try:
        if usuario_aliado_id:
            perfil_apoyo = supabase.table("perfil_apoyo").select("id").eq(
                "usuario_id", usuario_aliado_id
            ).execute()
            if perfil_apoyo.data:
                supabase.table("notificaciones_aliado").insert({
                    "perfil_apoyo_id": perfil_apoyo.data[0]["id"],
                    "necesidad_id": necesidad_id,
                    "tipo": "oferta_aceptada",
                }).execute()
    except Exception as error:
        print(f"[WARN] No se pudo crear notificaciones_aliado para oferta {oferta_id}: {error}")

    return {
        "contribucion": contribucion,
        "contacto_aliado": contacto_aliado,
        "contacto_asociacion": contacto_asociacion,
    }

def crear_necesidad_asociacion(supabase, asociacion_id: str, data):
    # 1. Mapear la urgencia
    urgencia_db = None
    if data.urgencia:
        mapeo_urgencia = {
            "Alta": "critico",
            "Media": "urgente",
            "Baja": "no_urgente"
        }
        urgencia_db = mapeo_urgencia.get(data.urgencia)

    # 2. Preparar el payload con las nuevas columnas
    necesidad_payload = {
        "asociacion_id": asociacion_id,
        "reporte_id": str(data.reporte_id) if data.reporte_id else None,
        "categoria": data.categoria,
        "urgencia": urgencia_db,
        "estado": "activa",
        "subcategoria_id": str(data.subcategoria_id) if data.subcategoria_id else None,
        "cantidad_valor": data.cantidad_valor,
        "cantidad_unidad": data.cantidad_unidad,
        "detalle": data.detalle if data.detalle else {}
    }

    # 3. Insertar en Supabase
    try:
        response = supabase.table("necesidades").insert(necesidad_payload).execute()
        necesidad_creada = response.data[0]
        
        # BACK05: Notificar a aliados compatibles (Best-Effort)
        try:
            supabase.rpc(
                "notificar_aliados_cercanos", 
                {"p_necesidad_id": necesidad_creada["id"]}
            ).execute()
        except Exception as notify_err:
            print(f"[WARN] Error al generar notificaciones para necesidad {necesidad_creada['id']}: {notify_err}")

        return necesidad_creada
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al crear la necesidad: {str(e)}")


# ─── FRONT03/BACK04 — perfil de aliado en Mi Perfil ───────────────────────
# Existencia + estadísticas de impacto de perfil_apoyo, mismo patrón que
# obtener_mi_voluntario()/obtener_reportes_voluntario() en
# voluntario_service.py, pero para el dominio de donaciones (no de
# rescates): no hay "% rescatados" ni especies, hay contribuciones,
# asociaciones ayudadas y — para aliado_local/patrocinador_institucional —
# capacidad declarada vs. disponible por oferta proactiva.

def obtener_mi_perfil_apoyo(usuario_id: str) -> dict:
    resultado = supabase.table("perfil_apoyo").select("tipo").eq(
        "usuario_id", usuario_id
    ).execute()

    if not resultado.data:
        return {"tiene_perfil_apoyo": False, "tipo": None}

    return {"tiene_perfil_apoyo": True, "tipo": resultado.data[0]["tipo"]}


def obtener_impacto_aliado(usuario_id: str) -> dict:
    perfil = supabase.table("perfil_apoyo").select("id, tipo, verificado_admin, razon_rechazo").eq(
        "usuario_id", usuario_id
    ).execute()

    if not perfil.data:
        raise HTTPException(status_code=404, detail="No tienes un perfil de aliado")

    perfil_apoyo_id = perfil.data[0]["id"]
    tipo = perfil.data[0]["tipo"]
    verificado_admin = perfil.data[0].get("verificado_admin", False)
    razon_rechazo = perfil.data[0].get("razon_rechazo", None)

    # Cada contribución del usuario cuelga de una necesidad (Ruta 2 /
    # reactiva) o de un reporte (Ruta 1) — nunca de ambas (constraint
    # contribuciones_necesidad_o_reporte_check, migrations/0012). La
    # asociación ayudada se resuelve por el lado que sí tenga valor.
    contribs = supabase.table("contribuciones").select(
        "id, necesidades(asociacion_id), reportes(asociacion_asignada_id)"
    ).eq("usuario_id", usuario_id).execute()

    contribs_data = contribs.data or []
    total_contribuciones = len(contribs_data)

    asociaciones_ayudadas = set()
    for c in contribs_data:
        aso_id = (c.get("necesidades") or {}).get("asociacion_id") or \
            (c.get("reportes") or {}).get("asociacion_asignada_id")
        if aso_id:
            asociaciones_ayudadas.add(aso_id)

    ofertas_out: list[dict] = []
    aplicaciones_out: list[dict] = []

    # Solo aliado_local/patrocinador_institucional declaran capacidad
    # proactiva — donante_comunitario siempre regresa listas vacías aquí,
    # nunca un shape distinto (el frontend no necesita ramificar por tipo).
    if tipo in ("aliado_local", "patrocinador_institucional"):
        ofertas = supabase.table("ofertas_proactivas").select(
            "id, categoria, capacidad_declarada, capacidad_disponible, unidad, activa, "
            "subcategoria_recurso(descripcion)"
        ).eq("perfil_apoyo_id", perfil_apoyo_id).execute()

        for o in (ofertas.data or []):
            ofertas_out.append({
                "oferta_id": o["id"],
                "categoria": o["categoria"],
                "subcategoria": (o.get("subcategoria_recurso") or {}).get("descripcion"),
                "capacidad_declarada": o["capacidad_declarada"],
                "capacidad_disponible": o["capacidad_disponible"],
                "unidad": o["unidad"],
                "activa": o["activa"],
            })

        oferta_ids = [o["oferta_id"] for o in ofertas_out]
        if oferta_ids:
            # "Aplicaciones" = contribuciones que consumieron capacidad de
            # alguna de estas ofertas — no es una tabla nueva, se deriva de
            # contribuciones.oferta_proactiva_id.
            aplicaciones = supabase.table("contribuciones").select(
                "created_at, cantidad_valor, cantidad_unidad, subcategoria_recurso(descripcion)"
            ).in_("oferta_proactiva_id", oferta_ids).order("created_at", desc=True).execute()

            for a in (aplicaciones.data or []):
                cantidad = None
                if a.get("cantidad_valor") is not None:
                    cantidad = f"{a['cantidad_valor']} {a.get('cantidad_unidad') or ''}".strip()
                aplicaciones_out.append({
                    "fecha": str(a["created_at"]),
                    "cantidad": cantidad,
                    "nota": (a.get("subcategoria_recurso") or {}).get("descripcion"),
                })

    return {
        "tipo": tipo,
        "verificado_admin": verificado_admin,
        "razon_rechazo": razon_rechazo,
        "total_contribuciones": total_contribuciones,
        "asociaciones_ayudadas": len(asociaciones_ayudadas),
        "ofertas": ofertas_out,
        "aplicaciones": aplicaciones_out,
    }
