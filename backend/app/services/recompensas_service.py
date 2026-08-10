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
    try:
        from app.services.insignias_aliado_service import evaluar_insignias_aliado
        evaluar_insignias_aliado(usuario_id)
    except Exception:
        pass
    return canje
