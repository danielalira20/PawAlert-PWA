from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.urgency import (
    Coordinates,
    DuplicateCandidate,
    DuplicateSearchInput,
    ExternalSignalErrorCode,
    ExternalSignalStatus,
    RoadRiskResult,
    WeatherResult,
)


NOW = datetime(2026, 8, 12, 12, 0, tzinfo=timezone.utc)


def test_coordinates_reject_values_outside_the_globe():
    with pytest.raises(ValidationError):
        Coordinates(latitude=91, longitude=-98)
    with pytest.raises(ValidationError):
        Coordinates(latitude=19, longitude=-181)


@pytest.mark.parametrize("score", [0, 50, 100])
def test_weather_accepts_only_defined_operational_scores(score):
    result = WeatherResult(
        score=score,
        status=ExternalSignalStatus.complete,
        temperature_c=24,
        precipitation_mm_h=0,
        condition_code=800,
        observed_at=NOW,
        evaluated_at=NOW,
    )
    assert result.score == score
    assert result.source == "openweather"


def test_weather_failure_has_no_score_and_requires_reason():
    result = WeatherResult(
        score=None,
        status=ExternalSignalStatus.unavailable,
        evaluated_at=NOW,
        error_code=ExternalSignalErrorCode.timeout,
    )
    assert result.score is None

    with pytest.raises(ValidationError):
        WeatherResult(
            score=0,
            status=ExternalSignalStatus.unavailable,
            evaluated_at=NOW,
            error_code=ExternalSignalErrorCode.timeout,
        )

    with pytest.raises(ValidationError):
        WeatherResult(
            score=None,
            status=ExternalSignalStatus.unavailable,
            evaluated_at=NOW,
        )


def test_available_weather_requires_observation_date():
    with pytest.raises(ValidationError):
        WeatherResult(
            score=50,
            status=ExternalSignalStatus.cached,
            evaluated_at=NOW,
        )


def test_road_risk_requires_evidence_when_score_is_one_hundred():
    result = RoadRiskResult(
        score=100,
        status=ExternalSignalStatus.complete,
        road_type="primary",
        distance_m=23,
        calculated_at=NOW,
    )
    assert result.source == "osm"

    with pytest.raises(ValidationError):
        RoadRiskResult(
            score=100,
            status=ExternalSignalStatus.complete,
            calculated_at=NOW,
        )


def test_road_provider_failure_cannot_be_interpreted_as_safe():
    result = RoadRiskResult(
        score=None,
        status=ExternalSignalStatus.unavailable,
        calculated_at=NOW,
        error_code=ExternalSignalErrorCode.provider_error,
    )
    assert result.score is None

    with pytest.raises(ValidationError):
        RoadRiskResult(
            score=0,
            status=ExternalSignalStatus.unavailable,
            calculated_at=NOW,
            error_code=ExternalSignalErrorCode.provider_error,
        )


def test_road_risk_zero_cannot_claim_nearby_road():
    with pytest.raises(ValidationError):
        RoadRiskResult(
            score=0,
            status=ExternalSignalStatus.complete,
            road_type="motorway",
            distance_m=10,
            calculated_at=NOW,
        )


def test_duplicate_search_normalizes_species_without_duplicates():
    search = DuplicateSearchInput(
        latitude=19.04,
        longitude=-98.20,
        created_at=NOW,
        species=["Perro", " perro ", "Gato"],
        quantity=2,
    )
    assert search.species == ["perro", "gato"]


def test_duplicate_candidate_must_be_inside_operational_window():
    candidate = DuplicateCandidate(
        existing_report_id="reporte-1",
        distance_m=150,
        time_difference_minutes=120,
        shared_species=["Perro"],
    )
    assert candidate.shared_species == ["perro"]

    with pytest.raises(ValidationError):
        DuplicateCandidate(
            existing_report_id="reporte-2",
            distance_m=151,
            time_difference_minutes=30,
            shared_species=["perro"],
        )
