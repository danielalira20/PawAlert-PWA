from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException

from app.db.supabase import supabase
from app.models.adoption import (
    AdoptionIntakeCancel,
    AdoptionIntakeClarification,
    AdoptionIntakeCreate,
    AdoptionIntakeResolve,
    AdoptionProfilePause,
    AdoptionProfilePublish,
    FormalAdoptionProfileCreate,
)
from app.services import adoption_service


router = APIRouter()


def _authenticated_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        auth = supabase.auth.get_user(authorization.removeprefix("Bearer "))
    except Exception as error:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado",
        ) from error

    result = (
        supabase.table("usuarios")
        .select("id, asociacion_id, roles(nombre)")
        .eq("auth_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    row = result.data[0]
    return {
        "id": row["id"],
        "asociacion_id": row.get("asociacion_id"),
        "rol": (row.get("roles") or {}).get("nombre"),
    }


def _temporary_home(user: dict) -> None:
    if user.get("rol") != "voluntario_externo":
        raise HTTPException(
            status_code=403,
            detail="Esta acción corresponde al hogar temporal",
        )


def _association_context(user: dict) -> str:
    if user.get("rol") not in ("asociacion", "staff"):
        raise HTTPException(
            status_code=403,
            detail="Esta acción corresponde a una asociación",
        )
    association_id = user.get("asociacion_id")
    if not association_id:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta no está vinculada a una asociación",
        )
    return association_id


def _call(operation):
    try:
        return operation()
    except adoption_service.AdoptionServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.post("/custody/{custody_id}/adoption-intake-requests", status_code=201)
def create_custody_adoption_intake(
    custody_id: UUID,
    body: AdoptionIntakeCreate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    _temporary_home(user)
    return _call(
        lambda: adoption_service.proponer_ingreso_desde_custodia(
            str(custody_id), user["id"], body
        )
    )


@router.get("/custody/{custody_id}/adoption-intake-request")
def get_custody_adoption_intake(
    custody_id: UUID,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    _temporary_home(user)
    return _call(
        lambda: adoption_service.obtener_ingreso_de_custodia(
            str(custody_id), user["id"]
        )
    )


@router.post("/adoption-intake-requests/{request_id}/clarifications")
def answer_adoption_intake_clarification(
    request_id: UUID,
    body: AdoptionIntakeClarification,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    _temporary_home(user)
    return _call(
        lambda: adoption_service.responder_aclaracion(
            str(request_id), user["id"], body
        )
    )


@router.post("/adoption-intake-requests/{request_id}/cancel")
def cancel_adoption_intake(
    request_id: UUID,
    body: AdoptionIntakeCancel,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    _temporary_home(user)
    return _call(
        lambda: adoption_service.cancelar_ingreso(
            str(request_id), user["id"], body
        )
    )


@router.get("/associations/me/adoption-intake-requests")
def get_association_adoption_intakes(
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.listar_ingresos_asociacion(association_id)
    )


@router.post("/adoption-intake-requests/{request_id}/resolve")
def resolve_adoption_intake(
    request_id: UUID,
    body: AdoptionIntakeResolve,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.resolver_ingreso(
            str(request_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.post("/associations/me/adoptions", status_code=201)
def create_formal_adoption_profile(
    body: FormalAdoptionProfileCreate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.crear_perfil_formal(
            association_id, user["id"], body
        )
    )


@router.get("/associations/me/adoptions")
def get_association_adoption_profiles(
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.listar_perfiles_asociacion(association_id)
    )


@router.post("/associations/me/adoptions/{profile_id}/publish")
def publish_adoption_profile(
    profile_id: UUID,
    body: AdoptionProfilePublish,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.publicar_perfil(
            str(profile_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.post("/associations/me/adoptions/{profile_id}/pause")
def pause_adoption_profile(
    profile_id: UUID,
    body: AdoptionProfilePause,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.pausar_perfil(
            str(profile_id),
            association_id,
            user["id"],
            body,
        )
    )
