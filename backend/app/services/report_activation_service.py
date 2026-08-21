"""Compuerta unica entre la validacion inicial y la operacion del reporte."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.db.supabase import supabase, supabase_admin
from app.services import matching
from app.services.assignment_service import asignar_asociacion
from app.utils.animal_shaping import CONDICION_SEVERIDAD


def _obtener_id_catalogo(tabla: str, clave: str) -> str | None:
    resultado = (
        supabase.table(tabla)
        .select("id")
        .eq("clave", clave)
        .eq("activo", True)
        .execute()
    )
    return resultado.data[0]["id"] if resultado.data else None


def _registrar_historial(
    reporte_id: str,
    tipo_evento: str,
    descripcion: str,
    datos_extra: dict | None = None,
) -> None:
    supabase.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": None,
            "tipo_evento": tipo_evento,
            "descripcion": descripcion,
            "datos_extra": datos_extra,
        }
    ).execute()


def enviar_reporte_a_revision(
    *,
    reporte_id: str,
    razones: list[dict],
    razones_exclusion_urgency: list[dict],
) -> dict:
    """Detiene el reporte antes de cobertura y lo coloca en revision humana."""
    ahora = datetime.now(timezone.utc).isoformat()
    actualizacion = (
        supabase.table("reportes")
        .update(
            {
                "estado_validacion_reporte": "revision_manual",
                "validacion_completada_at": ahora,
                "razones_validacion": razones,
                "estado_moderacion": "en_revision",
                "moderacion_origen": "validacion_inicial",
                "moderacion_actualizada_at": ahora,
                "estado_cobertura": None,
                "asociacion_asignada_id": None,
                "urgency_score": None,
                "urgency_nivel": None,
                "urgency_calculado_at": None,
                "urgency_proximo_recalculo_at": None,
                "urgency_excluido": True,
                "urgency_razones_exclusion": razones_exclusion_urgency,
            }
        )
        .eq("id", reporte_id)
        .eq("estado_validacion_reporte", "procesando")
        .execute()
    )
    if not actualizacion.data:
        raise HTTPException(
            status_code=409,
            detail="El reporte ya no esta disponible para revision inicial",
        )

    _registrar_historial(
        reporte_id,
        "validacion_reporte_revision_manual",
        "El reporte quedo detenido para revision antes de abrir cobertura.",
        {"razones": razones},
    )
    return {"estado": "revision_manual", "asociacion": None}


def marcar_reporte_duplicado_vinculable(
    *,
    reporte_id: str,
    reporte_original_id: str,
    razones: list[dict],
    razones_exclusion_urgency: list[dict],
) -> dict:
    """Conserva evidencia enlazada sin crear un segundo trabajo operativo."""
    estado_id = _obtener_id_catalogo("reporte_estados", "duplicado_vinculable")
    if not estado_id:
        raise HTTPException(
            status_code=500,
            detail="No se pudo resolver el estado del reporte duplicado",
        )

    ahora = datetime.now(timezone.utc).isoformat()
    actualizacion = (
        supabase.table("reportes")
        .update(
            {
                "estado_id": estado_id,
                "estado_reporte": "duplicado_vinculable",
                "estado_cobertura": None,
                "asociacion_asignada_id": None,
                "estado_validacion_reporte": "aprobado",
                "validacion_completada_at": ahora,
                "activado_at": None,
                "razones_validacion": razones,
                "urgency_score": None,
                "urgency_nivel": None,
                "urgency_calculado_at": None,
                "urgency_proximo_recalculo_at": None,
                "urgency_excluido": True,
                "urgency_razones_exclusion": razones_exclusion_urgency,
            }
        )
        .eq("id", reporte_id)
        .eq("reporte_original_id", reporte_original_id)
        .eq("estado_validacion_reporte", "procesando")
        .execute()
    )
    if not actualizacion.data:
        raise HTTPException(
            status_code=409,
            detail="El reporte ya no esta disponible para vincularse",
        )

    _registrar_historial(
        reporte_id,
        "reporte_duplicado_vinculado",
        "El reporte se vinculo a un caso existente sin abrir otra cobertura.",
        {"reporte_original_id": reporte_original_id},
    )
    return {"estado": "duplicado_vinculable", "asociacion": None}


def activar_reporte(
    *,
    reporte_id: str,
    latitud: float | None,
    longitud: float | None,
    especies: list[str],
    condicion_mas_grave: str,
    tipo_animal_mas_grave: str,
    municipio: str | None,
    estado_validacion_esperado: str = "procesando",
    razones_validacion: list[dict] | None = None,
    moderacion_aprobada_por: str | None = None,
    moderacion_notas: str | None = None,
) -> dict:
    """Activa un reporte validado y ejecuta sus efectos operativos.

    Ningun llamador debe elegir asociacion, abrir cobertura, notificar o
    calcular candidatos por separado. Las capas de validacion deciden si esta
    funcion se invoca; este servicio no interpreta sus senales.
    """
    asociacion = None
    if latitud is not None and longitud is not None:
        asociacion = asignar_asociacion(
            latitud,
            longitud,
            tipos_animales=list(dict.fromkeys(especies)),
            es_critico=condicion_mas_grave == "grave",
        )

    asociacion_id = asociacion.get("id") if asociacion else None
    estado_clave = "asignado" if asociacion_id else "sin_cobertura"
    estado_id = _obtener_id_catalogo("reporte_estados", estado_clave)
    if not estado_id:
        raise HTTPException(
            status_code=500,
            detail="No se pudo resolver el estado operativo del reporte",
        )

    asignacion_creada = False
    caso_administrativo_creado = False
    try:
        if asociacion_id:
            estado_asignacion_id = _obtener_id_catalogo(
                "asignacion_estados", "notificada"
            )
            if not estado_asignacion_id:
                raise HTTPException(
                    status_code=500,
                    detail="No se pudo preparar la asignacion de la asociacion",
                )
            supabase.table("reporte_asignaciones").insert(
                {
                    "reporte_id": reporte_id,
                    "asociacion_id": asociacion_id,
                    "estado_id": estado_asignacion_id,
                    "estado": "notificada",
                }
            ).execute()
            asignacion_creada = True
        else:
            supabase_admin.table("casos_administrativos").insert(
                {
                    "reporte_id": reporte_id,
                    "tipo": "reporte_sin_coordinadora",
                    "prioridad": "alta",
                    "estado": "pendiente",
                    "detalle": (
                        "No se encontro una asociacion compatible y cercana "
                        "al activar el reporte."
                    ),
                }
            ).execute()
            caso_administrativo_creado = True

        ahora = datetime.now(timezone.utc).isoformat()
        actualizacion_reporte = {
            "estado_id": estado_id,
            "estado_reporte": estado_clave,
            "estado_cobertura": "abierto" if asociacion_id else None,
            "asociacion_asignada_id": asociacion_id,
            "estado_validacion_reporte": "aprobado",
            "validacion_completada_at": ahora,
            "activado_at": ahora,
            "razones_validacion": razones_validacion or [
                {
                    "codigo": "validacion_inicial_aprobada",
                    "resultado": "aprobado",
                }
            ],
            "urgency_excluido": False,
            "urgency_razones_exclusion": [],
        }
        if moderacion_aprobada_por:
            actualizacion_reporte.update(
                {
                    "estado_moderacion": "aprobado",
                    "moderacion_revisada_por": moderacion_aprobada_por,
                    "moderacion_notas": moderacion_notas,
                    "moderacion_actualizada_at": ahora,
                    "phash_alerta": False,
                }
            )
        actualizacion = (
            supabase.table("reportes")
            .update(actualizacion_reporte)
            .eq("id", reporte_id)
            .eq("estado_validacion_reporte", estado_validacion_esperado)
            .execute()
        )
        if not actualizacion.data:
            raise HTTPException(
                status_code=409,
                detail="El reporte ya no esta disponible para activacion",
            )
    except Exception:
        if asignacion_creada:
            (
                supabase.table("reporte_asignaciones")
                .delete()
                .eq("reporte_id", reporte_id)
                .eq("asociacion_id", asociacion_id)
                .execute()
            )
        if caso_administrativo_creado:
            (
                supabase_admin.table("casos_administrativos")
                .delete()
                .eq("reporte_id", reporte_id)
                .eq("tipo", "reporte_sin_coordinadora")
                .execute()
            )
        raise

    try:
        from app.services.urgency_service import evaluate_report_urgency

        evaluate_report_urgency(reporte_id)
    except Exception as error:
        print(
            f"[WARN] No se pudo calcular la urgencia inicial del reporte "
            f"{reporte_id}: {error}"
        )
        # Sin esto, urgency_proximo_recalculo_at se queda en NULL y el
        # scheduler nunca lo reclama (su filtro es "<= now()", que en SQL
        # nunca hace match contra NULL): el reporte quedaria sin score para
        # siempre en vez de solo hasta el siguiente recalculo.
        (
            supabase.table("reportes")
            .update({"urgency_proximo_recalculo_at": ahora})
            .eq("id", reporte_id)
            .execute()
        )
        _registrar_historial(
            reporte_id,
            "urgency_inicial_fallida",
            "No se pudo calcular la urgencia inicial al activar el reporte.",
            {"error": str(error)},
        )

    _registrar_historial(
        reporte_id,
        "validacion_reporte_aprobada",
        "El reporte completo supero la compuerta de validacion inicial.",
        {"estado_operativo": estado_clave},
    )

    if not asociacion_id:
        return {
            "estado": "sin_cobertura",
            "asociacion": None,
        }

    _registrar_historial(
        reporte_id,
        "asociacion_asignada",
        f"Asignado automaticamente a {asociacion.get('nombre', 'la asociacion')}",
        {
            "asociacion_id": asociacion_id,
            "asociacion_nombre": asociacion.get("nombre"),
        },
    )

    try:
        tipo_notif_id = _obtener_id_catalogo("notificacion_tipos", "nuevo_reporte")
        if tipo_notif_id:
            supabase.table("notificaciones").insert(
                {
                    "reporte_id": reporte_id,
                    "asociacion_id": asociacion_id,
                    "tipo_id": tipo_notif_id,
                    "tipo": "nuevo_reporte",
                }
            ).execute()
    except Exception as error:
        print(f"[WARN] No se pudo crear la notificacion del reporte {reporte_id}: {error}")

    try:
        candidatos_iniciales = matching.obtener_candidatos(reporte_id)
        if candidatos_iniciales.get("candidatos"):
            candidatos_at = datetime.now(timezone.utc).isoformat()
            supabase.table("reportes").update(
                {"candidatos_presentados_at": candidatos_at}
            ).eq("id", reporte_id).execute()
            _registrar_historial(
                reporte_id,
                "candidatos_presentados",
                (
                    f"{len(candidatos_iniciales['candidatos'])} candidatos "
                    "calculados al activar el reporte"
                ),
                {
                    "candidatos": [
                        candidato["voluntario_id"]
                        for candidato in candidatos_iniciales["candidatos"]
                    ]
                },
            )
    except Exception as error:
        print(f"[WARN] No se pudieron calcular candidatos al activar el reporte: {error}")

    if condicion_mas_grave == "grave":
        try:
            asociacion_data = (
                supabase.table("asociaciones")
                .select("nombre, contacto_email")
                .eq("id", asociacion_id)
                .execute()
            )
            if asociacion_data.data:
                from app.services.email_service import email_reporte_grave

                email_reporte_grave(
                    nombre_asociacion=asociacion_data.data[0]["nombre"],
                    email=asociacion_data.data[0]["contacto_email"],
                    municipio=municipio,
                    tipo_animal=tipo_animal_mas_grave,
                )
        except Exception as error:
            print(f"[WARN] No se pudo enviar email de reporte grave: {error}")

    return {
        "estado": "asignado",
        "asociacion": asociacion,
    }


def activar_reporte_desde_revision(
    *,
    reporte_id: str,
    admin_id: str,
    notas: str | None,
) -> dict:
    """Retoma un reporte revisado y lo ingresa por la misma compuerta operativa."""
    consulta = (
        supabase_admin.table("reportes")
        .select(
            "id, latitud, longitud, municipio, estado_validacion_reporte, "
            "razones_validacion, "
            "animal(tipo_animal_catalogo(clave), condicion_catalogo(clave))"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    reporte = consulta.data[0]
    if reporte.get("estado_validacion_reporte") != "revision_manual":
        raise HTTPException(
            status_code=409,
            detail="El reporte no esta pendiente de validacion inicial",
        )

    animales = reporte.get("animal") or []
    especies = list(
        dict.fromkeys(
            (animal.get("tipo_animal_catalogo") or {}).get("clave")
            for animal in animales
            if (animal.get("tipo_animal_catalogo") or {}).get("clave")
        )
    )
    condiciones = [
        (animal.get("condicion_catalogo") or {}).get("clave")
        for animal in animales
        if (animal.get("condicion_catalogo") or {}).get("clave")
    ]
    if not especies or not condiciones:
        raise HTTPException(
            status_code=409,
            detail="El reporte no tiene animales validos para activarse",
        )

    condicion_mas_grave = max(
        condiciones,
        key=lambda condicion: CONDICION_SEVERIDAD.get(condicion, 0),
    )
    tipo_animal_mas_grave = next(
        (
            (animal.get("tipo_animal_catalogo") or {}).get("clave")
            for animal in animales
            if (animal.get("condicion_catalogo") or {}).get("clave")
            == condicion_mas_grave
        ),
        especies[0],
    )
    razones = list(reporte.get("razones_validacion") or [])
    razones.append(
        {
            "codigo": "revision_manual_aprobada",
            "resultado": "aprobado",
            "revisado_por": admin_id,
        }
    )

    return activar_reporte(
        reporte_id=reporte_id,
        latitud=reporte.get("latitud"),
        longitud=reporte.get("longitud"),
        especies=especies,
        condicion_mas_grave=condicion_mas_grave,
        tipo_animal_mas_grave=tipo_animal_mas_grave,
        municipio=reporte.get("municipio"),
        estado_validacion_esperado="revision_manual",
        razones_validacion=razones,
        moderacion_aprobada_por=admin_id,
        moderacion_notas=(notas or "").strip() or None,
    )
