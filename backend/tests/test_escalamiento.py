from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models.dispatch import (
    DispatchAssignment,
    DispatchExcludedItem,
    DispatchExclusionReason,
    DispatchExclusionScope,
    DispatchOptimizationResult,
    DispatchPreparationErrorCode,
    DispatchPreparationStatus,
)
from app.services import escalamiento


def reporte(
    modo="semi_automatico",
    condicion="grave",
    reporte_id="rep-1",
    asociacion_id="aso-1",
):
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


def preparacion_lista(request=None, excluded_items=None):
    return SimpleNamespace(
        status=DispatchPreparationStatus.ready,
        request=request or object(),
        error_code=None,
        excluded_items=excluded_items or [],
    )


def preparacion_no_disponible(error_code, excluded_items=None):
    return SimpleNamespace(
        status=DispatchPreparationStatus.unavailable,
        request=None,
        error_code=error_code,
        excluded_items=excluded_items or [],
    )


def test_modo_manual_nunca_escala():
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte("manual")],
        ),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
        ) as preparar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 0
    assert resultado["escalados"] == []
    preparar.assert_not_called()


def test_semi_automatico_respeta_timeout():
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte()],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=4.9),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
        ) as preparar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 1
    assert resultado["escalados"] == []
    preparar.assert_not_called()


@pytest.mark.parametrize(
    ("modo", "minutos"),
    [("semi_automatico", 5), ("automatico", 0)],
)
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
    voluntarios_info = {
        "vol-1": {"usuario_id": "user-vol-1", "nombre": "Ana López"}
    }
    request = object()

    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte(modo)],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=minutos),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_lista(request),
        ) as preparar,
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
            return_value=lote,
        ) as optimizar,
        patch.object(
            escalamiento,
            "_cargar_voluntarios_info",
            return_value=voluntarios_info,
        ) as cargar_info,
        patch.object(
            escalamiento.coverage_service,
            "reservar_cobertura",
        ) as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    preparar.assert_called_once_with(["rep-1"])
    optimizar.assert_called_once_with(request)
    cargar_info.assert_called_once_with(["vol-1"])
    reservar.assert_called_once_with(
        reporte_id="rep-1",
        usuario_asignado_id="user-vol-1",
        voluntario_id="vol-1",
        asociacion_id="aso-1",
        actor_id="user-vol-1",
        origen="escalamiento_automatico",
    )
    assert resultado["escalados"] == [
        {"reporte_id": "rep-1", "voluntario": "Ana López"}
    ]


def test_preparacion_sin_candidatos_deja_caso_sin_asignar():
    exclusion = DispatchExcludedItem(
        scope=DispatchExclusionScope.report,
        reason=DispatchExclusionReason.no_candidates,
        report_id="rep-1",
    )
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte()],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_no_disponible(
                DispatchPreparationErrorCode.no_candidates,
                [exclusion],
            ),
        ),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
        ) as optimizar,
        patch.object(
            escalamiento.coverage_service,
            "reservar_cobertura",
        ) as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["sin_candidatos"] == 1
    assert resultado["escalados"] == []
    assert resultado["preparacion_error"] == "no_candidates"
    optimizar.assert_not_called()
    reservar.assert_not_called()


def test_fallo_de_rutas_no_activa_optimizador_ni_fallback():
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte()],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_no_disponible(
                DispatchPreparationErrorCode.routing_unavailable
            ),
        ),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
        ) as optimizar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["preparacion_error"] == "routing_unavailable"
    assert resultado["sin_candidatos"] == 0
    optimizar.assert_not_called()


