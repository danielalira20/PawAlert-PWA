from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


client = TestClient(app)


def test_ciclo_eventos_rechaza_sin_cron_secret():
    with patch.object(settings, "cron_secret", "cron_test"):
        response = client.post("/internal/events/lifecycle/run")

    assert response.status_code == 401
    assert response.json() == {"detail": "No autorizado"}


def test_ciclo_eventos_ejecuta_servicio_con_secreto_valido():
    expected = {"run_id": "run-1", "estado": "completado", "examinados": 2}
    with (
        patch.object(settings, "cron_secret", "cron_test"),
        patch(
            "app.services.event_lifecycle_service.run_event_lifecycle",
            return_value=expected,
        ) as run,
    ):
        response = client.post(
            "/internal/events/lifecycle/run",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 200
    assert response.json() == expected
    run.assert_called_once_with(limit=100)


def test_ciclo_eventos_reporta_503_si_el_run_falla():
    failed = {"run_id": "run-error", "estado": "error"}
    with (
        patch.object(settings, "cron_secret", "cron_test"),
        patch(
            "app.services.event_lifecycle_service.run_event_lifecycle",
            return_value=failed,
        ),
    ):
        response = client.post(
            "/internal/events/lifecycle/run",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "event_lifecycle_unavailable",
            "run_id": "run-error",
        }
    }
