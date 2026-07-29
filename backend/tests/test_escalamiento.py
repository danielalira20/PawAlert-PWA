from unittest.mock import MagicMock, patch

import pytest

from app.services import escalamiento


def reporte(modo="semi_automatico", condicion="grave"):
    return {
        "id": "rep-1",
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


def top_candidato():
    return {
        "voluntario_id": "vol-1",
        "usuario_id": "user-vol-1",
        "nombre": "Ana López",
        "score": {"total": 93},
    }


def test_modo_manual_nunca_escala():
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte("manual")]),
        patch.object(escalamiento.matching, "obtener_candidatos") as matching,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 0
    assert resultado["escalados"] == []
    matching.assert_not_called()


def test_semi_automatico_respeta_timeout():
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte()]),
        patch.object(escalamiento, "_minutos_desde", return_value=4.9),
        patch.object(escalamiento.matching, "obtener_candidatos") as matching,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["revisados"] == 1
    assert resultado["escalados"] == []
    matching.assert_not_called()


@pytest.mark.parametrize(("modo", "minutos"), [("semi_automatico", 5), ("automatico", 0)])
def test_escalamiento_asigna_top_uno_y_espera_confirmacion(make_query, modo, minutos):
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte(modo)]),
        patch.object(escalamiento, "_minutos_desde", return_value=minutos),
        patch.object(escalamiento.matching, "obtener_candidatos", return_value={"candidatos": [top_candidato()]}),
        patch.object(escalamiento.coverage_service, "reservar_cobertura") as reservar,
    ):
        resultado = escalamiento.evaluar_escalamientos()

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
    with (
        patch.object(escalamiento, "_reportes_esperando_asignacion", return_value=[reporte()]),
        patch.object(escalamiento, "_minutos_desde", return_value=10),
        patch.object(escalamiento.matching, "obtener_candidatos", return_value={"candidatos": []}),
        patch.object(escalamiento, "supabase") as supabase,
    ):
        resultado = escalamiento.evaluar_escalamientos()

    assert resultado["sin_candidatos"] == 1
    assert resultado["escalados"] == []
    supabase.table.assert_not_called()


@pytest.mark.parametrize(
    ("condicion", "esperado"),
    [("grave", 5), ("herido", 15), ("estable", 30), ("desconocida", 30)],
)
def test_timeout_depende_de_condicion_mas_grave(condicion, esperado):
    assert escalamiento._timeout_por_condicion(reporte()["asociaciones"], condicion) == esperado
