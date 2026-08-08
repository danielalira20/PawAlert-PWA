from datetime import date

from fastapi import HTTPException
from app.db.supabase import supabase
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
        "id, tipo, verificado_admin"
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


TRANSICIONES_ESTADO_RECOMPENSA = {
    "publicar": {"desde": {"borrador"}, "hacia": "activa"},
    "pausar": {"desde": {"activa"}, "hacia": "pausada"},
    "reactivar": {"desde": {"pausada"}, "hacia": "activa"},
    "archivar": {"desde": {"borrador", "activa", "pausada", "agotada", "vencida"}, "hacia": "archivada"},
}


async def crear_recompensa(usuario_id: str, body: RecompensaCreate) -> dict:
    perfil = _obtener_perfil_elegible_o_falla(usuario_id)
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
    return resultado.data or []


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
