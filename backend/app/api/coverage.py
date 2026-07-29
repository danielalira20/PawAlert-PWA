"""Endpoints del flujo de cobertura y ofrecimientos externos."""

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.api.asignaciones import _obtener_usuario_autenticado
from app.services import coverage_service


router = APIRouter()


class ResponderPropuestaBody(BaseModel):
    acepta: bool
    motivo: str | None = None


def _solo_externo(usuario: dict) -> None:
    if usuario.get("rol") != "voluntario_externo":
        raise HTTPException(
            status_code=403,
            detail="Esta sección es exclusiva para voluntariado externo verificado",
        )


@router.get("/cercanos")
def listar_casos_cercanos(authorization: Optional[str] = Header(None)):
    usuario = _obtener_usuario_autenticado(authorization)
    _solo_externo(usuario)
    return {
        "casos": coverage_service.obtener_casos_cercanos(usuario["id"]),
        "privacidad": (
            "La ubicación es aproximada. La dirección exacta se comparte "
            "únicamente después de confirmar una propuesta."
        ),
    }


@router.post("/{reporte_id}/ofrecimientos", status_code=201)
def ofrecer_ayuda(
    reporte_id: str,
    authorization: Optional[str] = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _solo_externo(usuario)
    return coverage_service.crear_ofrecimiento(usuario["id"], reporte_id)


@router.delete("/{reporte_id}/ofrecimientos")
def retirar_ayuda(
    reporte_id: str,
    authorization: Optional[str] = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    _solo_externo(usuario)
    return coverage_service.retirar_ofrecimiento(usuario["id"], reporte_id)


@router.post("/{reporte_id}/propuesta/responder")
def responder_propuesta(
    reporte_id: str,
    body: ResponderPropuestaBody,
    authorization: Optional[str] = Header(None),
):
    usuario = _obtener_usuario_autenticado(authorization)
    if usuario.get("rol") not in ("voluntario_externo", "voluntario_interno", "staff"):
        raise HTTPException(status_code=403, detail="No puedes responder esta propuesta")
    return coverage_service.responder_propuesta(
        usuario["id"], reporte_id, body.acepta, body.motivo
    )
