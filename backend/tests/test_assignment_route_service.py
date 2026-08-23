from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.models.dispatch import (
    RouteGeometryPoint,
    RouteResult,
    RoutingErrorCode,
    RoutingStatus,
)
from app.services import assignment_route_service


def client(
    make_query,
    *,
    complete_coordinates: bool = True,
    latest_location_id: str | None = None,
    latest_location: dict | None = None,
):
    tables = {
        "reportes": make_query(data=[{
            "id": "rep-1",
            "latitud": 19.06,
            "longitud": -98.22,
            "ultima_ubicacion_confirmada_id": latest_location_id,
        }]),
        "avistamientos_animal": make_query(
            data=[latest_location] if latest_location else []
        ),
        "voluntarios": make_query(data=[{"id": "vol-1"}]),
        "capacidades": make_query(data=[{
            "latitud": 19.04 if complete_coordinates else None,
            "longitud": -98.20 if complete_coordinates else None,
        }]),
        "propuestas_asignacion": make_query(data=[{"id": "prop-1"}]),
    }
    database = MagicMock()
    database.table.side_effect = lambda name: tables[name]
    return database, tables


def test_calculates_and_persists_route_for_confirmed_proposal(make_query):
    database, tables = client(make_query)
    route = RouteResult(
        origin_id="user-1",
        destination_id="rep-1",
        duration_seconds=420,
        distance_meters=3100,
        geometry=[
            RouteGeometryPoint(latitude=19.04, longitude=-98.20),
            RouteGeometryPoint(latitude=19.06, longitude=-98.22),
        ],
        status=RoutingStatus.complete,
        calculated_at=datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
    )

    with (
        patch.object(assignment_route_service, "supabase_admin", database),
        patch.object(
            assignment_route_service, "get_route", return_value=route
        ) as get_route,
    ):
        result = assignment_route_service.calculate_assignment_route(
            "prop-1", "rep-1", "user-1"
        )

    assert result.status == RoutingStatus.complete
    get_route.assert_called_once()
    payload = tables["propuestas_asignacion"].update.call_args.args[0]
    assert payload["ruta_duracion_segundos"] == 420
    assert payload["ruta_distancia_metros"] == 3100
    assert payload["ruta_geometria"]["type"] == "LineString"
    assert payload["ruta_geometria"]["coordinates"][0] == [-98.20, 19.04]
    tables["propuestas_asignacion"].eq.assert_any_call("estado", "confirmada")


def test_uses_latest_validated_location_as_route_destination(make_query):
    database, tables = client(
        make_query,
        latest_location_id="av-1",
        latest_location={"latitud": 19.08, "longitud": -98.24},
    )
    route = RouteResult(
        origin_id="user-1",
        destination_id="rep-1",
        duration_seconds=480,
        distance_meters=3600,
        geometry=[
            RouteGeometryPoint(latitude=19.04, longitude=-98.20),
            RouteGeometryPoint(latitude=19.08, longitude=-98.24),
        ],
        status=RoutingStatus.complete,
        calculated_at=datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc),
    )

    with (
        patch.object(assignment_route_service, "supabase_admin", database),
        patch.object(
            assignment_route_service, "get_route", return_value=route
        ) as get_route,
    ):
        assignment_route_service.calculate_assignment_route(
            "prop-1", "rep-1", "user-1"
        )

    request = get_route.call_args.args[0]
    assert request.destination.latitude == 19.08
    assert request.destination.longitude == -98.24
    tables["avistamientos_animal"].eq.assert_any_call(
        "estado_validacion", "validado"
    )
    payload = tables["propuestas_asignacion"].update.call_args.args[0]
    assert payload["ruta_destino_latitud"] == 19.08
    assert payload["ruta_destino_longitud"] == -98.24


def test_falls_back_to_original_location_when_latest_is_unavailable(make_query):
    database, tables = client(
        make_query,
        latest_location_id="av-missing",
    )
    route = RouteResult(
        origin_id="user-1",
        destination_id="rep-1",
        duration_seconds=420,
        distance_meters=3100,
        geometry=[
            RouteGeometryPoint(latitude=19.04, longitude=-98.20),
            RouteGeometryPoint(latitude=19.06, longitude=-98.22),
        ],
        status=RoutingStatus.complete,
        calculated_at=datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc),
    )

    with (
        patch.object(assignment_route_service, "supabase_admin", database),
        patch.object(
            assignment_route_service, "get_route", return_value=route
        ) as get_route,
    ):
        assignment_route_service.calculate_assignment_route(
            "prop-1", "rep-1", "user-1"
        )

    request = get_route.call_args.args[0]
    assert request.destination.latitude == 19.06
    assert request.destination.longitude == -98.22
    payload = tables["propuestas_asignacion"].update.call_args.args[0]
    assert payload["ruta_destino_latitud"] == 19.06
    assert payload["ruta_destino_longitud"] == -98.22


def test_missing_coordinates_are_persisted_without_calling_osrm(make_query):
    database, tables = client(make_query, complete_coordinates=False)

    with (
        patch.object(assignment_route_service, "supabase_admin", database),
        patch.object(assignment_route_service, "get_route") as get_route,
    ):
        result = assignment_route_service.calculate_assignment_route(
            "prop-1", "rep-1", "user-1"
        )

    get_route.assert_not_called()
    assert result.status == RoutingStatus.unavailable
    assert result.error_code == RoutingErrorCode.missing_coordinates
    payload = tables["propuestas_asignacion"].update.call_args.args[0]
    assert payload["ruta_error_codigo"] == "missing_coordinates"
    assert payload["ruta_geometria"] is None
