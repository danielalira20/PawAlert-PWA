
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

from fastapi import HTTPException

from app.db.supabase import supabase, supabase_admin
from app.models.dispatch import DispatchPreparationStatus
from app.services import (
    coverage_service,
    dispatch_optimizer,
    dispatch_preparation_service,
)
from app.utils.animal_shaping import shape_animal_embed, condicion_mas_grave

MODOS_CON_ESCALAMIENTO = ("semi_automatico", "automatico")


def evaluar_escalamientos() -> dict:
    """Revisa los reportes que esperan asignacion y escala los vencidos.
    Devuelve un resumen para el log del cron."""
    pendientes = _reportes_esperando_asignacion()
    revisados, escalados, sin_candidatos, conflictos = 0, [], 0, 0
    elegibles = []
    reportes_por_id = {}

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
        reportes_por_id[rep["id"]] = rep

    optimization_status = "not_required"
    optimization_source = None
    optimization_error = None
    if elegibles:
        preparation = dispatch_preparation_service.prepare_dispatch_optimization(
            elegibles
        )
        if preparation.status == DispatchPreparationStatus.unavailable:
            optimization_status = "unavailable"
            optimization_error = preparation.error_code.value
            if optimization_error == "no_candidates":
                sin_candidatos = len(elegibles)
        else:
            optimization_status = "complete"
            request = preparation.request
            result = dispatch_optimizer.optimize_dispatch(request)
            optimization_source = result.source
            sin_candidatos = len(result.unassigned_report_ids)
            volunteers_by_id = {
                volunteer.volunteer_id: volunteer
                for volunteer in request.volunteers
            }
            assignment_info = _volunteer_assignment_info(
                [assignment.volunteer_id for assignment in result.assignments]
            )

            for assignment in result.assignments:
                report = reportes_por_id[assignment.report_id]
                volunteer = volunteers_by_id[assignment.volunteer_id]
                info = assignment_info.get(assignment.volunteer_id)
                if info is None:
                    conflictos += 1
                    continue
                origin = (
                    "ofrecimiento_externo"
                    if volunteer.role == "voluntario_externo"
                    else "escalamiento_automatico"
                )
                try:
                    coverage_service.reservar_cobertura(
                        reporte_id=assignment.report_id,
                        usuario_asignado_id=info["usuario_id"],
                        voluntario_id=assignment.volunteer_id,
                        asociacion_id=report["asociacion_asignada_id"],
                        actor_id=info["usuario_id"],
                        origen=origin,
                    )
                except HTTPException as exc:
                    if exc.status_code == 409:
                        conflictos += 1
                        continue
                    raise
                escalados.append(
                    {
                        "reporte_id": assignment.report_id,
                        "voluntario": info["nombre"],
                    }
                )

    return {
        "revisados": revisados,
        "escalados": escalados,
        "sin_candidatos": sin_candidatos,
        "conflictos": conflictos,
        "optimizacion": {
            "status": optimization_status,
            "source": optimization_source,
            "error_code": optimization_error,
        },
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


def _volunteer_assignment_info(volunteer_ids: list[str]) -> dict[str, dict]:
    if not volunteer_ids:
        return {}
    result = (
        supabase_admin.table("voluntarios")
        .select("id, usuario_id, usuarios(nombre, apellido_paterno)")
        .in_("id", list(dict.fromkeys(volunteer_ids)))
        .execute()
    )
    info = {}
    for row in result.data or []:
        user = row.get("usuarios") or {}
        info[row["id"]] = {
            "usuario_id": row["usuario_id"],
            "nombre": " ".join(
                filter(None, [user.get("nombre"), user.get("apellido_paterno")])
            ),
        }
    return info


def _evento(reporte_id, usuario_id, tipo_evento, descripcion, datos_extra):
    supabase.table("historial_reporte").insert({
        "reporte_id": reporte_id,
        "usuario_id": usuario_id,
        "tipo_evento": tipo_evento,
        "descripcion": descripcion,
        "datos_extra": datos_extra,
    }).execute()
