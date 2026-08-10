"""
Sistema de Incidentes (Persona 1 - Jass).

Unica via legitima para reducir trust_score a partir de ahora. La puerta
directa (ajustar_trust_score con tipo='reduccion') sigue existiendo en
reputacion_service.py porque las funciones SQL de 0048 no desaparecen,
pero el flujo de negocio correcto para TODAS las reducciones de
Persona 2/3 es: registrar_incidente -> confirmar_incidente. Nunca deben
llamar ajustar_trust_score directo para restar puntos.

Los incrementos NO cambian: siguen siendo automaticos, disparados
directo por reputacion_service.ajustar_trust_score(tipo='incremento').

Mismo estilo que reputacion_service.py: supabase_admin, print[WARN] en
lo secundario (aunque aqui casi nada es "secundario" -- registrar/
confirmar/rechazar un incidente son la operacion principal del endpoint
que las llama, no un efecto colateral, por eso NO se envuelven en
try/except silencioso como otorgar_puntos).
"""

from datetime import datetime, timezone

from app.db.supabase import supabase_admin as supabase

ESTADOS_ABIERTOS = ("pendiente", "requiere_informacion")


class PermisoDenegadoError(Exception):
    """La asociacion/usuario no tiene autoridad sobre este incidente/caso."""


class IncidenteNoEncontradoError(Exception):
    """No existe ningun incidente con ese id. Mapea a 404."""


class IncidenteEnEstadoInvalidoError(Exception):
    """El incidente existe pero su estado actual no permite la
    operacion solicitada (ej. confirmar uno ya confirmado). Mapea a
    409: el recurso esta ahi, pero alguien mas ya lo resolvio."""


def _es_admin(actor_tipo: str) -> bool:
    return actor_tipo == "admin"


def _validar_permiso_sobre_reporte(reporte_id: str | None, actor_id: str, actor_tipo: str) -> None:
    """Una asociacion solo puede registrar/revisar incidentes de casos
    bajo su propia coordinacion. Un admin puede cualquiera. Si el
    incidente no esta ligado a un reporte (reporte_id is None), solo
    admin puede operarlo -- no hay forma de verificar "coordinacion"
    sin un caso de por medio."""
    if _es_admin(actor_tipo):
        return
    if not reporte_id:
        raise PermisoDenegadoError("Solo un administrador puede operar un incidente sin reporte asociado")

    reporte = supabase.table("reportes").select("asociacion_asignada_id").eq("id", reporte_id).execute()
    if not reporte.data:
        raise PermisoDenegadoError("Reporte no encontrado")

    usuario = supabase.table("usuarios").select("asociacion_id").eq("id", actor_id).execute()
    asociacion_actor = usuario.data[0]["asociacion_id"] if usuario.data else None

    if not asociacion_actor or reporte.data[0]["asociacion_asignada_id"] != asociacion_actor:
        raise PermisoDenegadoError("Este caso no esta bajo la coordinacion de tu asociacion")


def registrar_incidente(
    usuario_id: str,
    rol: str,
    tipo_incidente: str,
    descripcion: str,
    registrado_por: str,
    actor_tipo: str,
    reporte_id: str | None = None,
    evidencias: list | None = None,
) -> dict:
    """Crea el incidente en estado 'pendiente'. No toca trust_score
    todavia -- eso solo ocurre al confirmar."""
    _validar_permiso_sobre_reporte(reporte_id, registrado_por, actor_tipo)

    catalogo = (
        supabase.table("incidente_tipos_catalogo")
        .select("id")
        .eq("clave", tipo_incidente).eq("rol", rol).eq("activo", True)
        .execute()
    )
    if not catalogo.data:
        raise ValueError(f"'{tipo_incidente}' no es un tipo de incidente valido para rol '{rol}'")

    creado = supabase.table("incidentes").insert({
        "usuario_id": usuario_id,
        "rol": rol,
        "reporte_id": reporte_id,
        "tipo_incidente": tipo_incidente,
        "descripcion": descripcion,
        "evidencias": evidencias or [],
        "registrado_por": registrado_por,
    }).execute()
    return creado.data[0]


