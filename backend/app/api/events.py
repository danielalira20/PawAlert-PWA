from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile

from app.db.supabase import supabase
from app.models.event import (
    EventAction,
    EventAssociationView,
    EventCancel,
    EventDraftCreate,
    EventImageOperationResponse,
    EventMapItem,
    EventOperationResponse,
    EventPause,
    EventPublicDetail,
    EventPublicPage,
    EventSavedOperationResponse,
    EventSavedView,
    EventState,
    EventType,
    EventUpdate,
)
from app.services import event_service


router = APIRouter()


def _authenticated_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        auth = supabase.auth.get_user(authorization.removeprefix("Bearer "))
        result = (
            supabase.table("usuarios")
            .select("id, asociacion_id, roles(nombre)")
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
    row = result.data[0]
    roles = row.get("roles") or {}
    if isinstance(roles, list):
        roles = roles[0] if roles else {}
    return {
        "id": row["id"],
        "asociacion_id": row.get("asociacion_id"),
        "rol": roles.get("nombre"),
    }


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
    return str(association_id)


def _call(operation):
    try:
        return operation()
    except event_service.EventServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


def _require_aware(value: datetime | None, field: str) -> None:
    if value is not None and value.utcoffset() is None:
        raise HTTPException(
            status_code=422,
            detail=f"El filtro {field} debe incluir zona horaria",
        )


@router.get("/events", response_model=EventPublicPage)
def get_public_events(
    tipo: EventType | None = Query(None),
    asociacion_id: UUID | None = Query(None),
    municipio: str | None = Query(None, min_length=1, max_length=120),
    especie: str | None = Query(None, min_length=1, max_length=80),
    gratuito: bool | None = Query(None),
    desde: datetime | None = Query(None),
    hasta: datetime | None = Query(None),
    pagina: int = Query(1, ge=1),
    limite: int = Query(20, ge=1, le=50),
):
    _require_aware(desde, "desde")
    _require_aware(hasta, "hasta")
    if desde is not None and hasta is not None and desde > hasta:
        raise HTTPException(
            status_code=422,
            detail="El filtro desde debe ser anterior o igual a hasta",
        )
    return _call(
        lambda: event_service.listar_eventos_publicos(
            tipo=tipo,
            asociacion_id=str(asociacion_id) if asociacion_id else None,
            municipio=municipio,
            especie=especie,
            gratuito=gratuito,
            desde=desde,
            hasta=hasta,
            pagina=pagina,
            limite=limite,
        )
    )


@router.get("/events/map", response_model=list[EventMapItem])
def get_public_events_map(
    tipo: EventType | None = Query(None),
    municipio: str | None = Query(None, min_length=1, max_length=120),
    latitud_min: float | None = Query(None, ge=-90, le=90),
    latitud_max: float | None = Query(None, ge=-90, le=90),
    longitud_min: float | None = Query(None, ge=-180, le=180),
    longitud_max: float | None = Query(None, ge=-180, le=180),
    limite: int = Query(250, ge=1, le=500),
):
    if (
        latitud_min is not None
        and latitud_max is not None
        and latitud_min > latitud_max
    ):
        raise HTTPException(
            status_code=422,
            detail="latitud_min no puede ser mayor que latitud_max",
        )
    if (
        longitud_min is not None
        and longitud_max is not None
        and longitud_min > longitud_max
    ):
        raise HTTPException(
            status_code=422,
            detail="longitud_min no puede ser mayor que longitud_max",
        )
    return _call(
        lambda: event_service.listar_eventos_mapa(
            tipo=tipo,
            municipio=municipio,
            latitud_min=latitud_min,
            latitud_max=latitud_max,
            longitud_min=longitud_min,
            longitud_max=longitud_max,
            limite=limite,
        )
    )


@router.get("/events/{event_id}", response_model=EventPublicDetail)
def get_public_event(event_id: UUID):
    return _call(lambda: event_service.obtener_evento_publico(str(event_id)))


@router.get(
    "/associations/me/events",
    response_model=list[EventAssociationView],
)
def get_association_events(
    estado: EventState | None = Query(None),
    limite: int = Query(100, ge=1, le=250),
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.listar_eventos_asociacion(
            association_id,
            estado=estado,
            limite=limite,
        )
    )


@router.post(
    "/associations/me/events",
    response_model=EventOperationResponse,
    status_code=201,
)
def create_association_event(
    body: EventDraftCreate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.crear_borrador(
            association_id,
            str(user["id"]),
            body,
        )
    )


@router.patch(
    "/associations/me/events/{event_id}",
    response_model=EventOperationResponse,
)
def update_association_event(
    event_id: UUID,
    body: EventUpdate,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.actualizar_evento(
            str(event_id), association_id, str(user["id"]), body
        )
    )


@router.put(
    "/associations/me/events/{event_id}/image",
    response_model=EventImageOperationResponse,
)
async def replace_association_event_image(
    event_id: UUID,
    image: UploadFile = File(...),
    alternative_text: str = Form(..., min_length=1, max_length=500),
    idempotency_key: str = Form(..., min_length=8, max_length=200),
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    try:
        return await event_service.subir_imagen_evento(
            str(event_id),
            association_id,
            str(user["id"]),
            image,
            alternative_text=alternative_text,
            idempotency_key=idempotency_key,
        )
    except event_service.EventServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
        ) from error


@router.delete(
    "/associations/me/events/{event_id}/image",
    response_model=EventImageOperationResponse,
)
def remove_association_event_image(
    event_id: UUID,
    body: EventAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.retirar_imagen_evento(
            str(event_id), association_id, str(user["id"]), body
        )
    )


@router.post(
    "/associations/me/events/{event_id}/publish",
    response_model=EventOperationResponse,
)
def publish_association_event(
    event_id: UUID,
    body: EventAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.publicar_evento(
            str(event_id), association_id, str(user["id"]), body
        )
    )


@router.post(
    "/associations/me/events/{event_id}/pause",
    response_model=EventOperationResponse,
)
def pause_association_event(
    event_id: UUID,
    body: EventPause,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.pausar_evento(
            str(event_id), association_id, str(user["id"]), body
        )
    )


@router.post(
    "/associations/me/events/{event_id}/cancel",
    response_model=EventOperationResponse,
)
def cancel_association_event(
    event_id: UUID,
    body: EventCancel,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    association_id = _association_context(user)
    return _call(
        lambda: event_service.cancelar_evento(
            str(event_id), association_id, str(user["id"]), body
        )
    )


@router.post(
    "/events/{event_id}/save",
    response_model=EventSavedOperationResponse,
    status_code=201,
)
def save_event(
    event_id: UUID,
    body: EventAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: event_service.guardar_evento(
            str(event_id), str(user["id"]), body
        )
    )


@router.delete(
    "/events/{event_id}/save",
    response_model=EventSavedOperationResponse,
)
def unsave_event(
    event_id: UUID,
    body: EventAction,
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: event_service.dejar_de_guardar_evento(
            str(event_id), str(user["id"]), body
        )
    )


@router.get("/me/saved-events", response_model=list[EventSavedView])
def get_saved_events(
    limite: int = Query(100, ge=1, le=250),
    authorization: Optional[str] = Header(None),
):
    user = _authenticated_user(authorization)
    return _call(
        lambda: event_service.listar_eventos_guardados(
            str(user["id"]), limite=limite
        )
    )
