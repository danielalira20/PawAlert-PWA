from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.event import (
    EventAdminRestore,
    EventAdminSuspend,
    EventCancel,
    EventPause,
    EventReportCreate,
    EventUpdate,
)


def test_actualizacion_conserva_solo_campos_enviados():
    body = EventUpdate(
        datos={"titulo": "  Jornada comunitaria  "},
        idempotency_key="event-update-001",
    )

    assert body.datos.model_dump(mode="json", exclude_unset=True) == {
        "titulo": "Jornada comunitaria"
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"datos": {}, "idempotency_key": "event-update-001"},
        {
            "datos": {
                "inicia_at": "2026-09-02T12:00:00-06:00",
                "termina_at": "2026-09-02T11:00:00-06:00",
            },
            "idempotency_key": "event-update-001",
        },
        {
            "datos": {"es_gratuito": True, "costo_centavos": 5000},
            "idempotency_key": "event-update-001",
        },
        {
            "datos": {"inicia_at": "2026-09-02T12:00:00"},
            "idempotency_key": "event-update-001",
        },
    ],
)
def test_actualizacion_rechaza_payloads_inconsistentes(payload):
    with pytest.raises(ValidationError):
        EventUpdate.model_validate(payload)


def test_fechas_con_zona_y_moneda_se_normalizan():
    body = EventUpdate(
        datos={
            "inicia_at": datetime(2026, 9, 2, 12, tzinfo=timezone.utc),
            "zona_horaria": "America/Mexico_City",
            "moneda": "mxn",
        },
        idempotency_key="event-update-002",
    )

    assert body.datos.moneda == "MXN"
    assert body.datos.zona_horaria == "America/Mexico_City"


def test_actualizacion_parcial_de_cupo_delega_consistencia_final_a_la_rpc():
    body = EventUpdate(
        datos={"cupo_estado": "agotado"},
        idempotency_key="event-update-003",
    )

    assert body.datos.model_dump(mode="json", exclude_unset=True) == {
        "cupo_estado": "agotado"
    }


@pytest.mark.parametrize(
    ("model", "field"),
    [(EventPause, "motivo"), (EventCancel, "motivo_publico")],
)
def test_motivos_vacios_no_superan_validacion(model, field):
    with pytest.raises(ValidationError):
        model.model_validate(
            {field: "   ", "idempotency_key": "event-action-001"}
        )


def test_reporte_evento_normaliza_descripcion():
    body = EventReportCreate(
        motivo="servicio_riesgoso",
        descripcion="  Se ofrecen servicios sin medidas de seguridad.  ",
        idempotency_key="event-report-001",
    )

    assert body.descripcion == "Se ofrecen servicios sin medidas de seguridad."


@pytest.mark.parametrize(
    ("model", "field"),
    [
        (EventReportCreate, "descripcion"),
        (EventAdminSuspend, "motivo"),
        (EventAdminRestore, "resolucion"),
    ],
)
def test_moderacion_rechaza_justificacion_corta(model, field):
    payload = {
        field: "muy corto",
        "idempotency_key": "event-moderation-001",
    }
    if model is EventReportCreate:
        payload["motivo"] = "otro"

    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_reporte_evento_rechaza_campos_no_contratados():
    with pytest.raises(ValidationError):
        EventReportCreate.model_validate(
            {
                "motivo": "otro",
                "descripcion": "Información suficiente del incidente.",
                "idempotency_key": "event-report-002",
                "evidencia_storage_path": "eventos/privado.jpg",
            }
        )
