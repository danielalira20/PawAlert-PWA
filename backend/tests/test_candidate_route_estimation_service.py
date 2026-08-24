from datetime import datetime, timezone
from unittest.mock import patch

from app.models.dispatch import (
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingStatus,
)
from app.services import candidate_route_estimation_service as service


CALCULATED_AT = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)


def matrix(**changes) -> RouteMatrixResult:
    values = {
        "origin_ids": ["vol-1", "vol-2"],
        "destination_ids": ["rep-1"],
        "durations_seconds": [[120], [240]],
        "distances_meters": [[900], [1800]],
        "status": RoutingStatus.complete,
        "calculated_at": CALCULATED_AT,
    }
    values.update(changes)
    return RouteMatrixResult(**values)


def candidates():
    return [
        {"voluntario_id": "vol-1", "score": {"total": 80}},
        {"voluntario_id": "vol-2", "score": {"total": 70}},
    ]


def test_enriches_candidates_without_reordering_matching():
    with patch.object(
        service,
        "calculate_dispatch_route_matrix",
        return_value=matrix(),
    ):
        result = service.enrich_candidates_with_route_estimates(
            "rep-1", candidates()
        )

    assert [item["voluntario_id"] for item in result] == ["vol-1", "vol-2"]
    assert result[0]["ruta_estimada"] == {
        "status": "complete",
        "duration_seconds": 120.0,
        "distance_meters": 900.0,
        "error_code": None,
        "calculated_at": "2026-08-23T12:00:00+00:00",
        "source": "osrm",
    }
    assert result[1]["ruta_estimada"]["duration_seconds"] == 240.0


def test_marks_an_individual_pair_without_route():
    result_matrix = matrix(
        durations_seconds=[[None], [240]],
        distances_meters=[[None], [1800]],
    )
    with patch.object(
        service,
        "calculate_dispatch_route_matrix",
        return_value=result_matrix,
    ):
        result = service.enrich_candidates_with_route_estimates(
            "rep-1", candidates()
        )

    assert result[0]["ruta_estimada"]["status"] == "unavailable"
    assert result[0]["ruta_estimada"]["error_code"] == "no_route"
    assert result[1]["ruta_estimada"]["status"] == "complete"


def test_osrm_failure_does_not_remove_candidates():
    unavailable = matrix(
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        error_code=RoutingErrorCode.timeout,
    )
    with patch.object(
        service,
        "calculate_dispatch_route_matrix",
        return_value=unavailable,
    ):
        result = service.enrich_candidates_with_route_estimates(
            "rep-1", candidates()
        )

    assert len(result) == 2
    assert all(
        item["ruta_estimada"]["error_code"] == "timeout"
        for item in result
    )


def test_unexpected_error_does_not_block_matching():
    with patch.object(
        service,
        "calculate_dispatch_route_matrix",
        side_effect=RuntimeError("fallo inesperado"),
    ):
        result = service.enrich_candidates_with_route_estimates(
            "rep-1", candidates()
        )

    assert len(result) == 2
    assert all(
        item["ruta_estimada"]["error_code"] == "provider_error"
        for item in result
    )


def test_unexpected_destination_does_not_block_matching():
    unexpected = matrix(destination_ids=["rep-other"])
    with patch.object(
        service,
        "calculate_dispatch_route_matrix",
        return_value=unexpected,
    ):
        result = service.enrich_candidates_with_route_estimates(
            "rep-1", candidates()
        )

    assert len(result) == 2
    assert all(
        item["ruta_estimada"]["error_code"] == "invalid_response"
        for item in result
    )
