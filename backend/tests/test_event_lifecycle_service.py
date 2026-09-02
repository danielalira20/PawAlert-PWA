from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import event_lifecycle_service


def test_run_vacio_finaliza_auditoria():
    with (
        patch.object(
            event_lifecycle_service, "_create_run", return_value={"id": "run-1"}
        ),
        patch.object(event_lifecycle_service, "_claim_batch", return_value=[]),
        patch.object(event_lifecycle_service, "_finish_run") as finish,
    ):
        result = event_lifecycle_service.run_event_lifecycle()

    assert result == {"run_id": "run-1", "estado": "completado"}
    finish.assert_called_once()
    assert finish.call_args.args[1] == {}


def test_acciones_y_notificaciones_se_contabilizan_y_liberan():
    results = [
        {"accion": "finalizado", "notificaciones_encoladas": 2},
        {"accion": "recordatorio_24h", "notificaciones_encoladas": 1},
        {"accion": "archivado", "notificaciones_encoladas": 0},
    ]
    with (
        patch.object(
            event_lifecycle_service, "_create_run", return_value={"id": "run-1"}
        ),
        patch.object(
            event_lifecycle_service,
            "_claim_batch",
            side_effect=[["event-1", "event-2", "event-3"], []],
        ),
        patch.object(
            event_lifecycle_service, "_process_event", side_effect=results
        ),
        patch.object(event_lifecycle_service, "_release_claim") as release,
        patch.object(event_lifecycle_service, "_finish_run") as finish,
    ):
        result = event_lifecycle_service.run_event_lifecycle()

    assert result["examinados"] == 3
    assert result["actualizados"] == 2
    assert result["finalizado"] == 1
    assert result["archivado"] == 1
    assert result["recordatorio_24h"] == 1
    assert result["notificaciones_encoladas"] == 3
    assert release.call_count == 3
    assert finish.call_args.args[1]["actualizados"] == 2


def test_fallo_individual_no_interrumpe_el_lote():
    with (
        patch.object(
            event_lifecycle_service, "_create_run", return_value={"id": "run-1"}
        ),
        patch.object(
            event_lifecycle_service,
            "_claim_batch",
            side_effect=[["event-1", "event-2"], []],
        ),
        patch.object(
            event_lifecycle_service,
            "_process_event",
            side_effect=[RuntimeError("db error"), {"accion": "archivado"}],
        ),
        patch.object(event_lifecycle_service, "_release_claim") as release,
        patch.object(event_lifecycle_service, "_finish_run"),
    ):
        result = event_lifecycle_service.run_event_lifecycle()

    assert result["fallidos"] == 1
    assert result["archivado"] == 1
    assert result["examinados"] == 2
    assert release.call_count == 2


def test_process_event_normaliza_respuesta_rpc_en_lista():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data=[{"accion": "recordatorio_24h", "notificaciones_encoladas": 1}]
    )
    with patch.object(
        event_lifecycle_service.supabase_admin, "rpc", return_value=rpc
    ):
        result = event_lifecycle_service._process_event("event-1", "run-1")

    assert result["accion"] == "recordatorio_24h"
    assert result["notificaciones_encoladas"] == 1