def marcar_requiere_informacion(incidente_id: str, actor_id: str, actor_tipo: str, motivo: str) -> dict:
    incidente = _obtener_incidente_abierto(incidente_id)
    _validar_permiso_sobre_reporte(incidente.get("reporte_id"), actor_id, actor_tipo)

    actualizado = (
        supabase.table("incidentes")
        .update({
            "estado": "requiere_informacion",
            "motivo_resolucion": motivo,
            "actualizado_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", incidente_id)
        .execute()
    )
    return actualizado.data[0]


def rechazar_incidente(incidente_id: str, actor_id: str, actor_tipo: str, motivo: str) -> dict:
    """Rechazar NO modifica trust_score -- solo cierra el incidente."""
    incidente = _obtener_incidente_abierto(incidente_id)
    _validar_permiso_sobre_reporte(incidente.get("reporte_id"), actor_id, actor_tipo)

    actualizado = (
        supabase.table("incidentes")
        .update({
            "estado": "rechazado",
            "motivo_resolucion": motivo,
            "confirmado_por": actor_id,
            "actualizado_at": datetime.now(timezone.utc).isoformat(),
            "resuelto_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", incidente_id)
        .execute()
    )
    return actualizado.data[0]


def confirmar_incidente(incidente_id: str, confirmado_por: str, actor_tipo: str) -> dict:
    """Unico punto que realmente reduce trust_score. Valida permiso de
    coordinacion Y que el confirmador no sea el propio afectado (esta
    segunda validacion tambien vive en el CHECK de la tabla y en la RPC,
    como defensa en profundidad -- tres capas, no es redundancia inútil:
    Python valida temprano con buen mensaje de error, la RPC y el CHECK
    protegen contra cualquier otra via de escritura que se nos escape).
    """
    incidente = _obtener_incidente_abierto(incidente_id)
    _validar_permiso_sobre_reporte(incidente.get("reporte_id"), confirmado_por, actor_tipo)

    if confirmado_por == incidente["usuario_id"]:
        raise PermisoDenegadoError("El usuario involucrado no puede confirmar su propio incidente")

    resultado = supabase.rpc("confirmar_incidente_atomico", {
        "p_incidente_id": incidente_id,
        "p_confirmado_por": confirmado_por,
    }).execute()
    return resultado.data


def revertir_incidente(incidente_id: str, admin_id: str, actor_tipo: str) -> dict:
    """Solo admin puede revertir -- decision explicita: quien confirmo
    la sancion no deberia poder deshacerla sin supervision externa."""
    if not _es_admin(actor_tipo):
        raise PermisoDenegadoError("Solo un administrador puede revertir un incidente confirmado")

    resultado = supabase.rpc("revertir_incidente_atomico", {
        "p_incidente_id": incidente_id,
        "p_admin_id": admin_id,
    }).execute()
    return resultado.data


def obtener_tipos_incidente(rol: str) -> list[dict]:
    """Catalogo para poblar el formulario de registro en frontend."""
    resultado = (
        supabase.table("incidente_tipos_catalogo")
        .select("clave, valor_reduccion, descripcion")
        .eq("rol", rol).eq("activo", True)
        .order("valor_reduccion")
        .execute()
    )
    return resultado.data or []


def _obtener_incidente_abierto(incidente_id: str) -> dict:
    incidente = supabase.table("incidentes").select("*").eq("id", incidente_id).execute()
    if not incidente.data:
        raise IncidenteNoEncontradoError("Incidente no encontrado")
    if incidente.data[0]["estado"] not in ESTADOS_ABIERTOS:
        raise IncidenteEnEstadoInvalidoError(
            f"El incidente esta en estado '{incidente.data[0]['estado']}', no se puede operar"
        )
    return incidente.data[0]