"""Reglas de negocio para navegar un caso ya asignado."""

from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.dispatch import (
    RouteRequest,
    RoutingErrorCode,
    RoutingMode,
    RoutingPoint,
    RoutingStatus,
)
from app.models.navigation import (
    NavigationCapabilitiesResponse,
    NavigationDestination,
    NavigationErrorCode,
    NavigationGeometry,
    NavigationMode,
    NavigationOrigin,
    NavigationOriginRequest,
    NavigationRouteData,
    NavigationRouteRequest,
    NavigationRouteResponse,
    NavigationStep,
    NavigationStatus,
)
from app.services.osrm_service import configured_route_modes, get_route
from app.services.report_location_service import (
    AuthoritativeReportDestination,
    resolve_authoritative_report_destination,
)


NAVIGABLE_REPORT_STATES = frozenset({"en_camino", "en_atencion"})


class NavigationServiceError(Exception):
    def __init__(
        self,
        code: NavigationErrorCode,
        status_code: int,
        detail: str,
        *,
        retry_after_seconds: int | None = None,
    ) -> None:
        super().__init__(detail)
        self.code = code
        self.status_code = status_code
        self.detail = detail
        self.retry_after_seconds = retry_after_seconds


class _RecalculationLimiter:
    """Limite efimero por proceso; no persiste coordenadas ni recorridos."""

    def __init__(self) -> None:
        self._last_requests: dict[tuple[str, str, str], float] = {}
        self._lock = Lock()

    def consume(
        self,
        key: tuple[str, str, str],
        interval_seconds: int,
        *,
        bypass_wait: bool = False,
    ) -> None:
        now = monotonic()
        with self._lock:
            last_request = self._last_requests.get(key)
            if (
                not bypass_wait
                and interval_seconds > 0
                and last_request is not None
            ):
                remaining = interval_seconds - (now - last_request)
                if remaining > 0:
                    raise NavigationServiceError(
                        NavigationErrorCode.recalculation_rate_limited,
                        429,
                        "Espera un momento antes de volver a calcular la ruta.",
                        retry_after_seconds=max(1, int(remaining + 0.999)),
                    )
            self._last_requests[key] = now

    def clear(self) -> None:
        with self._lock:
            self._last_requests.clear()


_recalculation_limiter = _RecalculationLimiter()


def _available_modes() -> list[NavigationMode]:
    return [NavigationMode(mode.value) for mode in configured_route_modes()]


