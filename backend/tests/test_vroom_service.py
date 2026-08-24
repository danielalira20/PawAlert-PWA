from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services import vroom_service


def request() -> vroom_service.VroomOptimizationRequest:
    return vroom_service.VroomOptimizationRequest(
        vehicles=[
            vroom_service.VroomVehicle(
                id=1,
                start_index=0,
                capacity=[1],
                skills=[1],
            )
        ],
        jobs=[
            vroom_service.VroomJob(
                id=1,
                location_index=1,
                service=900,
                priority=80,
                delivery=[1],
                skills=[1],
            )
        ],
        matrices={
            "car": vroom_service.VroomProfileMatrix(
                durations=[[0, 300], [300, 0]],
                distances=[[0, 2000], [2000, 0]],
            )
        },
    )


def response(status_code: int, payload: object) -> MagicMock:
    result = MagicMock(status_code=status_code)
    result.json.return_value = payload
    return result


def successful_payload() -> dict:
    return {
        "code": 0,
        "unassigned": [],
        "routes": [
            {
                "vehicle": 1,
                "steps": [
                    {"type": "start", "location_index": 0, "arrival": 0},
                    {
                        "type": "job",
                        "id": 1,
                        "location_index": 1,
                        "arrival": 300,
                    },
                ],
            }
        ],
    }


def test_builds_official_custom_matrix_payload():
    with patch.object(
        vroom_service.settings,
        "vroom_base_url",
        "https://vroom.internal/",
    ), patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, successful_payload()),
    ) as post:
        result = vroom_service.get_optimization(request())

    body = post.call_args.kwargs["json"]
    assert body["matrices"]["car"] == {
        "durations": [[0, 300], [300, 0]],
        "distances": [[0, 2000], [2000, 0]],
    }
    assert body["vehicles"][0]["profile"] == "car"
    assert result.status == "complete"
    assert result.routes[0].steps[1].job_id == 1


def test_rejects_non_square_matrix_before_calling_provider():
    with pytest.raises(ValueError, match="square"):
        vroom_service.VroomProfileMatrix(durations=[[0, 1]])


def test_rejects_location_index_outside_matrix():
    with pytest.raises(ValueError, match="Job location index"):
        vroom_service.VroomOptimizationRequest(
            vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
            jobs=[vroom_service.VroomJob(id=1, location_index=2)],
            matrices={
                "car": vroom_service.VroomProfileMatrix(
                    durations=[[0, 1], [1, 0]]
                )
            },
        )


def test_missing_base_url_returns_not_configured_without_request():
    with patch.object(vroom_service.settings, "vroom_base_url", ""), patch.object(
        vroom_service.httpx, "post"
    ) as post:
        result = vroom_service.get_optimization(request())

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "not_configured"


def test_timeout_retries_once_and_returns_timeout():
    with patch.object(
        vroom_service.settings,
        "vroom_base_url",
        "https://vroom.internal",
    ), patch.object(
        vroom_service.httpx,
        "post",
        side_effect=httpx.TimeoutException("timeout"),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "timeout"


def test_logical_error_does_not_retry():
    with patch.object(
        vroom_service.settings,
        "vroom_base_url",
        "https://vroom.internal",
    ), patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"code": 3, "error": "invalid input"}),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 1
    assert result.error_code == "logical_error"


def test_malformed_payload_returns_invalid_response():
    with patch.object(
        vroom_service.settings,
        "vroom_base_url",
        "https://vroom.internal",
    ), patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"code": 0, "routes": "invalid"}),
    ):
        result = vroom_service.get_optimization(request())

    assert result.error_code == "invalid_response"
