import pytest
from pydantic import ValidationError

from app.models.report import SeguimientoRetiroAnimalRequest


def test_seguimiento_retiro_acepta_accion_documentada() -> None:
    solicitud = SeguimientoRetiroAnimalRequest(
        accion="contacto_oficial_realizado",
        idempotency_key=" seguimiento-123 ",
        folio="PA-2026-01",
    )

    assert solicitud.idempotency_key == "seguimiento-123"
    assert solicitud.folio == "PA-2026-01"


def test_retiro_con_indicaciones_exige_nombre_del_servicio() -> None:
    with pytest.raises(ValidationError, match="nombre_servicio"):
        SeguimientoRetiroAnimalRequest(
            accion="retiro_gestionado_con_indicaciones",
            idempotency_key="seguimiento-123",
            nombre_servicio="   ",
        )


def test_seguimiento_retiro_rechaza_clave_vacia() -> None:
    with pytest.raises(ValidationError, match="idempotency_key"):
        SeguimientoRetiroAnimalRequest(
            accion="sin_comunicacion",
            idempotency_key="        ",
        )