def _load_navigation_context(
    report_id: str,
    user_id: str,
) -> tuple[dict, dict]:
    proposal = (
        supabase_admin.table("propuestas_asignacion")
        .select("id, reporte_id, usuario_asignado_id, estado")
        .eq("reporte_id", report_id)
        .eq("usuario_asignado_id", user_id)
        .order("enviada_at", desc=True)
        .limit(1)
        .execute()
    )
    if not proposal.data:
        raise NavigationServiceError(
            NavigationErrorCode.navigation_not_found,
            404,
            "No se encontró una navegación disponible para este caso.",
        )

    proposal_row = proposal.data[0]
    if proposal_row.get("estado") != "confirmada":
        raise NavigationServiceError(
            NavigationErrorCode.assignment_not_confirmed,
            409,
            "La asignación debe estar confirmada antes de abrir la ruta.",
        )

    report = (
        supabase_admin.table("reportes")
        .select(
            "id, estado_reporte, latitud, longitud, "
            "ultima_ubicacion_confirmada_id"
        )
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    if not report.data:
        raise NavigationServiceError(
            NavigationErrorCode.navigation_not_found,
            404,
            "No se encontró una navegación disponible para este caso.",
        )

    report_row = report.data[0]
    if report_row.get("estado_reporte") not in NAVIGABLE_REPORT_STATES:
        raise NavigationServiceError(
            NavigationErrorCode.report_not_navigable,
            409,
            "El caso ya no se encuentra en un estado navegable.",
        )
    return proposal_row, report_row


def _resolve_destination(report_row: dict) -> AuthoritativeReportDestination:
    destination = resolve_authoritative_report_destination(
        report_row,
        supabase_admin,
    )
    if destination is None:
        raise NavigationServiceError(
            NavigationErrorCode.navigation_access_revoked,
            409,
            "El caso no tiene una ubicación vigente disponible.",
        )
    return destination


def _validate_origin(origin: NavigationOriginRequest, now: datetime) -> datetime:
    captured_at = origin.captured_at
    if captured_at.utcoffset() is None:
        raise NavigationServiceError(
            NavigationErrorCode.invalid_origin,
            422,
            "La ubicación debe incluir fecha, hora y zona horaria.",
        )

    captured_at = captured_at.astimezone(timezone.utc)
    if captured_at > now:
        raise NavigationServiceError(
            NavigationErrorCode.invalid_origin,
            422,
            "La fecha de la ubicación no puede estar en el futuro.",
        )
    if (now - captured_at).total_seconds() > settings.navigation_gps_max_age_seconds:
        raise NavigationServiceError(
            NavigationErrorCode.stale_origin,
            422,
            "La ubicación es antigua. Obtén una lectura nueva para continuar.",
        )
    if (
        origin.accuracy_meters is not None
        and origin.accuracy_meters
        > settings.navigation_gps_max_accuracy_meters
    ):
        raise NavigationServiceError(
            NavigationErrorCode.low_accuracy_origin,
            422,
            "La ubicación todavía no tiene precisión suficiente.",
        )
    return captured_at


def get_navigation_capabilities(
    report_id: str,
    user_id: str,
) -> NavigationCapabilitiesResponse:
    _proposal, report = _load_navigation_context(report_id, user_id)
    destination = _resolve_destination(report)
    modes = _available_modes()
    return NavigationCapabilitiesResponse(
        navigation_enabled=bool(modes),
        available_modes=modes,
        destination_revision=destination.revision,
    )


def calculate_navigation_route(
    report_id: str,
    user_id: str,
    request: NavigationRouteRequest,
) -> NavigationRouteResponse:
    _proposal, report = _load_navigation_context(report_id, user_id)
    destination = _resolve_destination(report)
    available_modes = _available_modes()
    if request.mode not in available_modes:
        raise NavigationServiceError(
            NavigationErrorCode.mode_unavailable,
            400,
            "El modo de traslado seleccionado no está disponible.",
        )

    now = datetime.now(timezone.utc)
    captured_at = _validate_origin(request.origin, now)
    destination_changed = (
        request.known_destination_revision is not None
        and request.known_destination_revision != destination.revision
    )
    _recalculation_limiter.consume(
        (user_id, report_id, request.mode.value),
        settings.navigation_recalc_min_interval_seconds,
        bypass_wait=destination_changed,
    )

    route_result = get_route(
        RouteRequest(
            origin=RoutingPoint(
                id=f"device:{user_id}",
                latitude=request.origin.latitude,
                longitude=request.origin.longitude,
            ),
            destination=RoutingPoint(
                id=report_id,
                latitude=destination.latitude,
                longitude=destination.longitude,
            ),
            mode=RoutingMode(request.mode.value),
            include_steps=True,
        )
    )

    response_destination = NavigationDestination(
        source=destination.source,
        latitude=destination.latitude,
        longitude=destination.longitude,
        confirmed_at=destination.confirmed_at,
        revision=destination.revision,
    )
    response_origin = NavigationOrigin(
        source="device_gps",
        latitude=request.origin.latitude,
        longitude=request.origin.longitude,
        accuracy_meters=request.origin.accuracy_meters,
        captured_at=captured_at,
    )
    warnings = ["destination_changed"] if destination_changed else []

    if route_result.status == RoutingStatus.complete:
        calculated_at = route_result.calculated_at
        return NavigationRouteResponse(
            status=NavigationStatus.complete,
            report_id=report_id,
            mode=request.mode,
            available_modes=available_modes,
            origin=response_origin,
            destination=response_destination,
            route=NavigationRouteData(
                duration_seconds=route_result.duration_seconds,
                distance_meters=route_result.distance_meters,
                geometry=NavigationGeometry(
                    coordinates=[
                        (point.longitude, point.latitude)
                        for point in route_result.geometry
                    ]
                ),
                steps=[
                    NavigationStep(
                        type=step.type,
                        modifier=step.modifier,
                        street_name=step.street_name,
                        distance_meters=step.distance_meters,
                        duration_seconds=step.duration_seconds,
                        location=step.location,
                    )
                    for step in route_result.steps
                ],
            ),
            calculated_at=calculated_at,
            expires_at=calculated_at
            + timedelta(seconds=settings.navigation_route_ttl_seconds),
            warnings=warnings,
        )

    error_code, retryable = _provider_error(route_result.error_code)
    return NavigationRouteResponse(
        status=NavigationStatus.unavailable,
        report_id=report_id,
        mode=request.mode,
        available_modes=available_modes,
        origin=response_origin,
        destination=response_destination,
        route=None,
        calculated_at=route_result.calculated_at,
        warnings=warnings,
        error_code=error_code,
        retryable=retryable,
    )


def _provider_error(
    error_code: RoutingErrorCode | None,
) -> tuple[NavigationErrorCode, bool]:
    if error_code == RoutingErrorCode.timeout:
        return NavigationErrorCode.provider_timeout, True
    if error_code == RoutingErrorCode.no_route:
        return NavigationErrorCode.no_route, False
    return NavigationErrorCode.provider_error, True
