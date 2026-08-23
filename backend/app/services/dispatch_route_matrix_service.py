"""Construye la matriz OSRM para voluntarios y reportes de PawAlert."""

from datetime import datetime, timezone

from app.db.supabase import supabase_admin
from app.models.dispatch import (
    RouteMatrixRequest,
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingPoint,
    RoutingStatus,
)
from app.services.osrm_service import get_route_matrix


def _unique_ids(values: list[str], label: str) -> list[str]:
    normalized = list(dict.fromkeys(value for value in values if value))
    if not normalized:
        raise ValueError(f"{label} must include at least one id")
    return normalized


def _unavailable(
    volunteer_ids: list[str],
    report_ids: list[str],
) -> RouteMatrixResult:
    return RouteMatrixResult(
        origin_ids=volunteer_ids,
        destination_ids=report_ids,
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        error_code=RoutingErrorCode.missing_coordinates,
        calculated_at=datetime.now(timezone.utc),
    )


def _load_volunteer_points(volunteer_ids: list[str]) -> list[RoutingPoint] | None:
    result = (
        supabase_admin.table("capacidades")
        .select("voluntario_id, latitud, longitud")
        .in_("voluntario_id", volunteer_ids)
        .execute()
    )
    by_id = {
        row["voluntario_id"]: row
        for row in (result.data or [])
        if row.get("voluntario_id")
    }
    if any(
        volunteer_id not in by_id
        or by_id[volunteer_id].get("latitud") is None
        or by_id[volunteer_id].get("longitud") is None
        for volunteer_id in volunteer_ids
    ):
        return None

    return [
        RoutingPoint(
            id=volunteer_id,
            latitude=float(by_id[volunteer_id]["latitud"]),
            longitude=float(by_id[volunteer_id]["longitud"]),
        )
        for volunteer_id in volunteer_ids
    ]


def _load_report_points(report_ids: list[str]) -> list[RoutingPoint] | None:
    result = (
        supabase_admin.table("reportes")
        .select(
            "id, latitud, longitud, "
            "ultima_latitud_confirmada, ultima_longitud_confirmada"
        )
        .in_("id", report_ids)
        .execute()
    )
    by_id = {
        row["id"]: row for row in (result.data or []) if row.get("id")
    }
    if any(report_id not in by_id for report_id in report_ids):
        return None

    points = []
    for report_id in report_ids:
        report = by_id[report_id]
        latest_latitude = report.get("ultima_latitud_confirmada")
        latest_longitude = report.get("ultima_longitud_confirmada")
        if latest_latitude is not None and latest_longitude is not None:
            latitude = latest_latitude
            longitude = latest_longitude
        else:
            latitude = report.get("latitud")
            longitude = report.get("longitud")
        if latitude is None or longitude is None:
            return None
        points.append(
            RoutingPoint(
                id=report_id,
                latitude=float(latitude),
                longitude=float(longitude),
            )
        )
    return points


def calculate_dispatch_route_matrix(
    volunteer_ids: list[str],
    report_ids: list[str],
) -> RouteMatrixResult:
    """Obtiene una matriz ordenada o un resultado controlado para fallback."""
    normalized_volunteer_ids = _unique_ids(volunteer_ids, "volunteer_ids")
    normalized_report_ids = _unique_ids(report_ids, "report_ids")
    origins = _load_volunteer_points(normalized_volunteer_ids)
    destinations = _load_report_points(normalized_report_ids)
    if origins is None or destinations is None:
        return _unavailable(normalized_volunteer_ids, normalized_report_ids)

    return get_route_matrix(
        RouteMatrixRequest(origins=origins, destinations=destinations)
    )
