from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile

from app.db.supabase import supabase
from app.models.adoption import (
    AdoptionApplicationAction,
    AdoptionApplicationDraftCreate,
    AdoptionApplicationDraftUpdate,
    AdoptionApplicationView,
    AdoptionApplicationWithdraw,
    AdoptionIntakeCancel,
    AdoptionIntakeClarification,
    AdoptionIntakeCreate,
    AdoptionIntakeResolve,
    AdoptionProfilePause,
    AdoptionProfilePhotoRemove,
    AdoptionProfilePhotoReview,
    AdoptionProfilePublish,
    AdoptionProfileUpdate,
    AdoptionPublicPage,
    AdoptionPublicProfileDetail,
    AdoptionRequirementTemplateAction,
    AdoptionRequirementTemplatePanel,
    AdoptionRequirementTemplateRetire,
    AdoptionRequirementTemplateWrite,
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


@router.get("/adoptions", response_model=AdoptionPublicPage)
def get_public_adoptions(
    especie: str | None = Query(None, min_length=1, max_length=80),
    tamanio: str | None = Query(None, min_length=1, max_length=80),
    edad: Literal[
        "cachorro", "joven", "adulto", "senior", "desconocido"
    ] | None = Query(None),
    zona: str | None = Query(None, min_length=1, max_length=120),
    compatible_con: str | None = Query(None, min_length=1, max_length=80),
    pagina: int = Query(1, ge=1),
    limite: int = Query(20, ge=1, le=50),
):
    return _call(
        lambda: adoption_service.listar_adopciones_publicas(
            especie=especie,
            tamanio=tamanio,
            edad=edad,
            zona=zona,
            compatible_con=compatible_con,
            pagina=pagina,
            limite=limite,
        )
    )


@router.get(
    "/adoptions/{profile_id}",
    response_model=AdoptionPublicProfileDetail,
)
def get_public_adoption(profile_id: UUID):
    return _call(
        lambda: adoption_service.obtener_adopcion_publica(str(profile_id))
    )


@router.post(
    "/adoptions/{profile_id}/applications/draft",
    status_code=201,
)
def create_adoption_application_draft(
    profile_id: UUID,
    body: AdoptionApplicationDraftCreate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: adoption_service.crear_borrador_solicitud(
            str(profile_id),
            user["id"],
            body,
        )
    )


@router.patch("/adoption-applications/{application_id}/draft")
def update_adoption_application_draft(
    application_id: UUID,
    body: AdoptionApplicationDraftUpdate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: adoption_service.actualizar_respuestas_solicitud(
            str(application_id),
            user["id"],
            body,
        )
    )


@router.post("/adoption-applications/{application_id}/documents")
async def upload_adoption_application_document(
    application_id: UUID,
    document: UploadFile = File(...),
    question_key: str = Form(
        ...,
        min_length=1,
        max_length=80,
        pattern=r"^[a-z0-9_]+$",
    ),
    idempotency_key: str = Form(..., min_length=8, max_length=200),
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    try:
        return await adoption_service.subir_documento_solicitud(
            str(application_id),
            user["id"],
            document,
            question_key=question_key,
            idempotency_key=idempotency_key,
        )
    except adoption_service.AdoptionServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.post("/adoption-applications/{application_id}/submit")
def submit_adoption_application(
    application_id: UUID,
    body: AdoptionApplicationAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: adoption_service.enviar_solicitud(
            str(application_id),
            user["id"],
            body,
        )
    )


@router.post("/adoption-applications/{application_id}/withdraw")
def withdraw_adoption_application(
    application_id: UUID,
    body: AdoptionApplicationWithdraw,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: adoption_service.retirar_solicitud(
            str(application_id),
            user["id"],
            body,
        )
    )


@router.get(
    "/me/adoption-applications",
    response_model=list[AdoptionApplicationView],
)
def get_my_adoption_applications(
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: adoption_service.listar_mis_solicitudes(user["id"])
    )


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


@router.get(
    "/associations/me/adoption-requirement-templates",
    response_model=AdoptionRequirementTemplatePanel,
)
def get_association_adoption_requirement_templates(
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.listar_plantillas_requisitos(
            association_id
        )
    )


@router.post(
    "/associations/me/adoption-requirement-templates",
    status_code=201,
)
def create_association_adoption_requirement_template(
    body: AdoptionRequirementTemplateWrite,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.crear_plantilla_requisitos(
            association_id,
            user["id"],
            body,
        )
    )


@router.put(
    "/associations/me/adoption-requirement-templates/{template_id}",
)
def update_association_adoption_requirement_template(
    template_id: UUID,
    body: AdoptionRequirementTemplateWrite,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.actualizar_plantilla_requisitos(
            str(template_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.post(
    "/associations/me/adoption-requirement-templates/{template_id}/activate",
)
def activate_association_adoption_requirement_template(
    template_id: UUID,
    body: AdoptionRequirementTemplateAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.activar_plantilla_requisitos(
            str(template_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.post(
    "/associations/me/adoption-requirement-templates/{template_id}/retire",
)
def retire_association_adoption_requirement_template(
    template_id: UUID,
    body: AdoptionRequirementTemplateRetire,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.retirar_plantilla_requisitos(
            str(template_id),
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


@router.get("/associations/me/adoptions/{profile_id}")
def get_association_adoption_profile(
    profile_id: UUID,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.obtener_perfil_asociacion(
            str(profile_id), association_id
        )
    )


@router.patch("/associations/me/adoptions/{profile_id}")
def update_adoption_profile(
    profile_id: UUID,
    body: AdoptionProfileUpdate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.actualizar_perfil(
            str(profile_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.post("/associations/me/adoptions/{profile_id}/photos", status_code=201)
async def upload_adoption_profile_photo(
    profile_id: UUID,
    photo: UploadFile = File(...),
    idempotency_key: str = Form(..., min_length=8, max_length=200),
    orden: int | None = Form(None, ge=1, le=8),
    texto_alternativo: str | None = Form(None, max_length=500),
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    try:
        return await adoption_service.subir_foto_perfil(
            str(profile_id),
            association_id,
            user["id"],
            photo,
            order=orden,
            alternative_text=texto_alternativo,
            idempotency_key=idempotency_key,
        )
    except adoption_service.AdoptionServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.post("/associations/me/adoptions/{profile_id}/photos/{photo_id}/review")
def review_adoption_profile_photo(
    profile_id: UUID,
    photo_id: UUID,
    body: AdoptionProfilePhotoReview,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.revisar_foto_perfil(
            str(profile_id),
            str(photo_id),
            association_id,
            user["id"],
            body,
        )
    )


@router.delete("/associations/me/adoptions/{profile_id}/photos/{photo_id}")
def remove_adoption_profile_photo(
    profile_id: UUID,
    photo_id: UUID,
    body: AdoptionProfilePhotoRemove,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: adoption_service.retirar_foto_perfil(
            str(profile_id),
            str(photo_id),
            association_id,
            user["id"],
            body,
        )
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
