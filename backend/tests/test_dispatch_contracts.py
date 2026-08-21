from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.dispatch import (
    MATCHING_WEIGHTS,
    ConfirmedReportLocation,
    DispatchVolunteer,
    LocationSource,
    ObservedMobility,
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingPoint,
    RoutingStatus,
)
from app.services import matching


NOW = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)


def point(point_id: str = "point-1") -> RoutingPoint:
    return RoutingPoint(id=point_id, latitude=19.04, longitude=-98.20)


def test_matching_uses_approved_current_formula():
    assert MATCHING_WEIGHTS == {
        "proximidad": 0.30,
        "disponibilidad": 0.25,
        "experiencia": 0.20,
        "movilidad": 0.15,
        "carga": 0.10,
    }
    assert sum(MATCHING_WEIGHTS.values()) == 1
    assert matching.PESOS is MATCHING_WEIGHTS


def test_complete_route_matrix_requires_expected_dimensions():
    result = RouteMatrixResult(
        origin_ids=["vol-1"],
        destination_ids=["rep-1", "rep-2"],
        durations_seconds=[[120, 300]],
        distances_meters=[[900, 2400]],
        status=RoutingStatus.complete,
        calculated_at=NOW,
    )

    assert result.durations_seconds[0][1] == 300

    with pytest.raises(ValidationError, match="column count"):
        RouteMatrixResult(
            origin_ids=["vol-1"],
            destination_ids=["rep-1", "rep-2"],
            durations_seconds=[[120]],
            distances_meters=[[900, 2400]],
            status=RoutingStatus.complete,
            calculated_at=NOW,
        )


def test_unavailable_route_matrix_has_no_partial_data():
    result = RouteMatrixResult(
        origin_ids=["vol-1"],
        destination_ids=["rep-1"],
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        calculated_at=NOW,
        error_code=RoutingErrorCode.timeout,
    )

    assert result.error_code == RoutingErrorCode.timeout


def test_external_volunteer_requires_an_explicit_offer():
    with pytest.raises(ValidationError, match="explicit offer"):
        DispatchVolunteer(
            volunteer_id="vol-ext-1",
            location=point(),
            matching_score=80,
            capacity=2,
            current_load=0,
            role="voluntario_externo",
        )


def test_confirmed_location_has_source_time_and_mobility():
    location = ConfirmedReportLocation(
        report_id="rep-1",
        location=point("rep-1"),
        confirmed_at=NOW,
        source=LocationSource.reportante,
        observed_mobility=ObservedMobility.caminando,
    )

    assert location.location.latitude == 19.04
    assert location.source == LocationSource.reportante
