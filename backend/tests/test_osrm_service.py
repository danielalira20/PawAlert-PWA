from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.models.dispatch import (
    RouteGeometryPoint,
    RouteMatrixRequest,
    RouteRequest,
    RouteResult,
    RoutingErrorCode,
    RoutingMode,
    RoutingPoint,
    RoutingStatus,
)
from app.services import osrm_service


def request() -> RouteMatrixRequest:
    return RouteMatrixRequest(
        origins=[
            RoutingPoint(id="vol-1", latitude=19.04, longitude=-98.20),
            RoutingPoint(id="vol-2", latitude=19.05, longitude=-98.21),
        ],
        destinations=[
            RoutingPoint(id="rep-1", latitude=19.06, longitude=-98.22),
        ],
    )


def route_request() -> RouteRequest:
    return RouteRequest(
        origin=RoutingPoint(id="vol-1", latitude=19.04, longitude=-98.20),
        destination=RoutingPoint(id="rep-1", latitude=19.06, longitude=-98.22),
    )


def guided_route_request() -> RouteRequest:
    return RouteRequest(
        origin=RoutingPoint(id="vol-1", latitude=19.04, longitude=-98.20),
        destination=RoutingPoint(id="rep-1", latitude=19.06, longitude=-98.22),
        include_steps=True,
    )


def response(status_code: int, payload: object | None = None) -> MagicMock:
    result = MagicMock()
    result.status_code = status_code
    if payload is not None:
        result.json.return_value = payload
    return result


def valid_payload() -> dict:
    return {
        "code": "Ok",
        "durations": [[120.5], [240]],
        "distances": [[950.2], [1800]],
    }


def test_builds_osrm_table_request_with_lon_lat_and_indexes():
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, valid_payload()),
    ) as get:
        result = osrm_service.get_route_matrix(request())

    assert result.status == RoutingStatus.complete
    assert result.origin_ids == ["vol-1", "vol-2"]
    assert result.destination_ids == ["rep-1"]
    assert result.durations_seconds == [[120.5], [240.0]]

    url = get.call_args.args[0]
    assert "/table/v1/driving/" in url
    assert "-98.2,19.04;-98.21,19.05;-98.22,19.06" in url
    assert get.call_args.kwargs["params"] == {
        "sources": "0;1",
        "destinations": "2",
        "annotations": "duration,distance",
        "skip_waypoints": "true",
    }


def test_timeout_retries_once_and_returns_unavailable():
    with patch.object(
        osrm_service.httpx,
        "get",
        side_effect=httpx.TimeoutException("timeout"),
    ) as get:
        result = osrm_service.get_route_matrix(request())

    assert get.call_count == 2
    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.timeout
    assert result.durations_seconds == []


def test_invalid_payload_does_not_escape_provider_boundary():
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, {"code": "Ok", "durations": []}),
    ):
        result = osrm_service.get_route_matrix(request())

    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.invalid_response


def test_null_cells_are_preserved_for_unreachable_pairs():
    payload = valid_payload()
    payload["durations"][1][0] = None
    payload["distances"][1][0] = None

    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, payload),
    ):
        result = osrm_service.get_route_matrix(request())

    assert result.status == RoutingStatus.complete
    assert result.durations_seconds[1][0] is None


def test_missing_base_url_returns_not_configured_without_request():
    with (
        patch.object(osrm_service.settings, "osrm_base_url", ""),
        patch.object(osrm_service.httpx, "get") as get,
    ):
        result = osrm_service.get_route_matrix(request())

    get.assert_not_called()
    assert result.error_code == RoutingErrorCode.not_configured


def test_coordinate_limit_prevents_oversized_request():
    with (
        patch.object(osrm_service.settings, "osrm_max_coordinates", 2),
        patch.object(osrm_service.httpx, "get") as get,
    ):
        result = osrm_service.get_route_matrix(request())

    get.assert_not_called()
    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.request_too_large


def test_coordinate_limit_allows_exact_boundary():
    with (
        patch.object(osrm_service.settings, "osrm_max_coordinates", 3),
        patch.object(
            osrm_service.httpx,
            "get",
            return_value=response(200, valid_payload()),
        ) as get,
    ):
        result = osrm_service.get_route_matrix(request())

    get.assert_called_once()
    assert result.status == RoutingStatus.complete


@pytest.mark.parametrize("invalid_value", [float("nan"), float("inf")])
def test_nonfinite_matrix_value_is_invalid_response(invalid_value):
    payload = valid_payload()
    payload["durations"][0][0] = invalid_value

    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, payload),
    ):
        result = osrm_service.get_route_matrix(request())

    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.invalid_response


