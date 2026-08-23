from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.models.dispatch import DispatchAssignment, DispatchOptimizationResult
from app.services import escalamiento


def reporte(modo="semi_automatico", condicion="grave", reporte_id="rep-1", asociacion_id="aso-1"):
    return {
        "id": reporte_id,
        "asociacion_asignada_id": asociacion_id,
        "condicion": condicion,
        "candidatos_presentados_at": "2026-07-19T10:00:00+00:00",
        "asociaciones": {
            "modo_asignacion": modo,
            "timeout_grave": 5,
            "timeout_herido": 15,
            "timeout_estable": 30,
        },
    }


def resultado_lote(assignments=None, unassigned=None, source="vroom"):
    return DispatchOptimizationResult(
        assignments=assignments or [],
        unassigned_report_ids=unassigned or [],
        source=source,
        calculated_at=datetime(2026, 7, 19, 10, 10, tzinfo=timezone.utc),
    )


def test_modo_manual_nunca_escala():
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte("manual")]),
        patch.object(escalamiento.dispatch_optimizer, "optimizar_lote_reportes") as optimizar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 0
    assert resultado["escalados"] == []
    optimizar.assert_not_called()


def test_semi_automatico_respeta_timeout():
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte()]),
        patch.object(escalamiento, "_minutos_desde", return_value=4.9),
        patch.object(escalamiento.dispatch_optimizer, "optimizar_lote_reportes") as optimizar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 1
    assert resultado["escalados"] == []
    optimizar.assert_not_called()


@pytest.mark.parametrize(("modo", "minutos"), [("semi_automatico", 5), ("automatico", 0)])
def test_escalamiento_asigna_top_uno_y_espera_confirmacion(modo, minutos):
    lote = resultado_lote(
        assignments=[
            DispatchAssignment(
                report_id="rep-1",
                volunteer_id="vol-1",
                arrival_seconds=300,
                distance_meters=900,
            )
        ],
    )
    voluntarios_info = {"vol-1": {"usuario_id": "user-vol-1", "nombre": "Ana López"}}

    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte(modo)]),
        patch.object(escalamiento, "_minutos_desde", return_value=minutos),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimizar_lote_reportes",
            return_value=(lote, voluntarios_info),
        ) as optimizar,
        patch.object(escalamiento.coverage_service, "reservar_cobertura") as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    optimizar.assert_called_once_with(["rep-1"])
    reservar.assert_called_once_with(
        reporte_id="rep-1",
        usuario_asignado_id="user-vol-1",
        voluntario_id="vol-1",
        asociacion_id="aso-1",
        actor_id="user-vol-1",
        origen="escalamiento_automatico",
    )
    assert resultado["escalados"] == [{"reporte_id": "rep-1", "voluntario": "Ana López"}]


def test_escalamiento_sin_candidatos_deja_caso_sin_asignar():
    lote = resultado_lote(unassigned=["rep-1"])

    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte()]),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimizar_lote_reportes",
            return_value=(lote, {}),
        ),
        patch.object(escalamiento.coverage_service, "reservar_cobertura") as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["sin_candidatos"] == 1
    assert resultado["escalados"] == []
    reservar.assert_not_called()


def test_escalamiento_agrupa_varios_reportes_en_un_solo_lote():
    """Integracion: 3 reportes pendientes en el mismo ciclo -- confirma que
    reservar_cobertura se llama una vez por cada assignment devuelto por el
    optimizador (mockeado), no una vez por reporte pendiente."""
    lote = resultado_lote(
        assignments=[
            DispatchAssignment(
                report_id="rep-1", volunteer_id="vol-1", arrival_seconds=300, distance_meters=900
            ),
            DispatchAssignment(
                report_id="rep-2", volunteer_id="vol-2", arrival_seconds=400, distance_meters=1200
            ),
        ],
        unassigned=["rep-3"],
    )
    voluntarios_info = {
        "vol-1": {"usuario_id": "user-vol-1", "nombre": "Ana López"},
        "vol-2": {"usuario_id": "user-vol-2", "nombre": "Beto Ruiz"},
    }
    pendientes = [
        reporte(reporte_id="rep-1", asociacion_id="aso-1"),
        reporte(reporte_id="rep-2", asociacion_id="aso-2"),
        reporte(reporte_id="rep-3", asociacion_id="aso-3"),
    ]

    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=pendientes),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimizar_lote_reportes",
            return_value=(lote, voluntarios_info),
        ) as optimizar,
        patch.object(escalamiento.coverage_service, "reservar_cobertura") as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    optimizar.assert_called_once_with(["rep-1", "rep-2", "rep-3"])
    assert reservar.call_count == 2
    assert resultado["escalados"] == [
        {"reporte_id": "rep-1", "voluntario": "Ana López"},
        {"reporte_id": "rep-2", "voluntario": "Beto Ruiz"},
    ]
    assert resultado["sin_candidatos"] == 1
    assert resultado["revisados"] == 3


@pytest.mark.parametrize(
    ("condicion", "esperado"),
    [("grave", 5), ("herido", 15), ("estable", 30), ("desconocida", 30)],
)
def test_timeout_depende_de_condicion_mas_grave(condicion, esperado):
    assert escalamiento._timeout_por_condicion(reporte()["asociaciones"], condicion) == esperado
