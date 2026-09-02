from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.dispatch import (
    RouteGeometryPoint,
    RouteResult,
    RoutingErrorCode,
    RoutingMode,
    RoutingStatus,
)
from app.models.navigation import (
    NavigationErrorCode,
    NavigationMode,
    NavigationOriginRequest,
    NavigationRouteRequest,
    NavigationStatus,
)
from app.services import navigation_service


def navigation_database(
    make_query,
    *,
    proposal_state: str = "confirmada",
    report_state: str = "en_camino",
    proposal_exists: bool = True,
    latest_sighting: bool = True,
):
    proposals = make_query(
        data=[{
            "id": "proposal-1",
            "reporte_id": "report-1",
            "usuario_asignado_id": "user-1",
            "estado": proposal_state,
        }]
        if proposal_exists
        else []
    )
    reports = make_query(data=[{
        "id": "report-1",
        "estado_reporte": report_state,
        "latitud": 19.04,
        "longitud": -98.20,
        "ultima_ubicacion_confirmada_id": (
            "sighting-1" if latest_sighting else None
        ),
    }])
    sightings = make_query(data=[{
        "id": "sighting-1",
        "latitud": 19.06,
        "longitud": -98.22,
        "observado_at": "2026-09-01T18:27:00+00:00",
    }])
    tables = {
        "propuestas_asignacion": proposals,
        "reportes": reports,
        "avistamientos_animal": sightings,
    }
    database = MagicMock()
    database.table.side_effect = lambda name: tables[name]
    return database, tables


def route_request(
    *,
    captured_at: datetime | None = None,
    accuracy_meters: float = 18,
    known_revision: str | None = None,
) -> NavigationRouteRequest:
    return NavigationRouteRequest(
        origin=NavigationOriginRequest(
            latitude=19.03,
            longitude=-98.19,
            accuracy_meters=accuracy_meters,
            captured_at=captured_at or datetime.now(timezone.utc),
        ),
        mode=NavigationMode.driving,
        known_destination_revision=known_revision,
    )


def complete_route() -> RouteResult:
    return RouteResult(
        origin_id="device:user-1",
        destination_id="report-1",
        duration_seconds=725.4,
        distance_meters=5400.8,
        geometry=[
            RouteGeometryPoint(latitude=19.03, longitude=-98.19),
            RouteGeometryPoint(latitude=19.06, longitude=-98.22),
        ],
        status=RoutingStatus.complete,
        calculated_at=datetime.now(timezone.utc),
    )


@pytest.fixture(autouse=True)
def clear_navigation_limiter():
    navigation_service._recalculation_limiter.clear()
    yield
    navigation_service._recalculation_limiter.clear()


def test_calculates_private_route_to_latest_validated_sighting(make_query):
    database, tables = navigation_database(make_query)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[
                RoutingMode.driving,
                RoutingMode.cycling,
                RoutingMode.walking,
            ],
        ),
        patch.object(
            navigation_service,
            "get_route",
            return_value=complete_route(),
        ) as get_route,
        patch.object(
            navigation_service.settings,
            "navigation_recalc_min_interval_seconds",
            0,
        ),
    ):
        result = navigation_service.calculate_navigation_route(
            "report-1",
            "user-1",
            route_request(),
        )

    assert result.status == NavigationStatus.complete
    assert result.destination.source == "validated_sighting"
    assert result.destination.revision == "sighting:sighting-1"
    assert result.route.geometry.coordinates == [
        (-98.19, 19.03),
        (-98.22, 19.06),
    ]
    assert result.expires_at > result.calculated_at
    provider_request = get_route.call_args.args[0]
    assert provider_request.destination.latitude == 19.06
    assert provider_request.destination.longitude == -98.22
    assert provider_request.mode == RoutingMode.driving
    tables["propuestas_asignacion"].update.assert_not_called()
    tables["reportes"].update.assert_not_called()


def test_destination_is_never_taken_from_client_payload(make_query):
    payload = route_request().model_dump()
    payload["destination"] = {"latitude": 0, "longitude": 0}
    request = NavigationRouteRequest.model_validate(payload)
    database, _tables = navigation_database(make_query)

    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[RoutingMode.driving],
        ),
        patch.object(
            navigation_service,
            "get_route",
            return_value=complete_route(),
        ) as get_route,
        patch.object(
            navigation_service.settings,
            "navigation_recalc_min_interval_seconds",
            0,
        ),
    ):
        navigation_service.calculate_navigation_route(
            "report-1", "user-1", request
        )

    provider_request = get_route.call_args.args[0]
    assert provider_request.destination.latitude == 19.06
    assert provider_request.destination.longitude == -98.22