def test_get_route_returns_duration_distance_and_geojson_geometry():
    payload = {
        "code": "Ok",
        "routes": [{
            "duration": 420.5,
            "distance": 3100.2,
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [-98.20, 19.04],
                    [-98.21, 19.05],
                    [-98.22, 19.06],
                ],
            },
        }],
    }
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, payload),
    ) as get:
        result = osrm_service.get_route(route_request())

    assert result.status == RoutingStatus.complete
    assert result.duration_seconds == 420.5
    assert result.distance_meters == 3100.2
    assert result.geometry[1].latitude == 19.05
    assert "/route/v1/driving/" in get.call_args.args[0]
    assert get.call_args.kwargs["params"]["geometries"] == "geojson"
    assert get.call_args.kwargs["params"]["overview"] == "full"
    assert get.call_args.kwargs["params"]["steps"] == "false"


def test_get_guided_route_requests_and_normalizes_steps():
    payload = {
        "code": "Ok",
        "routes": [{
            "duration": 420.5,
            "distance": 3100.2,
            "geometry": {
                "type": "LineString",
                "coordinates": [[-98.20, 19.04], [-98.22, 19.06]],
            },
            "legs": [{
                "steps": [
                    {
                        "distance": 320.0,
                        "duration": 44.0,
                        "name": "Avenida 11 Sur",
                        "maneuver": {
                            "type": "turn",
                            "modifier": "right",
                            "location": [-98.2081, 19.043],
                        },
                    },
                    {
                        "distance": 15,
                        "duration": 4,
                        "name": "",
                        "maneuver": {
                            "type": "unknown-provider-value",
                            "location": [-98.22, 19.06],
                        },
                    },
                    {"distance": "invalid", "maneuver": {}},
                ],
            }],
        }],
    }
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, payload),
    ) as get:
        result = osrm_service.get_route(guided_route_request())

    assert result.status == RoutingStatus.complete
    assert get.call_args.kwargs["params"]["steps"] == "true"
    assert len(result.steps) == 2
    assert result.steps[0].type == "turn"
    assert result.steps[0].modifier == "right"
    assert result.steps[0].street_name == "Avenida 11 Sur"
    assert result.steps[0].location == (-98.2081, 19.043)
    assert result.steps[1].type == "unknown-provider-value"
    assert result.steps[1].modifier is None


def test_get_route_preserves_no_route_as_controlled_result():
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, {"code": "NoRoute", "routes": []}),
    ):
        result = osrm_service.get_route(route_request())

    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.no_route


def test_get_route_rejects_incomplete_geometry():
    payload = {
        "code": "Ok",
        "routes": [{
            "duration": 420.5,
            "distance": 3100.2,
            "geometry": {"type": "LineString", "coordinates": [[-98.20, 19.04]]},
        }],
    }
    with patch.object(
        osrm_service.httpx,
        "get",
        return_value=response(200, payload),
    ):
        result = osrm_service.get_route(route_request())

    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.invalid_response


def test_configured_route_modes_requires_dedicated_non_driving_urls():
    with (
        patch.object(osrm_service.settings, "osrm_base_url", "https://car"),
        patch.object(osrm_service.settings, "osrm_driving_base_url", ""),
        patch.object(osrm_service.settings, "osrm_cycling_base_url", ""),
        patch.object(osrm_service.settings, "osrm_walking_base_url", ""),
    ):
        assert osrm_service.configured_route_modes() == [RoutingMode.driving]


def test_probe_route_modes_reports_each_profile_without_exposing_urls():
    complete = RouteResult(
        origin_id="health-origin",
        destination_id="health-destination",
        duration_seconds=120,
        distance_meters=800,
        geometry=[
            RouteGeometryPoint(latitude=19.0414, longitude=-98.2063),
            RouteGeometryPoint(latitude=19.0436, longitude=-98.2035),
        ],
        status=RoutingStatus.complete,
        calculated_at=datetime.now(timezone.utc),
    )
    with (
        patch.object(osrm_service.settings, "osrm_base_url", "https://car"),
        patch.object(osrm_service.settings, "osrm_driving_base_url", ""),
        patch.object(
            osrm_service.settings,
            "osrm_cycling_base_url",
            "https://bike",
        ),
        patch.object(osrm_service.settings, "osrm_walking_base_url", ""),
        patch.object(osrm_service, "get_route", return_value=complete) as route,
    ):
        result = osrm_service.probe_route_modes()

    assert result == {
        "status": "complete",
        "modes": {
            "driving": {
                "configured": True,
                "status": "complete",
                "error_code": None,
            },
            "cycling": {
                "configured": True,
                "status": "complete",
                "error_code": None,
            },
            "walking": {
                "configured": False,
                "status": "disabled",
                "error_code": None,
            },
        },
    }
    assert [call.args[0].mode for call in route.call_args_list] == [
        RoutingMode.driving,
        RoutingMode.cycling,
    ]
    assert "https://" not in str(result)
