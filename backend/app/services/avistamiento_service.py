"""Registro y validacion de avistamientos (Capa 8, Entrega A).

Publica el evento `ubicacion_confirmada` en `historial_reporte` -- es el
contrato de desbloqueo que Urgency (Capa 2) necesita para engancharse a
cambios de ubicacion confirmada del animal. El nombre y shape de ese
evento no se cambian sin avisar.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException

from app.db.supabase import supabase_admin
from app.models.dispatch import (
    AvistamientoCreate,
    AvistamientoResult,
    CoordinationEvent,
    LocationSource,
)
from app.services.coverage_service import _distancia_km

ESTADO_VOLUNTARIO_VERIFICADO = "activo_nivel_2"
ROLES_ASOCIACION = ("asociacion", "staff")
logger = logging.getLogger(__name__)


def _obtener_reporte(reporte_id: str) -> dict:
    resultado = (
        supabase_admin.table("reportes")
        .select(
            "id, usuario_id, staff_asignado_id, asociacion_asignada_id, "
            "latitud, longitud, ultima_ubicacion_confirmada_id, "
            "ultima_latitud_confirmada, ultima_longitud_confirmada"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return resultado.data[0]


def _obtener_usuario(usuario_id: str) -> dict:
    resultado = (
        supabase_admin.table("usuarios")
        .select("id, asociacion_id, roles(nombre)")
        .eq("id", usuario_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }


def _es_asociacion_asignada(usuario: dict, reporte: dict) -> bool:
    return (
        usuario.get("rol") in ROLES_ASOCIACION
        and usuario.get("asociacion_id") is not None
        and usuario.get("asociacion_id") == reporte.get("asociacion_asignada_id")
    )


def _ubicacion_referencia(reporte: dict) -> tuple[float, float] | None:
    """Punto contra el que se mide la cercania de un voluntario_verificado:
    la ultima ubicacion confirmada si ya existe, o el punto original del
    reporte mientras no haya ninguna todavia."""
    ultima_latitud = reporte.get("ultima_latitud_confirmada")
    ultima_longitud = reporte.get("ultima_longitud_confirmada")
    if ultima_latitud is not None and ultima_longitud is not None:
        return float(ultima_latitud), float(ultima_longitud)

    ultima_id = reporte.get("ultima_ubicacion_confirmada_id")
    if ultima_id:
        avistamiento = (
            supabase_admin.table("avistamientos_animal")
            .select("latitud, longitud")
            .eq("id", ultima_id)
            .limit(1)
            .execute()
        )
        if avistamiento.data:
            fila = avistamiento.data[0]
            return float(fila["latitud"]), float(fila["longitud"])

    if reporte.get("latitud") is not None and reporte.get("longitud") is not None:
        return float(reporte["latitud"]), float(reporte["longitud"])
    return None


def _voluntario_verificado_cerca(usuario_id: str, reporte: dict) -> bool:
    """Mismo patron que coverage_service.obtener_casos_cercanos: Haversine
    contra el radio_max_km que el propio voluntario externo declaro en sus
    capacidades. No calcula ninguna zona dinamica -- eso es Entrega B."""
    referencia = _ubicacion_referencia(reporte)
    if referencia is None:
        return False

    resultado = (
        supabase_admin.table("voluntarios")
        .select("estado, capacidades(latitud, longitud, radio_max_km)")
        .eq("usuario_id", usuario_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        return False

    perfil = resultado.data[0]
    if perfil.get("estado") != ESTADO_VOLUNTARIO_VERIFICADO:
        return False

    capacidades = perfil.get("capacidades") or {}
    if isinstance(capacidades, list):
        capacidades = capacidades[0] if capacidades else {}
    if capacidades.get("latitud") is None or capacidades.get("longitud") is None:
        return False

    radio = float(capacidades.get("radio_max_km") or 0)
    if radio <= 0:
        return False

    distancia = _distancia_km(
        float(capacidades["latitud"]),
        float(capacidades["longitud"]),
        referencia[0],
        referencia[1],
    )
    return distancia <= radio


def _resolver_fuente(reporte: dict, usuario: dict) -> LocationSource | None:
    usuario_id = usuario["id"]
    if reporte.get("usuario_id") == usuario_id:
        return LocationSource.confirmacion_reportante
    if reporte.get("staff_asignado_id") == usuario_id:
        return LocationSource.voluntario_asignado
    if _es_asociacion_asignada(usuario, reporte):
        return LocationSource.asociacion
    if _voluntario_verificado_cerca(usuario_id, reporte):
        return LocationSource.voluntario_verificado
    return None


def _a_resultado(fila: dict) -> AvistamientoResult:
    return AvistamientoResult(
        id=fila["id"],
        reporte_id=fila["reporte_id"],
        animal_id=fila["animal_id"],
        fuente=LocationSource(fila["fuente"]),
        estado_validacion=fila["estado_validacion"],
        registrado_at=fila["registrado_at"],
    )


def _emitir_ubicacion_confirmada(
    *,
    reporte_id: str,
    avistamiento_id: str,
    latitud: float,
    longitud: float,
    fuente: LocationSource,
) -> None:
    supabase_admin.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": None,
            "tipo_evento": CoordinationEvent.ubicacion_confirmada.value,
            "descripcion": "Se confirmó una nueva ubicación del animal.",
            "datos_extra": {
                "avistamiento_id": avistamiento_id,
                "latitud": latitud,
                "longitud": longitud,
                "fuente": fuente.value,
            },
        }
    ).execute()


def _confirmar_avistamiento(
    *,
    reporte_id: str,
    avistamiento_id: str,
    latitud: float,
    longitud: float,
    fuente: LocationSource,
) -> None:
    supabase_admin.table("reportes").update(
        {
            "ultima_ubicacion_confirmada_id": avistamiento_id,
            "ultima_latitud_confirmada": latitud,
            "ultima_longitud_confirmada": longitud,
        }
    ).eq("id", reporte_id).execute()
    _emitir_ubicacion_confirmada(
        reporte_id=reporte_id,
        avistamiento_id=avistamiento_id,
        latitud=latitud,
        longitud=longitud,
        fuente=fuente,
    )
    try:
        from app.services.assignment_route_service import (
            recalculate_confirmed_assignment_route,
        )

        recalculate_confirmed_assignment_route(reporte_id)
    except Exception:
        logger.warning(
            "No se pudo recalcular la ruta del reporte %s tras confirmar "
            "una ubicacion",
            reporte_id,
            exc_info=True,
        )


def registrar_avistamiento(
    reporte_id: str, usuario_id: str, data: AvistamientoCreate
) -> AvistamientoResult:
    reporte = _obtener_reporte(reporte_id)
    usuario = _obtener_usuario(usuario_id)

    fuente = _resolver_fuente(reporte, usuario)
    if fuente is None:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para registrar un avistamiento en este reporte",
        )

    animal = (
        supabase_admin.table("animal")
        .select("id")
        .eq("id", data.animal_id)
        .eq("reporte_id", reporte_id)
        .limit(1)
        .execute()
    )
    if not animal.data:
        raise HTTPException(
            status_code=422,
            detail="El animal indicado no pertenece a este reporte",
        )

    auto_validado = fuente in (
        LocationSource.asociacion,
        LocationSource.administracion,
    )
    insertado = (
        supabase_admin.table("avistamientos_animal")
        .insert(
            {
                "reporte_id": reporte_id,
                "animal_id": data.animal_id,
                "latitud": data.latitud,
                "longitud": data.longitud,
                "precision_metros": data.precision_metros,
                "observado_at": data.observado_at.isoformat(),
                "fuente": fuente.value,
                "usuario_id": usuario_id,
                "movilidad_observada": (
                    data.movilidad_observada.value
                    if data.movilidad_observada
                    else None
                ),
                "direccion_observada": data.direccion_observada,
                "comentario": data.comentario,
                "estado_validacion": "validado" if auto_validado else "pendiente",
            }
        )
        .execute()
    )
    if not insertado.data:
        raise HTTPException(
            status_code=500, detail="No se pudo registrar el avistamiento"
        )

    fila = insertado.data[0]
    if auto_validado:
        _confirmar_avistamiento(
            reporte_id=reporte_id,
            avistamiento_id=fila["id"],
            latitud=data.latitud,
            longitud=data.longitud,
            fuente=fuente,
        )

    return _a_resultado(fila)


def validar_avistamiento(
    avistamiento_id: str, usuario_id: str, aprobar: bool
) -> AvistamientoResult:
    resultado = (
        supabase_admin.table("avistamientos_animal")
        .select(
            "id, reporte_id, animal_id, fuente, estado_validacion, "
            "latitud, longitud, registrado_at"
        )
        .eq("id", avistamiento_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Avistamiento no encontrado")
    avistamiento = resultado.data[0]

    reporte = _obtener_reporte(avistamiento["reporte_id"])
    usuario = _obtener_usuario(usuario_id)

    es_staff_asignado = reporte.get("staff_asignado_id") == usuario_id
    if not es_staff_asignado and not _es_asociacion_asignada(usuario, reporte):
        raise HTTPException(
            status_code=403,
            detail=(
                "Solo el staff o la asociación asignada pueden validar "
                "este avistamiento"
            ),
        )

    if avistamiento["estado_validacion"] != "pendiente":
        raise HTTPException(
            status_code=409, detail="Este avistamiento ya fue resuelto"
        )

    nuevo_estado = "validado" if aprobar else "rechazado"
    actualizado = (
        supabase_admin.table("avistamientos_animal")
        .update({"estado_validacion": nuevo_estado})
        .eq("id", avistamiento_id)
        .eq("estado_validacion", "pendiente")
        .execute()
    )
    if not actualizado.data:
        raise HTTPException(
            status_code=409, detail="Este avistamiento ya fue resuelto"
        )

    if aprobar:
        _confirmar_avistamiento(
            reporte_id=avistamiento["reporte_id"],
            avistamiento_id=avistamiento_id,
            latitud=avistamiento["latitud"],
            longitud=avistamiento["longitud"],
            fuente=LocationSource(avistamiento["fuente"]),
        )

    avistamiento["estado_validacion"] = nuevo_estado
    return _a_resultado(avistamiento)


def registrar_avistamiento_desde_hito(
    *,
    reporte_id: str,
    animal_id: str,
    usuario_id: str,
    latitud: float,
    longitud: float,
    tipo_hito: str,
) -> AvistamientoResult:
    """Avistamiento derivado de un hito de rescate ya registrado -- quien lo
    dispara ya es el voluntario asignado al caso, así que se inserta
    validado de inmediato, sin pasar por aprobación manual."""
    ahora = datetime.now(timezone.utc).isoformat()
    insertado = (
        supabase_admin.table("avistamientos_animal")
        .insert(
            {
                "reporte_id": reporte_id,
                "animal_id": animal_id,
                "latitud": latitud,
                "longitud": longitud,
                "observado_at": ahora,
                "fuente": LocationSource.voluntario_asignado.value,
                "usuario_id": usuario_id,
                "comentario": f"Registrado automáticamente desde el hito '{tipo_hito}'.",
                "estado_validacion": "validado",
            }
        )
        .execute()
    )
    if not insertado.data:
        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar el avistamiento derivado del hito",
        )

    fila = insertado.data[0]
    _confirmar_avistamiento(
        reporte_id=reporte_id,
        avistamiento_id=fila["id"],
        latitud=latitud,
        longitud=longitud,
        fuente=LocationSource.voluntario_asignado,
    )
    return _a_resultado(fila)