def test_escalamiento_agrupa_varios_reportes_en_un_solo_lote():
    lote = resultado_lote(
        assignments=[
            DispatchAssignment(
                report_id="rep-1",
                volunteer_id="vol-1",
                arrival_seconds=300,
                distance_meters=900,
            ),
            DispatchAssignment(
                report_id="rep-2",
                volunteer_id="vol-2",
                arrival_seconds=400,
                distance_meters=1200,
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
    request = object()

    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=pendientes,
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_lista(request),
        ) as preparar,
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
            return_value=lote,
        ) as optimizar,
        patch.object(
            escalamiento,
            "_cargar_voluntarios_info",
            return_value=voluntarios_info,
        ),
        patch.object(
            escalamiento.coverage_service,
            "reservar_cobertura",
        ) as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    preparar.assert_called_once_with(["rep-1", "rep-2", "rep-3"])
    optimizar.assert_called_once_with(request)
    assert reservar.call_count == 2
    assert resultado["escalados"] == [
        {"reporte_id": "rep-1", "voluntario": "Ana López"},
        {"reporte_id": "rep-2", "voluntario": "Beto Ruiz"},
    ]
    assert resultado["sin_candidatos"] == 1
    assert resultado["revisados"] == 3


def test_conflicto_de_reserva_se_reevalua_en_siguiente_ciclo():
    lote = resultado_lote(
        assignments=[
            DispatchAssignment(
                report_id="rep-1",
                volunteer_id="vol-1",
                arrival_seconds=300,
                distance_meters=900,
            )
        ]
    )
    info = {
        "vol-1": {"usuario_id": "user-vol-1", "nombre": "Ana López"}
    }
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte()],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_lista(),
        ),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
            return_value=lote,
        ),
        patch.object(
            escalamiento,
            "_cargar_voluntarios_info",
            return_value=info,
        ),
        patch.object(
            escalamiento.coverage_service,
            "reservar_cobertura",
            side_effect=HTTPException(status_code=409, detail="conflicto"),
        ),
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["escalados"] == []
    assert resultado["conflictos"] == ["rep-1"]


def test_identidad_faltante_no_reserva_ni_interrumpe_el_cron():
    lote = resultado_lote(
        assignments=[
            DispatchAssignment(
                report_id="rep-1",
                volunteer_id="vol-1",
                arrival_seconds=300,
                distance_meters=900,
            )
        ]
    )
    with (
        patch.object(
            escalamiento,
            "_reportes_esperando_asignacion",
            return_value=[reporte()],
        ),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(
            escalamiento.dispatch_preparation_service,
            "prepare_dispatch_optimization",
            return_value=preparacion_lista(),
        ),
        patch.object(
            escalamiento.dispatch_optimizer,
            "optimize_dispatch",
            return_value=lote,
        ),
        patch.object(
            escalamiento,
            "_cargar_voluntarios_info",
            return_value={},
        ),
        patch.object(
            escalamiento.coverage_service,
            "reservar_cobertura",
        ) as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["omitidos"] == ["rep-1"]
    reservar.assert_not_called()


def test_carga_identidades_en_una_sola_consulta(make_query):
    query = make_query(
        data=[
            {
                "id": "vol-1",
                "usuario_id": "user-1",
                "usuarios": {
                    "nombre": "Ana",
                    "apellido_paterno": "López",
                },
            },
            {
                "id": "vol-2",
                "usuario_id": "user-2",
                "usuarios": {},
            },
        ]
    )
    with patch.object(
        escalamiento.supabase_admin,
        "table",
        return_value=query,
    ) as table:
        resultado = escalamiento._cargar_voluntarios_info(
            ["vol-1", "vol-2", "vol-1"]
        )

    table.assert_called_once_with("voluntarios")
    query.in_.assert_called_once_with("id", ["vol-1", "vol-2"])
    assert resultado == {
        "vol-1": {"usuario_id": "user-1", "nombre": "Ana López"},
        "vol-2": {
            "usuario_id": "user-2",
            "nombre": "Persona voluntaria",
        },
    }


@pytest.mark.parametrize(
    ("condicion", "esperado"),
    [("grave", 5), ("herido", 15), ("estable", 30), ("desconocida", 30)],
)
def test_timeout_depende_de_condicion_mas_grave(condicion, esperado):
    assert (
        escalamiento._timeout_por_condicion(
            reporte()["asociaciones"], condicion
        )
        == esperado
    )
