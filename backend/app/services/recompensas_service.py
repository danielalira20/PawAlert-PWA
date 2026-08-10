from datetime import date

from fastapi import HTTPException
from app.db.supabase import supabase_admin as supabase
from app.models.recompensas import (
    RecompensaCreate,
    COSTO_POR_NIVEL,
)

# Solo aliado_local / patrocinador_institucional pueden crear recompensas
# (regla de negocio de Persona 4) — donante_comunitario y asociación quedan
# fuera. A diferencia de _obtener_perfil_apoyo_o_falla en
# red_aliados_service.py (que solo excluye donante_comunitario), aquí
# también se exige verificado_admin: un perfil pendiente o rechazado no
# puede crear recompensas aunque su tipo sea el correcto.
TIPOS_ELEGIBLES_RECOMPENSA = {"aliado_local", "patrocinador_institucional"}


def _nombre_publico_patrocinador(perfil: dict) -> str:
    datos_extra = perfil.get("datos_extra") or {}
    if perfil.get("preferencia_visibilidad") in {"anonimo", "donar anónimamente"}:
        return "Aliado verificado"
    nombre_comercial = datos_extra.get("razon_social") or datos_extra.get("nombre_negocio")
    if nombre_comercial:
        return nombre_comercial
    usuario = perfil.get("usuarios") or {}
    nombre = f"{usuario.get('nombre') or ''} {usuario.get('apellido_paterno') or ''}".strip()
    return nombre or "Aliado verificado"


def _obtener_perfil_elegible_o_falla(usuario_id: str) -> dict:
    perfil = supabase.table("perfil_apoyo").select(
        "id, tipo, verificado_admin, categorias, datos_extra"
    ).eq("usuario_id", usuario_id).execute()

    if not perfil.data:
        raise HTTPException(
            status_code=403,
            detail="Necesitas un perfil de aliado para crear recompensas"
        )

    fila = perfil.data[0]
    if fila["tipo"] not in TIPOS_ELEGIBLES_RECOMPENSA:
        raise HTTPException(
            status_code=403,
            detail="Crear recompensas está disponible solo para aliados locales y patrocinadores institucionales"
        )
    if not fila["verificado_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Tu perfil de aliado todavía no está verificado"
        )
    return fila


def _validar_categoria_declarada(perfil: dict, categoria: str, subcategoria: str | None) -> None:
    if categoria not in (perfil.get("categorias") or []):
        raise HTTPException(status_code=422, detail="La categoría no fue declarada en tu perfil de patrocinador")
    subcategorias = (perfil.get("datos_extra") or {}).get("subcategorias") or []
    if subcategoria and subcategoria not in subcategorias:
        raise HTTPException(status_code=422, detail="La subcategoría no fue declarada en tu perfil de patrocinador")


TRANSICIONES_ESTADO_RECOMPENSA = {
    "publicar": {"desde": {"borrador"}, "hacia": "activa"},
    "pausar": {"desde": {"activa"}, "hacia": "pausada"},
    "reactivar": {"desde": {"pausada"}, "hacia": "activa"},
    "archivar": {"desde": {"borrador", "activa", "pausada", "agotada", "vencida"}, "hacia": "archivada"},
}


async def crear_recompensa(usuario_id: str, body: RecompensaCreate) -> dict:
    perfil = _obtener_perfil_elegible_o_falla(usuario_id)
    _validar_categoria_declarada(perfil, body.categoria, body.subcategoria)
    costo = COSTO_POR_NIVEL[body.nivel.value]

    resultado = supabase.table("recompensas").insert({
        "propietario_id": perfil["id"],
        "tipo": body.tipo.value,
        "categoria": body.categoria,
        "subcategoria": body.subcategoria,
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "nivel": body.nivel.value,
        "costo": costo,
        "unidades_totales": body.unidades_totales,
        "unidades_disponibles": body.unidades_totales,
        "inicio": body.inicio.isoformat(),
        "vencimiento": body.vencimiento.isoformat(),
        "sucursal_lugar": body.sucursal_lugar,
        "horario": body.horario,
        "forma_entrega": body.forma_entrega,
        "condiciones": body.condiciones,
        "estado": "borrador",
        "inventario_separado_confirmado": body.inventario_separado_confirmado,
    }).execute()

    return resultado.data[0]


async def obtener_mis_recompensas(usuario_id: str, estado: str | None = None) -> list[dict]:
    perfil = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if not perfil.data:
        return []

    query = supabase.table("recompensas").select("*").eq("propietario_id", perfil.data[0]["id"])
    if estado:
        query = query.eq("estado", estado)
    resultado = query.order("creado_at", desc=True).execute()
    filas = resultado.data or []
    for fila in filas:
        canjes = supabase.table("canjes_recompensa").select("beneficiario_id, estado").eq(
            "recompensa_id", fila["id"]
        ).eq("estado", "confirmado").execute()
        confirmados = canjes.data or []
        fila["canjes_confirmados"] = len(confirmados)
        fila["personas_beneficiadas"] = len({c["beneficiario_id"] for c in confirmados})
    return filas


