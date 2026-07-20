from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import matching


def candidato(**overrides):
    base = {
        "voluntario_id": "vol-1",
        "usuario_id": "user-1",
        "nombre": "Voluntario Uno",
        "rol": "voluntario_interno",
        "distancia_km": 1,
        "especies": ["perro", "gato"],
        "tamanios": ["pequeno", "mediano"],
        "disponibilidad": {},
        "capacidad_animales": 10,
        "carga_actual": 0,
        "ofrece_casa_hogar": False,
    }
    base.update(overrides)
    return base


def ejecutar_matching(reporte, candidatos, rechazaron=None):
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=candidatos)
    with (
        patch.object(matching, "_obtener_reporte", return_value=reporte),
        patch.object(matching, "_voluntarios_que_rechazaron", return_value=set(rechazaron or [])),
        patch.object(matching, "supabase") as supabase,
    ):
        supabase.rpc.return_value = rpc
        resultado = matching.obtener_candidatos(reporte["id"])
    supabase.rpc.assert_called_once_with("candidatos_para_reporte", {"p_reporte_id": reporte["id"]})
    return resultado


def test_matching_exige_todas_las_especies(reporte_multi_animal):
    completo = candidato(usuario_id="completo", especies=["perro", "gato"])
    parcial = candidato(usuario_id="parcial", especies=["perro"])

    resultado = ejecutar_matching(reporte_multi_animal, [parcial, completo])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["completo"]


def test_matching_suma_cantidad_y_excluye_capacidad_insuficiente(reporte_multi_animal):
    # El caso tiene cuatro animales (1 perro + grupo de 3 gatos), no dos filas.
    insuficiente = candidato(usuario_id="sin-espacio", capacidad_animales=3, carga_actual=0)
    suficiente = candidato(usuario_id="con-espacio", capacidad_animales=6, carga_actual=2)

    resultado = ejecutar_matching(reporte_multi_animal, [insuficiente, suficiente])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["con-espacio"]


@pytest.mark.parametrize("rol", ["voluntario_interno", "voluntario_externo"])
def test_matching_limite_casa_hogar_aplica_a_todos_los_roles(reporte_multi_animal, rol):
    casa_hogar = candidato(rol=rol, ofrece_casa_hogar=True, capacidad_animales=10)

    resultado = ejecutar_matching(reporte_multi_animal, [casa_hogar])

    assert resultado["candidatos"] == []


def test_matching_no_aplica_limite_si_no_ofrece_casa_hogar(reporte_multi_animal):
    candidato_sin_alojamiento = candidato(ofrece_casa_hogar=False, capacidad_animales=4)

    resultado = ejecutar_matching(reporte_multi_animal, [candidato_sin_alojamiento])

    assert len(resultado["candidatos"]) == 1


def test_matching_no_repite_voluntario_que_ya_rechazo(reporte_multi_animal):
    rechazado = candidato(usuario_id="user-rechazo")

    resultado = ejecutar_matching(reporte_multi_animal, [rechazado], rechazaron={"user-rechazo"})

    assert resultado["candidatos"] == []


def test_matching_ordena_por_score_y_limita_top_tres(reporte_multi_animal):
    candidatos = [
        candidato(voluntario_id=f"vol-{i}", usuario_id=f"user-{i}", nombre=f"Vol {i}", distancia_km=i)
        for i in (4, 1, 3, 0, 2)
    ]

    resultado = ejecutar_matching(reporte_multi_animal, candidatos)

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["user-0", "user-1", "user-2"]
    assert all(c["score"]["total"] == sum(
        c["score"][k] for k in ("proximidad", "compatibilidad", "disponibilidad", "carga")
    ) for c in resultado["candidatos"])


@pytest.mark.parametrize(
    ("distancia", "esperado"),
    [(0, 100), (5, 50), (10, 0), (12, 0)],
)
def test_score_proximidad(distancia, esperado):
    assert matching._score_proximidad(distancia) == esperado


def test_score_compatibilidad_es_binario_por_tamanio(reporte_multi_animal):
    assert matching._score_compatibilidad(reporte_multi_animal, candidato(tamanios=["mediano"])) == 100
    assert matching._score_compatibilidad(reporte_multi_animal, candidato(tamanios=["grande"])) == 0


@pytest.mark.parametrize(
    ("capacidad", "carga", "esperado"),
    [(10, 0, 100), (10, 5, 50), (10, 10, 0), (0, 0, 0)],
)
def test_score_carga(capacidad, carga, esperado):
    assert matching._score_carga(capacidad, carga) == esperado


def test_score_disponibilidad_usa_horario_de_mexico():
    class FechaFija(datetime):
        @classmethod
        def now(cls, tz=None):
            # Lunes a las 10:30 en la zona solicitada por la función.
            return cls(2026, 7, 20, 10, 30, tzinfo=tz)

    disponibilidad = {"dias": ["lun"], "horarios": [{"de": "09:00", "a": "18:00"}]}
    fuera_de_horario = {"dias": ["lun"], "horarios": [{"de": "11:00", "a": "18:00"}]}

    with patch.object(matching, "datetime", FechaFija):
        assert matching._score_disponibilidad(disponibilidad) == 100
        assert matching._score_disponibilidad(fuera_de_horario) == 0


def test_score_total_respeta_pesos(reporte_multi_animal):
    class FechaFija(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 7, 20, 10, 30, tzinfo=tz)

    perfecto = candidato(
        distancia_km=0,
        capacidad_animales=10,
        carga_actual=0,
        disponibilidad={"dias": ["lun"], "horarios": [{"de": "09:00", "a": "18:00"}]},
    )
    with patch.object(matching, "datetime", FechaFija):
        resultado = ejecutar_matching(reporte_multi_animal, [perfecto])

    assert resultado["candidatos"][0]["score"] == {
        "total": 100,
        "proximidad": 40,
        "compatibilidad": 25,
        "disponibilidad": 20,
        "carga": 15,
    }