@pytest.mark.parametrize(
    ("database_options", "expected_code", "expected_status"),
    [
        (
            {"proposal_exists": False},
            NavigationErrorCode.navigation_not_found,
            404,
        ),
        (
            {"proposal_state": "activa"},
            NavigationErrorCode.assignment_not_confirmed,
            409,
        ),
        (
            {"report_state": "cerrado"},
            NavigationErrorCode.report_not_navigable,
            409,
        ),
    ],
)
def test_rejects_non_authorized_or_non_navigable_cases(
    make_query,
    database_options,
    expected_code,
    expected_status,
):
    database, _tables = navigation_database(make_query, **database_options)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        pytest.raises(navigation_service.NavigationServiceError) as error,
    ):
        navigation_service.calculate_navigation_route(
            "report-1", "user-1", route_request()
        )

    assert error.value.code == expected_code
    assert error.value.status_code == expected_status


@pytest.mark.parametrize(
    ("navigation_request", "expected_code"),
    [
        (
            route_request(
                captured_at=datetime.now(timezone.utc) - timedelta(minutes=5)
            ),
            NavigationErrorCode.stale_origin,
        ),
        (
            route_request(accuracy_meters=250),
            NavigationErrorCode.low_accuracy_origin,
        ),
    ],
)
def test_rejects_unusable_gps_without_calling_osrm(
    make_query,
    navigation_request,
    expected_code,
):
    database, _tables = navigation_database(make_query)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[RoutingMode.driving],
        ),
        patch.object(navigation_service, "get_route") as get_route,
        pytest.raises(navigation_service.NavigationServiceError) as error,
    ):
        navigation_service.calculate_navigation_route(
            "report-1", "user-1", navigation_request
        )

    assert error.value.code == expected_code
    assert error.value.status_code == 422
    get_route.assert_not_called()


def test_provider_timeout_returns_controlled_fallback(make_query):
    database, _tables = navigation_database(make_query, latest_sighting=False)
    unavailable = RouteResult(
        origin_id="device:user-1",
        destination_id="report-1",
        status=RoutingStatus.unavailable,
        error_code=RoutingErrorCode.timeout,
        calculated_at=datetime.now(timezone.utc),
    )
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[RoutingMode.driving],
        ),
        patch.object(navigation_service, "get_route", return_value=unavailable),
        patch.object(
            navigation_service.settings,
            "navigation_recalc_min_interval_seconds",
            0,
        ),
    ):
        result = navigation_service.calculate_navigation_route(
            "report-1", "user-1", route_request()
        )

    assert result.status == NavigationStatus.unavailable
    assert result.destination.source == "initial_report"
    assert result.error_code == NavigationErrorCode.provider_timeout
    assert result.retryable is True
    assert result.route is None


def test_known_old_destination_marks_change_and_bypasses_wait(make_query):
    database, _tables = navigation_database(make_query)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[RoutingMode.driving],
        ),
        patch.object(
            navigation_service,
            "get_route",
            return_value=complete_route(),
        ),
        patch.object(
            navigation_service.settings,
            "navigation_recalc_min_interval_seconds",
            30,
        ),
    ):
        first = navigation_service.calculate_navigation_route(
            "report-1", "user-1", route_request()
        )
        changed = navigation_service.calculate_navigation_route(
            "report-1",
            "user-1",
            route_request(known_revision="report:report-1"),
        )

    assert first.warnings == []
    assert changed.warnings == ["destination_changed"]


def test_repeated_recalculation_is_rate_limited(make_query):
    database, _tables = navigation_database(make_query)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[RoutingMode.driving],
        ),
        patch.object(
            navigation_service,
            "get_route",
            return_value=complete_route(),
        ),
        patch.object(
            navigation_service.settings,
            "navigation_recalc_min_interval_seconds",
            30,
        ),
    ):
        navigation_service.calculate_navigation_route(
            "report-1", "user-1", route_request()
        )
        with pytest.raises(navigation_service.NavigationServiceError) as error:
            navigation_service.calculate_navigation_route(
                "report-1", "user-1", route_request()
            )

    assert error.value.code == NavigationErrorCode.recalculation_rate_limited
    assert error.value.status_code == 429
    assert error.value.retry_after_seconds is not None


def test_capabilities_only_publish_driving_during_n1(make_query):
    database, _tables = navigation_database(make_query)
    with (
        patch.object(navigation_service, "supabase_admin", database),
        patch.object(
            navigation_service,
            "configured_route_modes",
            return_value=[
                RoutingMode.driving,
                RoutingMode.cycling,
                RoutingMode.walking,
            ],
        ),
    ):
        result = navigation_service.get_navigation_capabilities(
            "report-1", "user-1"
        )

    assert result.navigation_enabled is True
    assert result.available_modes == [NavigationMode.driving]
    assert result.destination_revision == "sighting:sighting-1"
    assert result.background_tracking is False
    assert result.live_traffic is False
    assert "latitude" not in result.model_dump()
    assert "longitude" not in result.model_dump()
