"""Endpoints privados para la ruta del voluntario asignado."""

from fastapi import APIRouter, Header, HTTPException

from app.db.supabase import supabase
from app.models.navigation import (
    NavigationCapabilitiesResponse,
    NavigationRouteRequest,
    NavigationRouteResponse,
)
from app.services import navigation_service


router = APIRouter()


def _authenticated_user(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        auth = supabase.auth.get_user(authorization.removeprefix("Bearer "))
        result = (
            supabase.table("usuarios")
            .select("id")
            .eq("auth_user_id", auth.user.id)
            .limit(1)
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado",
        ) from error
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return result.data[0]


def _call(operation):
    try:
        return operation()
    except navigation_service.NavigationServiceError as error:
        headers = None
        if error.retry_after_seconds is not None:
            headers = {"Retry-After": str(error.retry_after_seconds)}
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code.value, "message": error.detail},
            headers=headers,
        ) from error


@router.get(
    "/me/reportes/{reporte_id}/navegacion/capabilities",
    response_model=NavigationCapabilitiesResponse,
)
def get_navigation_capabilities(
    reporte_id: str,
    authorization: str | None = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: navigation_service.get_navigation_capabilities(
            reporte_id,
            user["id"],
        )
    )


@router.post(
    "/me/reportes/{reporte_id}/navegacion/ruta",
    response_model=NavigationRouteResponse,
)
def post_navigation_route(
    reporte_id: str,
    body: NavigationRouteRequest,
    authorization: str | None = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: navigation_service.calculate_navigation_route(
            reporte_id,
            user["id"],
            body,
        )
    )