def obtener_catalogo_recompensas() -> list[dict]:
    """Catálogo público para Persona 5.

    Aunque los filtros se envían a PostgREST, se repiten al mapear como
    defensa en profundidad: este endpoint usa service_role para respetar el
    RLS cerrado de recompensas y nunca debe filtrar datos privados por error.
    """
    hoy = date.today().isoformat()
    resultado = supabase.table("recompensas").select(
        "id, propietario_id, tipo, categoria, subcategoria, nombre, descripcion, "
        "nivel, costo, unidades_disponibles, inicio, vencimiento, sucursal_lugar, "
        "horario, forma_entrega, condiciones, estado, "
        "perfil_apoyo!inner(id, tipo, verificado_admin, preferencia_visibilidad, "
        "datos_extra, usuarios(nombre, apellido_paterno))"
    ).eq("estado", "activa").gte(
        "unidades_disponibles", 1
    ).lte("inicio", hoy).gte(
        "vencimiento", hoy
    ).eq("perfil_apoyo.verificado_admin", True).in_(
        "perfil_apoyo.tipo", list(TIPOS_ELEGIBLES_RECOMPENSA)
    ).order("creado_at", desc=True).execute()

    catalogo: list[dict] = []
    for recompensa in resultado.data or []:
        perfil = recompensa.get("perfil_apoyo") or {}
        if (
            recompensa.get("estado") != "activa"
            or int(recompensa.get("unidades_disponibles") or 0) <= 0
            or str(recompensa.get("inicio") or "") > hoy
            or str(recompensa.get("vencimiento") or "") < hoy
            or not perfil.get("verificado_admin")
            or perfil.get("tipo") not in TIPOS_ELEGIBLES_RECOMPENSA
        ):
            continue

        catalogo.append({
            "id": recompensa["id"],
            "propietario_id": recompensa["propietario_id"],
            "patrocinador_nombre": _nombre_publico_patrocinador(perfil),
            "patrocinador_tipo": perfil["tipo"],
            "tipo": recompensa["tipo"],
            "categoria": recompensa["categoria"],
            "subcategoria": recompensa.get("subcategoria"),
            "nombre": recompensa["nombre"],
            "descripcion": recompensa["descripcion"],
            "nivel": recompensa["nivel"],
            "costo": recompensa["costo"],
            "unidades_disponibles": recompensa["unidades_disponibles"],
            "inicio": str(recompensa["inicio"]),
            "vencimiento": str(recompensa["vencimiento"]),
            "sucursal_lugar": recompensa.get("sucursal_lugar"),
            "horario": recompensa.get("horario"),
            "forma_entrega": recompensa["forma_entrega"],
            "condiciones": recompensa.get("condiciones"),
            "ubicacion_publica": {"lugar": recompensa.get("sucursal_lugar")},
            "estado": recompensa["estado"],
        })
    return catalogo


def obtener_categorias_recompensa(usuario_id: str) -> list[dict]:
    perfil = _obtener_perfil_elegible_o_falla(usuario_id)
    categorias_permitidas = perfil.get("categorias") or []
    subcategorias_permitidas = set((perfil.get("datos_extra") or {}).get("subcategorias") or [])
    if not categorias_permitidas:
        return []
    categorias = supabase.table("categoria_recurso").select("id, clave, descripcion").in_(
        "clave", categorias_permitidas
    ).eq("activo", True).execute()
    salida = []
    for categoria in categorias.data or []:
        subs = supabase.table("subcategoria_recurso").select("clave, descripcion").eq(
            "categoria_id", categoria["id"]
        ).eq("activo", True).execute()
        salida.append({
            "clave": categoria["clave"],
            "descripcion": categoria["descripcion"],
            "subcategorias": [s for s in (subs.data or []) if s["clave"] in subcategorias_permitidas],
        })
    return salida


async def cambiar_estado_recompensa(recompensa_id: str, usuario_id: str, accion: str) -> dict:
    perfil = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if not perfil.data:
        raise HTTPException(status_code=403, detail="No tienes un perfil de aliado")

    recompensa = supabase.table("recompensas").select("id, propietario_id, estado").eq(
        "id", recompensa_id
    ).execute()
    if not recompensa.data:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")

    fila = recompensa.data[0]
    if fila["propietario_id"] != perfil.data[0]["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre esta recompensa")

    transicion = TRANSICIONES_ESTADO_RECOMPENSA[accion]
    if fila["estado"] not in transicion["desde"]:
        raise HTTPException(
            status_code=400,
            detail=f"No puedes '{accion}' una recompensa en estado '{fila['estado']}'"
        )

    actualizado = supabase.table("recompensas").update({
        "estado": transicion["hacia"]
    }).eq("id", recompensa_id).execute()

    return actualizado.data[0]


