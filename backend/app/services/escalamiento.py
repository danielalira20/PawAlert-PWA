
"""
Escalamiento automatico de asignaciones (A3).

Principio: la asociacion decide, pero su silencio no detiene un rescate.
- modo 'manual': el sistema jamas asigna solo.
- modo 'semi_automatico': si la asociacion no asigna dentro del timeout
  segun la condicion del animal (grave/herido/estable), se asigna al mejor
  candidato vigente.
- modo 'automatico': se asigna al mejor candidato en cuanto el cron pasa
  (timeout 0).

Disenado para Celery; implementado con evaluacion diferida (cron externo
que llama POST /internal/escalamiento/run cada 5 min) en el MVP.
"""
from datetime import datetime, timezone

from app.db.supabase import supabase
from app.services import coverage_service, dispatch_optimizer, matching
from app.utils.animal_shaping import shape_animal_embed, condicion_mas_grave

MODOS_CON_ESCALAMIENTO = ("semi_automatico", "automatico")


def evaluar_escalamientos() -> dict:
    """Revisa los reportes que esperan asignacion y escala los vencidos.
    Devuelve un resumen para el log del cron."""
    pendientes = _reportes_esperando_asignacion()
    revisados, escalados, sin_candidatos = 0, [], 0

    elegibles = []
    asociacion_por_reporte = {}
    for rep in pendientes:
        aso = rep.get("asociaciones") or {}
        modo = aso.get("modo_asignacion", "manual")
        if modo not in MODOS_CON_ESCALAMIENTO:
            continue
        revisados += 1

        timeout_min = 0 if modo == "automatico" else _timeout_por_condicion(aso, rep.get("condicion"))
        if _minutos_desde(rep["candidatos_presentados_at"]) < timeout_min:
            continue  # aun dentro del plazo de la asociacion

        elegibles.append(rep["id"])
        asociacion_por_reporte[rep["id"]] = rep["asociacion_asignada_id"]

    if elegibles:
        resultado, voluntarios_info = dispatch_optimizer.optimizar_lote_reportes(elegibles)

        for assignment in resultado.assignments:
            info = voluntarios_info[assignment.volunteer_id]
            coverage_service.reservar_cobertura(
                reporte_id=assignment.report_id,
                usuario_asignado_id=info["usuario_id"],
                voluntario_id=assignment.volunteer_id,
                asociacion_id=asociacion_por_reporte[assignment.report_id],
                actor_id=info["usuario_id"],
                origen="escalamiento_automatico",
            )
            escalados.append({
                "reporte_id": assignment.report_id,
                "voluntario": info["nombre"],
            })

            # Llenar pool de interesados para lista de espera
            _llenar_pool_y_notificar_espera(assignment.report_id, assignment.volunteer_id)

        sin_candidatos = len(resultado.unassigned_report_ids)

    return {
        "revisados": revisados,
        "escalados": escalados,
        "sin_candidatos": sin_candidatos,
        "ejecutado_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _reportes_esperando_asignacion() -> list:
    """Reportes en estado 'asignado' (con asociacion), con candidatos ya
    presentados y sin voluntario asignado."""
    res = (
        supabase.table("reportes")
        .select(
            "id, asociacion_asignada_id, candidatos_presentados_at, "
            "animal(condicion_catalogo(clave)), "
            "asociaciones(modo_asignacion, timeout_grave, timeout_herido, timeout_estable)"
        )
        .eq("estado_reporte", "asignado")
        .eq("estado_validacion_reporte", "aprobado")
        .eq("estado_cobertura", "abierto")
        .in_("estado_moderacion", ["visible", "aprobado"])
        .is_("staff_asignado_id", "null")
        .not_.is_("candidatos_presentados_at", "null")
        .execute()
    )
    reportes = res.data or []
    for r in reportes:
        animales, _ = shape_animal_embed(r.get("animal"))
        r["condicion"] = condicion_mas_grave(animales)
    return reportes

def _minutos_desde(iso_timestamp: str) -> float:
    inicio = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - inicio).total_seconds() / 60.0


def _timeout_por_condicion(aso: dict, condicion) -> int:
    mapa = {"grave": "timeout_grave", "herido": "timeout_herido", "estable": "timeout_estable"}
    return aso.get(mapa.get(str(condicion), "timeout_estable"), 60)


def _evento(reporte_id, usuario_id, tipo_evento, descripcion, datos_extra):
    supabase.table("historial_reporte").insert({
        "reporte_id": reporte_id,
        "usuario_id": usuario_id,
        "tipo_evento": tipo_evento,
        "descripcion": descripcion,
        "datos_extra": datos_extra,
    }).execute()


def _llenar_pool_y_notificar_espera(reporte_id: str, volunteer_id_ganador: str) -> None:
    """Guarda el pool de candidatos para este reporte en pool_interesados_reporte
    y envía push 'lista_espera_activada' a todos los candidatos que NO ganaron.

    Se llama inmediatamente después de reservar_cobertura() en el escalamiento
    automático. Si falla, solo se registra un [WARN] — nunca revierte la propuesta.

    Diseño:
    - posicion=1 → ganador, estado='propuesta_enviada'
    - posicion>1 → lista de espera, estado='en_espera'
    - Idempotente via UPSERT (UNIQUE reporte_id, voluntario_id).
    """
    try:
        from app.db.supabase import supabase_admin
        from app.services.push_notification_service import (
            puede_notificar,
            queue_and_send_push,
        )

        candidatos = matching.obtener_candidatos(reporte_id).get("candidatos", [])
        if not candidatos:
            return

        pool_rows = []
        for posicion, candidato in enumerate(candidatos, start=1):
            uid = candidato.get("usuario_id")
            vol_id = candidato.get("voluntario_id")
            if not uid or not vol_id:
                continue
            pool_rows.append({
                "reporte_id": reporte_id,
                "voluntario_id": vol_id,
                "usuario_id": uid,
                "posicion": posicion,
                "estado": (
                    "propuesta_enviada" if vol_id == volunteer_id_ganador else "en_espera"
                ),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

        if pool_rows:
            supabase_admin.table("pool_interesados_reporte").upsert(
                pool_rows,
                on_conflict="reporte_id,voluntario_id",
            ).execute()

        # Push a candidatos en lista de espera (posicion > 1)
        for row in pool_rows:
            if row["estado"] == "en_espera":
                uid_espera = row["usuario_id"]
                if puede_notificar(uid_espera, "lista_espera_activada"):
                    queue_and_send_push(
                        usuario_id=uid_espera,
                        tipo_evento="lista_espera_activada",
                        idempotency_key=f"lista_espera:{reporte_id}:{uid_espera}",
                        payload={
                            "mensaje": (
                                "Estás en lista de espera para un caso cercano. "
                                "Si el candidato seleccionado no responde, "
                                "podrías ser contactado."
                            ),
                            "reporte_id": reporte_id,
                        },
                        reporte_id=reporte_id,
                    )

    except Exception as e:
        print(f"[WARN] Error llenando pool de interesados para reporte {reporte_id}: {e}")
