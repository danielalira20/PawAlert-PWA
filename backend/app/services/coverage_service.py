"""Cobertura coordinada y ofrecimientos de voluntariado externo.

La disponibilidad para externos se calcula de forma independiente al estado
del rescate. La selección definitiva siempre se delega a la función SQL
``reservar_cobertura_reporte`` para evitar dobles asignaciones.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from fastapi import HTTPException

from app.db.supabase import supabase, supabase_admin
from app.services import matching, reputacion_service
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response


ESTADOS_VOLUNTARIO_ACTIVO = ("activo_nivel_1", "activo_nivel_2")
PROPUESTA_COBERTURA_MINUTOS = 10


def _reporte_disponible_para_cobertura(
    reporte_id: str, asociacion_id: str
) -> bool:
    resultado = (
        supabase_admin.table("reportes")
        .select(
            "id, estado_validacion_reporte, estado_reporte, estado_cobertura, "
            "asociacion_asignada_id, staff_asignado_id"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    reporte = resultado.data[0] if resultado.data else None
    return bool(
        reporte
        and reporte.get("estado_validacion_reporte") == "aprobado"
        and reporte.get("estado_reporte") == "asignado"
        and reporte.get("estado_cobertura") == "abierto"
        and reporte.get("asociacion_asignada_id") == asociacion_id
        and reporte.get("staff_asignado_id") is None
    )


def obtener_perfil_externo(usuario_id: str) -> dict:
    resultado = (
        supabase.table("voluntarios")
        .select(
            "id, usuario_id, estado, disponible_operativamente, "
            "pausa_operativa_hasta, capacidades("
            "latitud, longitud, radio_max_km, max_casos_simultaneos, "
            "especies_manejo, especies, tamanios_manejo, tamanios, "
            "disponibilidad, tiempo_reaccion, disponibilidad_urgencias, "
            "experiencias_campo, primeros_auxilios_nivel, experiencia_anios, "
            "trayectoria_tipos, medios_transporte, vehiculo_apto_traslado, "
            "equipamiento)"
        )
        .eq("usuario_id", usuario_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(
            status_code=403,
            detail="Necesitas un perfil de voluntariado externo verificado",
        )

    perfil = resultado.data[0]
    if perfil.get("estado") != "activo_nivel_2":
        raise HTTPException(
            status_code=403,
            detail="Necesitas verificación externa activa de nivel 2",
        )
    if not _esta_disponible(perfil):
        raise HTTPException(
            status_code=409,
            detail="Activa tu disponibilidad para consultar casos cercanos",
        )

    capacidades = perfil.get("capacidades") or {}
    if isinstance(capacidades, list):
        capacidades = capacidades[0] if capacidades else {}
    perfil["capacidades"] = capacidades
    if capacidades.get("latitud") is None or capacidades.get("longitud") is None:
        raise HTTPException(
            status_code=422,
            detail="Completa tu ubicación y radio de atención",
        )
    return perfil


def obtener_casos_cercanos(usuario_id: str) -> list[dict]:
    perfil = obtener_perfil_externo(usuario_id)
    capacidades = perfil["capacidades"]
    carga_actual = _carga_activa(usuario_id)
    max_casos = int(capacidades.get("max_casos_simultaneos") or 1)
    if carga_actual >= max_casos:
        return []

    # --- GAMIFICACIÓN: Restricciones operativas (Trust Score < 40) ---
    try:
        restricciones = reputacion_service.consultar_restricciones(
            usuario_id,
            reputacion_service.ROL_VOLUNTARIO_EXTERNO,
        )
        if restricciones.get("bloqueado_nuevas_asignaciones", False):
            # Si está bloqueado, devolvemos una lista vacía para que no vea nuevos casos en el mapa.
            # Según las reglas de Jass, "puede_finalizar_activos_en_curso" siempre es True,
            # así que sus casos asignados actuales no se ven afectados.
            return []
    except Exception as e:
        print(f"[WARN] Error al consultar restricciones de asignación para {usuario_id}: {e}")

    resultado = (
        supabase.table("reportes")
        .select(
            "id, estado_reporte, estado_cobertura, asociacion_asignada_id, "
            "staff_asignado_id, municipio, colonia, latitud, longitud, "
            "created_at, asociaciones(nombre), "
            "animal(id, orden, es_grupo, cantidad, sexo, edad_aproximada, "
            "descripcion, tipo_animal_catalogo(clave), "
            "condicion_catalogo(clave), tamanio_catalogo(clave), "
            "animal_fotos(foto_url, orden))"
        )
        .eq("estado_reporte", "asignado")
        .eq("estado_validacion_reporte", "aprobado")
        .eq("estado_cobertura", "abierto")
        .in_("estado_moderacion", ["visible", "aprobado"])
        .is_("staff_asignado_id", "null")
        .not_.is_("asociacion_asignada_id", "null")
        .order("created_at", desc=True)
        .execute()
    )

    ofrecimientos = _ofrecimientos_del_voluntario(perfil["id"])
    casos = []
    for reporte in resultado.data or []:
        if reporte.get("latitud") is None or reporte.get("longitud") is None:
            continue
        animales_crudos, _ = shape_animal_embed(reporte.get("animal"))
        animales = [shape_animal_response(animal) for animal in animales_crudos]
        if not _animales_compatibles(animales, capacidades):
            continue

        distancia = _distancia_km(
            float(capacidades["latitud"]),
            float(capacidades["longitud"]),
            float(reporte["latitud"]),
            float(reporte["longitud"]),
        )
        radio = min(float(capacidades.get("radio_max_km") or 0), 30)
        if radio <= 0 or distancia > radio:
            continue

        casos.append(
            {
                "id": reporte["id"],
                "estado_cobertura": reporte["estado_cobertura"],
                "municipio": reporte.get("municipio"),
                "colonia": reporte.get("colonia"),
                "latitud_aproximada": round(float(reporte["latitud"]), 3),
                "longitud_aproximada": round(float(reporte["longitud"]), 3),
                "distancia_km": round(distancia),
                "distancia_precisa_km": round(distancia, 1),
                "created_at": str(reporte["created_at"]),
                "asociacion_coordinadora": (
                    reporte.get("asociaciones") or {}
                ).get("nombre"),
                "animales": animales,
                "ofrecimiento": ofrecimientos.get(reporte["id"]),
            }
        )
    return casos


def crear_ofrecimiento(usuario_id: str, reporte_id: str) -> dict:
    restricciones = reputacion_service.consultar_restricciones(
        usuario_id,
        reputacion_service.ROL_VOLUNTARIO_EXTERNO,
    )
    if restricciones["bloqueado_nuevas_asignaciones"]:
        raise HTTPException(
            status_code=403,
            detail=(
                "No puedes ofrecerte a casos nuevos por ahora. "
                "Sí puedes finalizar tus casos activos."
            ),
        )
    perfil = obtener_perfil_externo(usuario_id)

    elegibles = {
        caso["id"]: caso for caso in obtener_casos_cercanos(usuario_id)
    }
    caso = elegibles.get(reporte_id)
    if not caso:
        raise HTTPException(
            status_code=409,
            detail="Este caso ya no está disponible o no coincide con tu perfil",
        )

    capacidades = perfil["capacidades"]
    carga_actual = _carga_activa(usuario_id)
    max_casos = int(capacidades.get("max_casos_simultaneos") or 1)
    evaluacion = matching.evaluar_candidato_externo(
        reporte_id,
        capacidades,
        caso["distancia_precisa_km"],
        carga_actual,
        max_casos,
    )
    try:
        resultado = supabase_admin.rpc(
            "crear_ofrecimiento_externo",
            {
                "p_reporte_id": reporte_id,
                "p_voluntario_id": perfil["id"],
                "p_usuario_id": usuario_id,
                "p_compatibilidad": evaluacion["score"]["total"],
                "p_distancia_km": caso["distancia_precisa_km"],
                "p_capacidad_disponible": max(0, max_casos - carga_actual),
            },
        ).execute()
    except Exception as exc:
        detalle = str(exc).lower()
        if "caso_no_disponible" in detalle:
            raise HTTPException(
                status_code=409,
                detail="El caso acaba de cambiar y ya no acepta ofrecimientos",
            ) from exc
        if "voluntario_externo_no_elegible" in detalle:
            raise HTTPException(
                status_code=403,
                detail="Tu verificación externa ya no está activa",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="No pudimos registrar tu ofrecimiento. Inténtalo nuevamente.",
        ) from exc

    return resultado.data or {
        "reporte_id": reporte_id,
        "voluntario_id": perfil["id"],
        "estado": "vigente",
    }


def retirar_ofrecimiento(usuario_id: str, reporte_id: str) -> dict:
    perfil = obtener_perfil_externo(usuario_id)
    try:
        resultado = supabase_admin.rpc(
            "retirar_ofrecimiento_externo",
            {
                "p_reporte_id": reporte_id,
                "p_voluntario_id": perfil["id"],
                "p_usuario_id": usuario_id,
            },
        ).execute()
    except Exception as exc:
        if "ofrecimiento_no_retirable" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="El ofrecimiento ya fue seleccionado o dejó de estar vigente",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="No pudimos retirar tu ofrecimiento. Inténtalo nuevamente.",
        ) from exc
    return {"ok": True, "ofrecimiento": resultado.data}


def obtener_ofrecimientos_reporte(reporte_id: str) -> list[dict]:
    resultado = (
        supabase_admin.table("voluntario_ofrecimientos")
        .select(
            "id, voluntario_id, estado, compatibilidad, distancia_km, "
            "capacidad_disponible, ofrecido_at"
        )
        .eq("reporte_id", reporte_id)
        .in_("estado", ["vigente", "seleccionado"])
        .order("ofrecido_at")
        .execute()
    )
    ofrecimientos = []
    for oferta in resultado.data or []:
        perfil = (
            supabase_admin.table("voluntarios")
            .select(
                "id, usuario_id, estado, usuarios("
                "nombre, apellido_paterno), "
                "capacidades(radio_max_km, max_casos_simultaneos, "
                "disponibilidad, tiempo_reaccion, disponibilidad_urgencias, "
                "experiencias_campo, primeros_auxilios_nivel, experiencia_anios, "
                "trayectoria_tipos, medios_transporte, vehiculo_apto_traslado, "
                "equipamiento)"
            )
            .eq("id", oferta["voluntario_id"])
            .limit(1)
            .execute()
        )
        if not perfil.data:
            continue
        voluntario = perfil.data[0]
        usuario = voluntario.get("usuarios") or {}
        capacidades = voluntario.get("capacidades") or {}
        if isinstance(capacidades, list):
            capacidades = capacidades[0] if capacidades else {}
        max_casos = int(capacidades.get("max_casos_simultaneos") or 1)
        carga_actual = _carga_activa(voluntario["usuario_id"])
        evaluacion = matching.evaluar_candidato_externo(
            reporte_id,
            capacidades,
            float(oferta.get("distancia_km") or 0),
            carga_actual,
            max_casos,
        )
        ofrecimientos.append(
            {
                **oferta,
                "nombre": " ".join(
                    filter(
                        None,
                        [
                            usuario.get("nombre"),
                            usuario.get("apellido_paterno"),
                        ],
                    )
                ),
                "foto_url": None,
                "etiqueta": "Se ofreció",
                "tipo": "voluntario_externo",
                **evaluacion,
            }
        )
    return ofrecimientos


def obtener_propuestas_pendientes(usuario_id: str) -> list[dict]:
    resultado = (
        supabase_admin.table("propuestas_asignacion")
        .select("id, reporte_id, enviada_at, vence_at")
        .eq("usuario_asignado_id", usuario_id)
        .eq("estado", "activa")
        .order("enviada_at", desc=True)
        .execute()
    )
    return resultado.data or []


def reservar_cobertura(
    *,
    reporte_id: str,
    usuario_asignado_id: str,
    voluntario_id: str | None,
    asociacion_id: str,
    actor_id: str,
    origen: str,
) -> str:
    rol_reputacion = {
        "equipo_interno": reputacion_service.ROL_VOLUNTARIO_INTERNO,
        "ofrecimiento_externo": reputacion_service.ROL_VOLUNTARIO_EXTERNO,
    }.get(origen)
    if rol_reputacion:
        restricciones = reputacion_service.consultar_restricciones(
            usuario_asignado_id,
            rol_reputacion,
        )
        if restricciones["bloqueado_nuevas_asignaciones"]:
            raise HTTPException(
                status_code=409,
                detail=(
                    "El voluntario no puede recibir nuevas asignaciones "
                    "por ahora. Actualiza la lista y elige otro candidato."
                ),
            )
    if not _reporte_disponible_para_cobertura(reporte_id, asociacion_id):
        raise HTTPException(
            status_code=409,
            detail="El caso ya no está disponible. Actualiza la lista.",
        )
    vence_at = datetime.now(timezone.utc) + timedelta(
        minutes=PROPUESTA_COBERTURA_MINUTOS
    )
    try:
        resultado = supabase_admin.rpc(
            "reservar_cobertura_reporte",
            {
                "p_reporte_id": reporte_id,
                "p_usuario_asignado_id": usuario_asignado_id,
                "p_voluntario_id": voluntario_id,
                "p_asociacion_id": asociacion_id,
                "p_actor_id": actor_id,
                "p_origen": origen,
                "p_vence_at": vence_at.isoformat(),
            },
        ).execute()
    except Exception as exc:
        detalle = str(exc).lower()
        if (
            "caso_no_disponible" in detalle
            or "ofrecimiento_no_vigente" in detalle
            or "duplicate key" in detalle
        ):
            raise HTTPException(
                status_code=409,
                detail="El caso ya no está disponible. Actualiza la lista.",
            ) from exc
        if "42883" in detalle and (
            "st_point(" in detalle or "st_setsrid(" in detalle
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    "La configuración geográfica de Supabase necesita la "
                    "migración 0022 antes de enviar propuestas"
                ),
            ) from exc
        raise
    return str(resultado.data)


def expirar_propuestas_vencidas() -> int:
    """Libera de forma transaccional las propuestas que agotaron su plazo."""
    resultado = supabase_admin.rpc("expirar_propuestas_cobertura").execute()
    return int(resultado.data or 0)


def responder_propuesta(
    usuario_id: str,
    reporte_id: str,
    acepta: bool,
    motivo: str | None = None,
    rol: str | None = None,
) -> dict:
    propuesta_id = None
    if rol == "voluntario_interno":
        try:
            propuesta = (
                supabase_admin.table("propuestas_asignacion")
                .select("id")
                .eq("reporte_id", reporte_id)
                .eq("usuario_asignado_id", usuario_id)
                .eq("estado", "activa")
                .limit(1)
                .execute()
            )
            propuesta_id = propuesta.data[0]["id"] if propuesta.data else None
        except Exception as error:
            print(
                "[WARN] no se pudo identificar la propuesta para gamificación "
                f"(reporte={reporte_id}): {error}"
            )

    try:
        resultado = supabase_admin.rpc(
            "responder_propuesta_cobertura",
            {
                "p_reporte_id": reporte_id,
                "p_usuario_id": usuario_id,
                "p_acepta": acepta,
                "p_motivo": motivo,
            },
        ).execute()
    except Exception as exc:
        if "propuesta_no_disponible" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="La propuesta ya no está disponible",
            ) from exc
        raise

    if propuesta_id:
        try:
            from app.services.reputacion_service import (
                procesar_respuesta_propuesta_interna,
            )
            procesar_respuesta_propuesta_interna(propuesta_id, usuario_id)
        except Exception as error:
            print(
                "[WARN] no se pudo procesar la respuesta oportuna "
                f"(propuesta={propuesta_id}): {error}"
            )
    return {"ok": True, "estado_cobertura": resultado.data}


def _ofrecimientos_del_voluntario(voluntario_id: str) -> dict[str, dict]:
    resultado = (
        supabase_admin.table("voluntario_ofrecimientos")
        .select("id, reporte_id, estado, ofrecido_at")
        .eq("voluntario_id", voluntario_id)
        .in_("estado", ["vigente", "seleccionado"])
        .execute()
    )
    return {fila["reporte_id"]: fila for fila in (resultado.data or [])}


def _carga_activa(usuario_id: str) -> int:
    resultado = (
        supabase.table("reportes")
        .select("id", count="exact")
        .eq("staff_asignado_id", usuario_id)
        .in_("estado_cobertura", ["propuesta_enviada", "confirmado", "en_atencion"])
        .execute()
    )
    return int(resultado.count if resultado.count is not None else len(resultado.data or []))


def _esta_disponible(perfil: dict) -> bool:
    if perfil.get("disponible_operativamente"):
        return True
    pausa = perfil.get("pausa_operativa_hasta")
    if not pausa:
        return False
    try:
        fecha = datetime.fromisoformat(str(pausa).replace("Z", "+00:00"))
    except ValueError:
        return False
    return fecha <= datetime.now(timezone.utc)


def _animales_compatibles(animales: list[dict], capacidades: dict) -> bool:
    especies_perfil = set(
        capacidades.get("especies_manejo")
        or capacidades.get("especies")
        or []
    )
    tamanios_perfil = set(
        capacidades.get("tamanios_manejo")
        or capacidades.get("tamanios")
        or []
    )
    especies_caso = {
        animal["tipo_animal"]
        for animal in animales
        if animal.get("tipo_animal")
    }
    tamanios_caso = {
        animal["tamanio"] for animal in animales if animal.get("tamanio")
    }
    return (
        (not especies_caso or especies_caso.issubset(especies_perfil))
        and (not tamanios_caso or tamanios_caso.issubset(tamanios_perfil))
    )


def _distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radio_tierra = 6371.0088
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * radio_tierra * asin(sqrt(a))
