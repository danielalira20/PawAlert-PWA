from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.dispatch import RouteMatrixResult, RoutingStatus
from app.services import dispatch_route_matrix_service as service


def database(tables: dict) -> MagicMock:
    result = MagicMock()
    result.table.side_effect = lambda name: tables[name]
    return result


def complete_result() -> RouteMatrixResult:
    return RouteMatrixResult(
        origin_ids=["vol-2", "vol-1"],
        destination_ids=["rep-2", "rep-1"],
        durations_seconds=[[120, 240], [180, 300]],
        distances_meters=[[900, 1800], [1200, 2200]],
        status=RoutingStatus.complete,
        calculated_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
    )


def test_builds_ordered_matrix_with_latest_report_location(make_query):
    tables = {
        "capacidades": make_query(data=[
            {"voluntario_id": "vol-1", "latitud": 19.01, "longitud": -98.01},
            {"voluntario_id": "vol-2", "latitud": 19.02, "longitud": -98.02},
        ]),
        "reportes": make_query(data=[
            {
                "id": "rep-1",
                "latitud": 19.10,
                "longitud": -98.10,
                "ultima_latitud_confirmada": None,
                "ultima_longitud_confirmada": None,
            },
            {
                "id": "rep-2",
                "latitud": 19.20,
                "longitud": -98.20,
                "ultima_latitud_confirmada": 19.25,
                "ultima_longitud_confirmada": -98.25,
            },
        ]),
    }
    db = database(tables)
    expected = complete_result()

    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service, "get_route_matrix", return_value=expected
        ) as get_matrix,
    ):
        result = service.calculate_dispatch_route_matrix(
            ["vol-2", "vol-1", "vol-2"],
            ["rep-2", "rep-1"],
        )

    assert result is expected
    request = get_matrix.call_args.args[0]
    assert [point.id for point in request.origins] == ["vol-2", "vol-1"]
    assert request.origins[0].latitude == 19.02
    assert [point.id for point in request.destinations] == ["rep-2", "rep-1"]
    assert request.destinations[0].latitude == 19.25
    assert request.destinations[1].latitude == 19.10


def test_returns_missing_coordinates_without_calling_osrm(make_query):
    tables = {
        "capacidades": make_query(data=[
            {"voluntario_id": "vol-1", "latitud": None, "longitud": -98.01},
        ]),
        "reportes": make_query(data=[
            {
                "id": "rep-1",
                "latitud": 19.10,
                "longitud": -98.10,
                "ultima_latitud_confirmada": None,
                "ultima_longitud_confirmada": None,
            },
        ]),
    }
    db = database(tables)

    with (
        patch.object(service, "supabase_admin", db),
        patch.object(service, "get_route_matrix") as get_matrix,
    ):
        result = service.calculate_dispatch_route_matrix(
            ["vol-1"], ["rep-1"]
        )

    assert result.status == RoutingStatus.unavailable
    assert result.error_code.value == "missing_coordinates"
    assert result.origin_ids == ["vol-1"]
    assert result.destination_ids == ["rep-1"]
    get_matrix.assert_not_called()


def test_incomplete_operational_location_falls_back_to_original(make_query):
    tables = {
        "capacidades": make_query(
            data=[
                {
                    "voluntario_id": "vol-1",
                    "latitud": 19.01,
                    "longitud": -98.01,
                },
            ]
        ),
        "reportes": make_query(
            data=[
                {
                    "id": "rep-1",
                    "latitud": 19.10,
                    "longitud": -98.10,
                    "ultima_latitud_confirmada": 19.25,
                    "ultima_longitud_confirmada": None,
                },
            ]
        ),
    }
    db = database(tables)

    with (
        patch.object(service, "supabase_admin", db),
        patch.object(
            service,
            "get_route_matrix",
            side_effect=lambda request: request,
        ),
    ):
        request = service.calculate_dispatch_route_matrix(["vol-1"], ["rep-1"])

    assert request.destinations[0].latitude == 19.10
    assert request.destinations[0].longitude == -98.10


@pytest.mark.parametrize(
    ("volunteer_ids", "report_ids", "message"),
    [
        ([], ["rep-1"], "volunteer_ids"),
        (["vol-1"], [], "report_ids"),
    ],
)
def test_rejects_empty_matrix_axes(volunteer_ids, report_ids, message):
    with pytest.raises(ValueError, match=message):
        service.calculate_dispatch_route_matrix(volunteer_ids, report_ids)
