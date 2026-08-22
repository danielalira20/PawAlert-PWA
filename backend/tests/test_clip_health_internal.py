from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.models.visual_similarity import ClipEmbeddingResult


client = TestClient(app)


def test_clip_health_rejects_requests_without_cron_secret():
    with patch("app.api.internal.settings.cron_secret", "cron_test"):
        response = client.post("/internal/clip/health")

    assert response.status_code == 401


def test_clip_health_returns_dimensions_without_exposing_embedding():
    result = ClipEmbeddingResult(
        status=ExternalSignalStatus.complete,
        embedding=[1.0] * 512,
        model="openai/clip-vit-base-patch32",
        calculated_at="2026-08-21T18:00:00Z",
    )
    with (
        patch("app.api.internal.settings.cron_secret", "cron_test"),
        patch(
            "app.services.clip_embedding_service.probe_clip_embedding",
            return_value=result,
        ),
    ):
        response = client.post(
            "/internal/clip/health",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "status": "complete",
        "dimensions": 512,
        "model": "openai/clip-vit-base-patch32",
        "error_code": None,
    }
    assert "embedding" not in response.json()


def test_clip_health_reports_provider_failure_without_details():
    result = ClipEmbeddingResult(
        status=ExternalSignalStatus.unavailable,
        model="openai/clip-vit-base-patch32",
        calculated_at="2026-08-21T18:00:00Z",
        error_code=ExternalSignalErrorCode.unauthorized,
    )
    with (
        patch("app.api.internal.settings.cron_secret", "cron_test"),
        patch(
            "app.services.clip_embedding_service.probe_clip_embedding",
            return_value=result,
        ),
    ):
        response = client.post(
            "/internal/clip/health",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert response.json()["dimensions"] is None
    assert response.json()["error_code"] == "unauthorized"
