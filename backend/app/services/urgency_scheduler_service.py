import logging
from typing import Dict, List, Any
from collections import defaultdict
from app.db.supabase import supabase
from app.services.urgency_service import evaluate_report_urgency, UrgencyCalculation

logger = logging.getLogger(__name__)

def _crear_run() -> dict:
    result = supabase.table("urgency_scheduler_runs").insert({}).execute()
    return result.data[0] if result.data else {}

def _claim_sublote(run_id: str, limit: int = 10) -> List[str]:
    # We call the RPC claim_due_urgency_reports
    result = supabase.rpc("claim_due_urgency_reports", {"p_run_id": run_id, "p_limit": limit}).execute()
    # The RPC returns a list of dicts: [{"reporte_id": "uuid"}, ...]
    return [row["reporte_id"] for row in (result.data or [])]

def _release_claim(reporte_id: str, run_id: str) -> None:
    try:
        supabase.rpc("release_urgency_claim", {"p_reporte_id": reporte_id, "p_run_id": run_id}).execute()
    except Exception as e:
        logger.error(f"Error releasing claim for {reporte_id}: {e}")

def _finalizar_run(run_id: str, contadores: dict, error: str = None) -> None:
    update_data = {
        "finalizado_at": "now()",
        "examined_count": contadores.get("examined", 0),
        "updated_count": contadores.get("updated", 0),
        "degraded_count": contadores.get("degraded", 0),
        "failed_count": contadores.get("failed", 0),
        "skipped_count": contadores.get("skipped", 0),
        "estado": "error" if error else "completado",
        "resumen_error": error
    }
    supabase.table("urgency_scheduler_runs").update(update_data).eq("id", run_id).execute()

def _clasificar(result: UrgencyCalculation) -> str:
    """
    'updated':  clima y riesgo_vial con status 'complete' o 'cached'
    'degraded': al menos uno con 'stale_cache' o 'unavailable'
    """
    DEGRADED = {"stale_cache", "unavailable"}
    for comp_key in ("clima", "riesgo_vial"):
        status = result.applied_components.get(comp_key, {}).get("status", "")
        if status in DEGRADED:
            return "degraded"
    return "updated"

def run_due_urgency_recalculations(limit: int = 100) -> Dict[str, int]:
    run = _crear_run()
    if not run:
        return {"error": "No se pudo iniciar run"}
        
    run_id = run["id"]
    contadores = defaultdict(int)
    procesados = 0
    error_global = None

    try:
        while procesados < limit:
            batch_size = min(10, limit - procesados)
            sublote = _claim_sublote(run_id, batch_size)
            if not sublote:
                break  # No hay más reportes elegibles

            for reporte_id in sublote:
                try:
                    result = evaluate_report_urgency(reporte_id)
                    clasificacion = _clasificar(result)
                    contadores[clasificacion] += 1
                except ValueError as ve:
                    logger.warning(f"Reporte {reporte_id} excluido/invalido: {ve}")
                    contadores['skipped'] += 1
                except Exception as e:
                    logger.error(f"Fallo recalculo {reporte_id}: {e}")
                    contadores['failed'] += 1
                finally:
                    _release_claim(reporte_id, run_id)
                
                contadores['examined'] += 1
                procesados += 1
    except Exception as e:
        logger.error(f"Fallo general en run {run_id}: {e}")
        error_global = str(e)
    finally:
        _finalizar_run(run_id, contadores, error_global)

    return dict(contadores)
