from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models.dispatch import (
    DispatchAssignment,
    DispatchOptimizationResult,
    DispatchPreparationErrorCode,
    DispatchPreparationResult,
    DispatchPreparationStatus,
)
from app.services import escalamiento


def reporte(modo="semi_automatico", condicion="grave", report_id="rep-1"):
    return {
        "id": report_id,
        "asociacion_asignada_id": "aso-1",
        "condicion": condicion,
        "candidatos_presentados_at": "2026-07-19T10:00:00+00:00",
        "asociaciones": {
            "modo_asignacion": modo,
            "timeout_grave": 5,
            "timeout_herido": 15,
            "timeout_estable": 30,
        },
    }


def prepared(role="voluntario_interno"):
    request = SimpleNamespace(
        volunteers=[SimpleNamespace(volunteer_id="vol-1", role=role)]
    )
    return SimpleNamespace(
        status=DispatchPreparationStatus.ready,
        request=request,
    )


def optimized(source="vroom"):
    return DispatchOptimizationResult(
        assignments=[
            DispatchAssignment(
                report_id="rep-1",
                volunteer_id="vol-1",
                arrival_seconds=300,
                distance_meters=2000,
            )
        ],
        source=source,
        calculated_at=escalamiento.datetime.now(escalamiento.timezone.utc),
    )


def assignment_info():
    return {"vol-1": {"usuario_id": "user-vol-1", "nombre": "Ana Lopez"}}


def test_modo_manual_nunca_escala():
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte("manual")],
    ), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
    ) as prepare:
        result = escalamiento.evaluar_escalamientos()

    assert result["revisados"] == 0
    assert result["escalados"] == []
    assert result["optimizacion"]["status"] == "not_required"
    prepare.assert_not_called()


def test_semi_automatico_respeta_timeout():
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte()],
    ), patch.object(escalamiento, "_minutos_desde", return_value=4.9), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
    ) as prepare:
        result = escalamiento.evaluar_escalamientos()

    assert result["revisados"] == 1
    assert result["escalados"] == []
    prepare.assert_not_called()


@pytest.mark.parametrize(
    ("modo", "minutos"),
    [("semi_automatico", 5), ("automatico", 0)],
)
def test_escalamiento_reserva_resultado_optimizado(modo, minutos):
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte(modo)],
    ), patch.object(escalamiento, "_minutos_desde", return_value=minutos), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
        return_value=prepared(),
    ), patch.object(
        escalamiento.dispatch_optimizer,
        "optimize_dispatch",
        return_value=optimized(),
    ), patch.object(
        escalamiento,
        "_volunteer_assignment_info",
        return_value=assignment_info(),
    ), patch.object(
        escalamiento.coverage_service,
        "reservar_cobertura",
    ) as reserve:
        result = escalamiento.evaluar_escalamientos()

    reserve.assert_called_once_with(
        reporte_id="rep-1",
        usuario_asignado_id="user-vol-1",
        voluntario_id="vol-1",
        asociacion_id="aso-1",
        actor_id="user-vol-1",
        origen="escalamiento_automatico",
    )
    assert result["escalados"] == [
        {"reporte_id": "rep-1", "voluntario": "Ana Lopez"}
    ]
    assert result["optimizacion"] == {
        "status": "complete",
        "source": "vroom",
        "error_code": None,
    }


def test_externo_se_reserva_como_ofrecimiento():
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte("automatico")],
    ), patch.object(escalamiento, "_minutos_desde", return_value=0), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
        return_value=prepared("voluntario_externo"),
    ), patch.object(
        escalamiento.dispatch_optimizer,
        "optimize_dispatch",
        return_value=optimized(),
    ), patch.object(
        escalamiento,
        "_volunteer_assignment_info",
        return_value=assignment_info(),
    ), patch.object(
        escalamiento.coverage_service,
        "reservar_cobertura",
    ) as reserve:
        escalamiento.evaluar_escalamientos()

    assert reserve.call_args.kwargs["origen"] == "ofrecimiento_externo"


def test_conflicto_de_reserva_no_detiene_el_cron():
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte("automatico")],
    ), patch.object(escalamiento, "_minutos_desde", return_value=0), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
        return_value=prepared(),
    ), patch.object(
        escalamiento.dispatch_optimizer,
        "optimize_dispatch",
        return_value=optimized(),
    ), patch.object(
        escalamiento,
        "_volunteer_assignment_info",
        return_value=assignment_info(),
    ), patch.object(
        escalamiento.coverage_service,
        "reservar_cobertura",
        side_effect=HTTPException(status_code=409, detail="ocupado"),
    ):
        result = escalamiento.evaluar_escalamientos()

    assert result["conflictos"] == 1
    assert result["escalados"] == []


def test_preparacion_no_disponible_conserva_flujo_manual():
    unavailable = DispatchPreparationResult(
        status=DispatchPreparationStatus.unavailable,
        error_code=DispatchPreparationErrorCode.no_candidates,
        prepared_at=escalamiento.datetime.now(escalamiento.timezone.utc),
    )
    with patch.object(
        escalamiento,
        "_reportes_esperando_asignacion",
        return_value=[reporte("automatico")],
    ), patch.object(escalamiento, "_minutos_desde", return_value=0), patch.object(
        escalamiento.dispatch_preparation_service,
        "prepare_dispatch_optimization",
        return_value=unavailable,
    ), patch.object(
        escalamiento.coverage_service,
        "reservar_cobertura",
    ) as reserve:
        result = escalamiento.evaluar_escalamientos()

    reserve.assert_not_called()
    assert result["sin_candidatos"] == 1
    assert result["optimizacion"]["error_code"] == "no_candidates"


@pytest.mark.parametrize(
    ("condicion", "expected"),
    [("grave", 5), ("herido", 15), ("estable", 30), ("desconocida", 30)],
)
def test_timeout_depende_de_condicion_mas_grave(condicion, expected):
    assert (
        escalamiento._timeout_por_condicion(
            reporte()["asociaciones"], condicion
        )
        == expected
    )
