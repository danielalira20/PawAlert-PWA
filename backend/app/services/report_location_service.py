"""Resuelve la ubicacion autoritativa vigente de un reporte."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True)
class AuthoritativeReportDestination:
    latitude: float
    longitude: float
    source: Literal["validated_sighting", "initial_report"]
    revision: str
    confirmed_at: datetime | str | None = None


def resolve_authoritative_report_destination(
    report_row: dict,
    database,
) -> AuthoritativeReportDestination | None:
    report_id = str(report_row.get("id") or "")
    latest_location_id = report_row.get("ultima_ubicacion_confirmada_id")
    if latest_location_id:
        latest_location = (
            database.table("avistamientos_animal")
            .select("id, latitud, longitud, observado_at")
            .eq("id", latest_location_id)
            .eq("estado_validacion", "validado")
            .limit(1)
            .execute()
        )
        if latest_location.data:
            location_row = latest_location.data[0]
            if (
                location_row.get("latitud") is not None
                and location_row.get("longitud") is not None
            ):
                return AuthoritativeReportDestination(
                    latitude=float(location_row["latitud"]),
                    longitude=float(location_row["longitud"]),
                    source="validated_sighting",
                    revision=f"sighting:{latest_location_id}",
                    confirmed_at=location_row.get("observado_at"),
                )

    latitude = report_row.get("latitud")
    longitude = report_row.get("longitud")
    if latitude is None or longitude is None or not report_id:
        return None
    return AuthoritativeReportDestination(
        latitude=float(latitude),
        longitude=float(longitude),
        source="initial_report",
        revision=f"report:{report_id}",
    )