def expirar_recompensas_vencidas() -> int:
    """Cron — mismo patrón que expirar_propuestas_vencidas en
    coverage_service.py, llamado desde /internal/recompensas/run. Una
    recompensa 'borrador' nunca llegó a publicarse y una 'archivada' ya
    salió del ciclo, así que solo activa/pausada pueden vencer."""
    hoy = date.today().isoformat()
    resultado = supabase.table("recompensas").update({
        "estado": "vencida"
    }).lt("vencimiento", hoy).in_("estado", ["activa", "pausada"]).execute()
    return len(resultado.data or [])


def descontar_unidad_recompensa(recompensa_id: str) -> dict:
    """Se invoca al confirmar un canje (flujo de Persona 5) — un
    inventario en cero cambia a 'agotada' automáticamente. Vive aquí y no
    en el módulo de canjes porque 'recompensas' es la única dueña de sus
    propias reglas de inventario."""
    recompensa = supabase.table("recompensas").select(
        "id, estado, unidades_disponibles"
    ).eq("id", recompensa_id).execute()
    if not recompensa.data:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")

    fila = recompensa.data[0]
    if fila["estado"] != "activa" or fila["unidades_disponibles"] <= 0:
        raise HTTPException(
            status_code=409,
            detail="Esta recompensa no tiene inventario disponible"
        )

    unidades_restantes = fila["unidades_disponibles"] - 1
    nuevo_estado = "agotada" if unidades_restantes == 0 else "activa"

    actualizado = supabase.table("recompensas").update({
        "unidades_disponibles": unidades_restantes,
        "estado": nuevo_estado,
    }).eq("id", recompensa_id).eq("unidades_disponibles", fila["unidades_disponibles"]).execute()

    if not actualizado.data:
        raise HTTPException(
            status_code=409,
            detail="El inventario cambió, vuelve a intentarlo"
        )

    return actualizado.data[0]


def eliminar_recompensa(recompensa_id: str, usuario_id: str) -> None:
    perfil = supabase.table("perfil_apoyo").select("id").eq("usuario_id", usuario_id).execute()
    if not perfil.data:
        raise HTTPException(status_code=403, detail="No tienes un perfil de aliado")
    recompensa = supabase.table("recompensas").select("id, propietario_id, estado").eq("id", recompensa_id).execute()
    if not recompensa.data:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")
    fila = recompensa.data[0]
    if fila["propietario_id"] != perfil.data[0]["id"]:
        raise HTTPException(status_code=403, detail="No tienes permiso sobre esta recompensa")
    canjes = supabase.table("canjes_recompensa").select("id", count="exact").eq("recompensa_id", recompensa_id).limit(1).execute()
    if canjes.data:
        raise HTTPException(status_code=409, detail="No puedes eliminar una recompensa que tiene canjes")
    if fila["estado"] != "borrador":
        raise HTTPException(status_code=409, detail="Solo puedes eliminar recompensas en borrador")
    supabase.table("recompensas").delete().eq("id", recompensa_id).execute()


def emitir_canje(recompensa_id: str, beneficiario_id: str) -> dict:
    """Reserva una unidad y crea el código en una sola transacción SQL."""
    resultado = supabase.rpc("emitir_canje_recompensa", {
        "p_recompensa_id": recompensa_id,
        "p_beneficiario_id": beneficiario_id,
    }).execute()
    if not resultado.data:
        raise HTTPException(status_code=409, detail="No fue posible emitir el canje")
    return resultado.data[0] if isinstance(resultado.data, list) else resultado.data


def confirmar_canje(codigo: str, usuario_id: str) -> dict:
    perfil = _obtener_perfil_elegible_o_falla(usuario_id)
    resultado = supabase.rpc("confirmar_canje_recompensa", {
        "p_codigo": codigo,
        "p_propietario_id": perfil["id"],
    }).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Código de canje no encontrado o no pertenece a tus recompensas")
    canje = resultado.data[0] if isinstance(resultado.data, list) else resultado.data
    
    # 1. Confirmar puntos reservados (Persona 5)
    try:
        from app.services.reputacion_service import confirmar_puntos_reservados
        usuario = supabase.table("usuarios").select("roles(nombre)").eq("id", canje["beneficiario_id"]).execute()
        rol = (usuario.data[0].get("roles") or {}).get("nombre") if usuario.data else None
        
        confirmar_puntos_reservados(
            usuario_id=canje["beneficiario_id"],
            rol=rol,
            regla="canje_recompensa",
            tipo_origen="canje",
            evento_origen_id=canje["id"],
            puntos=canje["costo_snapshot"]
        )
    except Exception as e:
        print(f"[WARN] No se pudo confirmar_puntos_reservados para canje {canje['id']}: {e}")

    # 2. Guardar el patrocinador que confirmo
    try:
        supabase.table("canjes_recompensa").update({
            "patrocinador_confirmacion_id": perfil["id"]
        }).eq("id", canje["id"]).execute()
    except Exception as e:
        print(f"[WARN] No se pudo guardar patrocinador_confirmacion_id para canje {canje['id']}: {e}")

    # 3. Evaluar insignias aliado (Persona 4)
    try:
        from app.services.insignias_aliado_service import evaluar_insignias_aliado
        evaluar_insignias_aliado(usuario_id)
    except Exception:
        pass
        
    return canje
