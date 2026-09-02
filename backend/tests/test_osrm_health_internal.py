from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_osrm_health_rejects_requests_without_cron_secret():
    with patch("app.api.internal.settings.cron_secret", "cron_test"):
        response = client.post("/internal/osrm/health")

    assert response.status_code == 401


def test_osrm_health_returns_profile_status_without_urls():
    result = {
        "status": "degraded",
        "modes": {
            "driving": {
                "configured": True,
                "status": "complete",
                "error_code": None,
            },
            "cycling": {
                "configured": True,
                "status": "unavailable",
                "error_code": "timeout",
            },
            "walking": {
                "configured": False,
                "status": "disabled",
                "error_code": None,
            },
        },
    }
    with (
        patch("app.api.internal.settings.cron_secret", "cron_test"),
        patch(
            "app.services.osrm_service.probe_route_modes",
            return_value=result,
        ),
    ):
        response = client.post(
            "/internal/osrm/health",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 200
    assert response.json() == result
    assert "url" not in response.text.lower()
