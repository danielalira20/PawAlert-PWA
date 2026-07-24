from fastapi import HTTPException
from app.db.supabase import supabase
from app.services.report_service import obtener_id_catalogo
from app.models.red_aliados import ContribucionRequest, OfertaProactivaRequest


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
