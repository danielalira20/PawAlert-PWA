"""Scheduler externo para ciclo de vida y recordatorios de eventos."""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from time import perf_counter

from app.db.supabase import supabase_admin


logger = logging.getLogger(__name__)
JOB_TYPE = "ciclo_vida_eventos"


def _create_run() -> dict:
    response = (
        supabase_admin.table("operaciones_modulo_runs")
        .insert({"tipo_job": JOB_TYPE})
        .execute()
    )
    return response.data[0] if response.data else {}


def _claim_batch(run_id: str, limit: int) -> list[str]:
    response = supabase_admin.rpc(
        "claim_due_eventos_asociacion",
        {"p_run_id": run_id, "p_limit": limit},
    ).execute()
    return [row["evento_id"] for row in (response.data or [])]


def _process_event(event_id: str, run_id: str) -> dict:
    response = supabase_admin.rpc(
        "procesar_ciclo_vida_evento_asociacion",
        {"p_evento_id": event_id, "p_run_id": run_id},
    ).execute()
    data = response.data
    if isinstance(data, list):
        return data[0] if data else {}
    return data or {}


def _release_claim(event_id: str, run_id: str) -> None:
    try:
        supabase_admin.rpc(
            "release_evento_asociacion_claim",
            {"p_evento_id": event_id, "p_run_id": run_id},
        ).execute()
    except Exception:
        logger.exception("No se pudo liberar el claim del evento %s", event_id)


def _finish_run(
    run_id: str,
    counters: dict,
    started_at: float,
    error: str | None = None,
) -> None:
    payload = {
        "finalizado_at": datetime.now(timezone.utc).isoformat(),
        "duracion_ms": max(0, round((perf_counter() - started_at) * 1000)),
        "examinados": counters.get("examinados", 0),
        "actualizados": counters.get("actualizados", 0),
        "notificaciones_encoladas": counters.get(
            "notificaciones_encoladas", 0
        ),
        "fallidos": counters.get("fallidos", 0),
        "omitidos": counters.get("omitidos", 0),
        "estado": "error" if error else "completado",
        "resumen_error": error,
    }
    (
        supabase_admin.table("operaciones_modulo_runs")
        .update(payload)
        .eq("id", run_id)
        .execute()
    )


def run_event_lifecycle(limit: int = 100) -> dict:
    """Procesa hasta ``limit`` eventos sin enviar push dentro del job."""
    if not 1 <= limit <= 500:
        raise ValueError("limit debe estar entre 1 y 500")

    started_at = perf_counter()
    run = _create_run()
    if not run.get("id"):
        raise RuntimeError("No se pudo iniciar el ciclo de vida de eventos")

    run_id = run["id"]
    counters: defaultdict[str, int] = defaultdict(int)
    error_global = None

    try:
        processed = 0
        while processed < limit:
            batch = _claim_batch(run_id, min(10, limit - processed))
            if not batch:
                break

            for event_id in batch:
                try:
                    result = _process_event(event_id, run_id)
                    action = result.get("accion", "omitido")
                    counters[action] += 1
                    if action in {"finalizado", "archivado"}:
                        counters["actualizados"] += 1
                    if action == "omitido":
                        counters["omitidos"] += 1
                    counters["notificaciones_encoladas"] += int(
                        result.get("notificaciones_encoladas", 0)
                    )
                except Exception:
                    logger.exception(
                        "Fallo el ciclo de vida del evento %s", event_id
                    )
                    counters["fallidos"] += 1
                finally:
                    _release_claim(event_id, run_id)

                counters["examinados"] += 1
                processed += 1
    except Exception as error:
        logger.exception("Fallo general del ciclo de vida de eventos %s", run_id)
        error_global = str(error)[:500]
    finally:
        _finish_run(run_id, counters, started_at, error_global)

    return {
        "run_id": run_id,
        "estado": "error" if error_global else "completado",
        **dict(counters),
    }
