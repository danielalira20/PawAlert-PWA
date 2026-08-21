"""Calcula y persiste la ruta privada de una asignacion confirmada."""

from datetime import datetime, timezone

from app.db.supabase import supabase_admin
from app.models.dispatch import (
    RouteRequest,
    RouteResult,
    RoutingErrorCode,
    RoutingPoint,
    RoutingStatus,
)
from app.services.osrm_service import get_route


def _unavailable(
    reporte_id: str,
    usuario_id: str,
    error_code: RoutingErrorCode,
) -> RouteResult:
    return RouteResult(
        origin_id=usuario_id,
        destination_id=reporte_id,
        status=RoutingStatus.unavailable,
        error_code=error_code,
        calculated_at=datetime.now(timezone.utc),
    )


def _load_coordinates(
    reporte_id: str, usuario_id: str
) -> tuple[RoutingPoint | None, RoutingPoint | None]:
    report = (
        supabase_admin.table("reportes")
        .select("id, latitud, longitud")
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    volunteer = (
        supabase_admin.table("voluntarios")
        .select("id")
        .eq("usuario_id", usuario_id)
        .limit(1)
        .execute()
    )
    if not report.data or not volunteer.data:
        return None, None

    capacity = (
        supabase_admin.table("capacidades")
        .select("latitud, longitud")
        .eq("voluntario_id", volunteer.data[0]["id"])
        .limit(1)
        .execute()
    )
    report_row = report.data[0]
    capacity_row = capacity.data[0] if capacity.data else {}
    values = (
        capacity_row.get("latitud"),
        capacity_row.get("longitud"),
        report_row.get("latitud"),
        report_row.get("longitud"),
    )
    if any(value is None for value in values):
        return None, None

    origin = RoutingPoint(
        id=usuario_id,
        latitude=float(values[0]),
        longitude=float(values[1]),
    )
    destination = RoutingPoint(
        id=reporte_id,
        latitude=float(values[2]),
        longitude=float(values[3]),
    )
    return origin, destination


def _persistence_payload(
    result: RouteResult,
    origin: RoutingPoint | None,
    destination: RoutingPoint | None,
) -> dict:
    payload = {
        "ruta_status": result.status.value,
        "ruta_duracion_segundos": result.duration_seconds,
        "ruta_distancia_metros": result.distance_meters,
        "ruta_geometria": (
            {
                "type": "LineString",
                "coordinates": [
                    [point.longitude, point.latitude]
                    for point in result.geometry
                ],
            }
            if result.geometry
            else None
        ),
        "ruta_error_codigo": (
            result.error_code.value if result.error_code else None
        ),
        "ruta_calculada_at": result.calculated_at.isoformat(),
        "ruta_origen_latitud": origin.latitude if origin else None,
        "ruta_origen_longitud": origin.longitude if origin else None,
        "ruta_destino_latitud": destination.latitude if destination else None,
        "ruta_destino_longitud": destination.longitude if destination else None,
    }
    return payload


def calculate_assignment_route(
    propuesta_id: str, reporte_id: str, usuario_id: str
) -> RouteResult:
    origin, destination = _load_coordinates(reporte_id, usuario_id)
    if origin is None or destination is None:
        result = _unavailable(
            reporte_id, usuario_id, RoutingErrorCode.missing_coordinates
        )
    else:
        result = get_route(RouteRequest(origin=origin, destination=destination))

    (
        supabase_admin.table("propuestas_asignacion")
        .update(_persistence_payload(result, origin, destination))
        .eq("id", propuesta_id)
        .eq("reporte_id", reporte_id)
        .eq("usuario_asignado_id", usuario_id)
        .eq("estado", "confirmada")
        .execute()
    )
    return result
