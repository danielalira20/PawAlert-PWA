from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services import vroom_service


@pytest.fixture(autouse=True)
def _vroom_configurado(monkeypatch):
    """VROOM_BASE_URL esta vacio por defecto (sin servidor publico) --
    las pruebas asumen una instancia configurada salvo que digan lo
    contrario explicitamente."""
    monkeypatch.setattr(
        vroom_service.settings, "vroom_base_url", "http://vroom.internal:3000"
    )


def request() -> vroom_service.VroomOptimizationRequest:
    return vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[vroom_service.VroomJob(id=1, location_index=1)],
        matrix=[[0, 300], [300, 0]],
    )


def response(status_code: int, payload: object | None = None) -> MagicMock:
    result = MagicMock()
    result.status_code = status_code
    if payload is not None:
        result.json.return_value = payload
    return result


def payload_exitoso() -> dict:
    return {
        "code": 0,
        "summary": {"cost": 300, "unassigned": 0},
        "unassigned": [],
        "routes": [
            {
                "vehicle": 1,
                "steps": [
                    {"type": "start", "location_index": 0, "arrival": 0},
                    {
                        "type": "job",
                        "location_index": 1,
                        "id": 1,
                        "arrival": 300,
                    },
                    {"type": "end", "location_index": 0, "arrival": 600},
                ],
            }
        ],
    }


def test_builds_payload_with_indexes_and_matrix():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload_exitoso()),
    ) as post:
        vroom_service.get_optimization(request())

    body = post.call_args.kwargs["json"]
    assert body["vehicles"] == [
        {"id": 1, "start_index": 0, "capacity": [], "skills": []}
    ]
    assert body["jobs"] == [
        {
            "id": 1,
            "location_index": 1,
            "priority": 0,
            "delivery": [],
            "skills": [],
        }
    ]
    assert body["matrix"] == [[0, 300], [300, 0]]


def test_missing_base_url_returns_not_configured_without_request():
    with (
        patch.object(vroom_service.settings, "vroom_base_url", ""),
        patch.object(vroom_service.httpx, "post") as post,
    ):
        result = vroom_service.get_optimization(request())

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "not_configured"


def test_batch_over_limit_returns_request_too_large_without_request():
    lote = vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[
            vroom_service.VroomJob(id=i, location_index=i)
            for i in range(1, vroom_service._MAX_VROOM_JOBS + 2)
        ],
        matrix=[[0]],
    )
    with patch.object(vroom_service.httpx, "post") as post:
        result = vroom_service.get_optimization(lote)

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "request_too_large"


def test_timeout_retries_once_and_returns_timeout():
    with patch.object(
        vroom_service.httpx,
        "post",
        side_effect=httpx.TimeoutException("timeout"),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "timeout"


def test_generic_http_error_returns_provider_error():
    with patch.object(
        vroom_service.httpx,
        "post",
        side_effect=httpx.ConnectError("boom"),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "provider_error"


def test_successful_response_parses_routes_and_unassigned():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload_exitoso()),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "complete"
    assert result.error_code is None
    assert result.unassigned_job_ids == []
    assert len(result.routes) == 1

    ruta = result.routes[0]
    assert ruta.vehicle_id == 1
    assert [step.type for step in ruta.steps] == ["start", "job", "end"]
    assert ruta.steps[1].job_id == 1
    assert ruta.steps[1].location_index == 1
    assert ruta.steps[1].arrival == 300
    assert ruta.steps[0].job_id is None


def test_logical_error_no_start_or_end_does_not_retry():
    payload = {"code": 2, "error": "No start or end specified for vehicle 1"}
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 1
    assert result.status == "unavailable"
    assert result.error_code == "logical_error"


def test_logical_error_connection_failure_does_not_retry():
    payload = {"code": 3, "error": "Failed to connect to 0.0.0.0:5000"}
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 1
    assert result.status == "unavailable"
    assert result.error_code == "logical_error"


def test_malformed_payload_returns_invalid_response():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"code": 0, "routes": "no-es-una-lista"}),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "unavailable"
    assert result.error_code == "invalid_response"


def test_payload_without_code_returns_invalid_response():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"unexpected": "shape"}),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "unavailable"
    assert result.error_code == "invalid_response"
