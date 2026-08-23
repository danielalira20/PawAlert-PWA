from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import matching


@pytest.fixture(autouse=True)
def permitir_candidatos_sin_restriccion():
    with patch.object(
        matching,
        "usuarios_bloqueados_nuevas_asignaciones",
        return_value=set(),
    ):
        yield


def candidato(**overrides):
    base = {
        "voluntario_id": "vol-1",
        "usuario_id": "user-1",
        "nombre": "Voluntario Uno",
        "rol": "voluntario_interno",
        "distancia_km": 1,
        "radio_max_km": 30,
        "disponibilidad": {},
        "tiempo_reaccion": "una_hora",
        "disponibilidad_urgencias": "si",
        "max_casos_simultaneos": 2,
        "carga_actual": 0,
        "medios_transporte": ["automovil"],
        "vehiculo_apto_traslado": True,
        "tamanios_traslado": ["pequeno", "mediano"],
        "especies_manejo": ["perro", "gato"],
        "otras_especies_manejo": [],
        "tamanios_manejo": ["pequeno", "mediano"],
        "primeros_auxilios_nivel": "basico",
        "experiencias_campo": ["docil_estable", "lesion_movilidad_reducida"],
        "trayectoria_tipos": ["rescate_independiente"],
        "experiencia_anios": "entre_1_3",
        "equipamiento": [
            "transportadora_chica",
            "transportadora_grande",
            "jaula_contencion",
            "correas_arneses",
            "proteccion_vehiculo",
        ],
        "restricciones_fisicas": ["ninguna"],
    }
    base.update(overrides)
    return base


def ejecutar_matching(reporte, candidatos, rechazaron=None):
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=candidatos)
    with (
        patch.object(matching, "_obtener_reporte", return_value=reporte),
        patch.object(
            matching,
            "_voluntarios_que_rechazaron",
            return_value=set(rechazaron or []),
        ),
        patch.object(
            matching,
            "enrich_candidates_with_route_estimates",
            side_effect=lambda _reporte_id, items: items,
        ),
        patch.object(matching, "supabase") as supabase,
    ):
        supabase.rpc.return_value = rpc
        resultado = matching.obtener_candidatos(reporte["id"])
    supabase.rpc.assert_called_once_with(
        "candidatos_para_reporte",
        {"p_reporte_id": reporte["id"]},
    )
    return resultado


def test_matching_envia_solo_el_top_tres_a_osrm(reporte_multi_animal):
    candidatos = [
        candidato(
            voluntario_id=f"vol-{i}",
            usuario_id=f"user-{i}",
            nombre=f"Vol {i}",
            distancia_km=i,
        )
        for i in (4, 1, 3, 0, 2)
    ]
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=candidatos)

    with (
        patch.object(
            matching,
            "_obtener_reporte",
            return_value=reporte_multi_animal,
        ),
        patch.object(matching, "_voluntarios_que_rechazaron", return_value=set()),
        patch.object(matching, "supabase") as supabase,
        patch.object(
            matching,
            "enrich_candidates_with_route_estimates",
            side_effect=lambda _reporte_id, items: items,
        ) as enrich,
    ):
        supabase.rpc.return_value = rpc
        matching.obtener_candidatos(reporte_multi_animal["id"])

    routed_candidates = enrich.call_args.args[1]
    assert [item["usuario_id"] for item in routed_candidates] == [
        "user-0",
        "user-1",
        "user-2",
    ]


def test_matching_exige_todas_las_especies(reporte_multi_animal):
    completo = candidato(usuario_id="completo")
    parcial = candidato(usuario_id="parcial", especies_manejo=["perro"])

    resultado = ejecutar_matching(reporte_multi_animal, [parcial, completo])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["completo"]


def test_matching_rechaza_reporte_sin_validacion_aprobada(make_query):
    supabase = MagicMock()
    supabase.table.return_value = make_query(data={
        "id": "rep-1",
        "estado_validacion_reporte": "revision_manual",
        "estado_reporte": "pendiente",
        "estado_cobertura": None,
        "asociacion_asignada_id": None,
        "animal": [],
    })

    with (
        patch.object(matching, "supabase", supabase),
        pytest.raises(HTTPException) as error,
    ):
        matching._obtener_reporte("rep-1")

    assert error.value.status_code == 409


def test_matching_exige_todos_los_tamanios(reporte_multi_animal):
    completo = candidato(usuario_id="completo")
    parcial = candidato(usuario_id="parcial", tamanios_manejo=["pequeno"])

    resultado = ejecutar_matching(reporte_multi_animal, [parcial, completo])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["completo"]


def test_matching_excluye_quien_no_atiende_urgencias(reporte_multi_animal):
    no_urgencias = candidato(disponibilidad_urgencias="no")

    resultado = ejecutar_matching(reporte_multi_animal, [no_urgencias])

    assert resultado["candidatos"] == []


def test_matching_excluye_carga_al_maximo(reporte_multi_animal):
    ocupado = candidato(
        usuario_id="ocupado",
        max_casos_simultaneos=2,
        carga_actual=2,
    )
    disponible = candidato(
        usuario_id="disponible",
        max_casos_simultaneos=2,
        carga_actual=1,
    )

    resultado = ejecutar_matching(reporte_multi_animal, [ocupado, disponible])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["disponible"]
    assert resultado["candidatos"][0]["capacidad_resumen"] == "1 de 2 casos activos"


def test_matching_excluye_voluntario_bloqueado_por_trust_score(
    reporte_multi_animal,
):
    bloqueado = candidato(usuario_id="bloqueado")
    disponible = candidato(usuario_id="disponible")

    with patch.object(
        matching,
        "usuarios_bloqueados_nuevas_asignaciones",
        return_value={"bloqueado"},
    ):
        resultado = ejecutar_matching(
            reporte_multi_animal,
            [bloqueado, disponible],
        )

    assert [fila["usuario_id"] for fila in resultado["candidatos"]] == [
        "disponible"
    ]


def test_matching_respeta_radio_declarado(reporte_multi_animal):
    fuera = candidato(usuario_id="fuera", distancia_km=6, radio_max_km=5)
    dentro = candidato(usuario_id="dentro", distancia_km=4, radio_max_km=5)

    resultado = ejecutar_matching(reporte_multi_animal, [fuera, dentro])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["dentro"]


def test_matching_no_repite_voluntario_que_ya_rechazo(reporte_multi_animal):
    rechazado = candidato(usuario_id="user-rechazo")

    resultado = ejecutar_matching(
        reporte_multi_animal,
        [rechazado],
        rechazaron={"user-rechazo"},
    )

    assert resultado["candidatos"] == []


def test_matching_nunca_incluye_voluntario_externo_en_top_tres(reporte_multi_animal):
    interno = candidato(usuario_id="interno")
    externo = candidato(
        voluntario_id="vol-externo",
        usuario_id="externo",
        rol="voluntario_externo",
        distancia_km=0,
    )

    resultado = ejecutar_matching(reporte_multi_animal, [externo, interno])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["interno"]


def test_matching_ordena_por_score_y_limita_top_tres(reporte_multi_animal):
    candidatos = [
        candidato(
            voluntario_id=f"vol-{i}",
            usuario_id=f"user-{i}",
            nombre=f"Vol {i}",
            distancia_km=i,
        )
        for i in (4, 1, 3, 0, 2)
    ]

    resultado = ejecutar_matching(reporte_multi_animal, candidatos)

    assert [
        c["usuario_id"] for c in resultado["candidatos"]
    ] == ["user-0", "user-1", "user-2"]
    assert all(
        c["score"]["total"]
        == sum(
            c["score"][clave]
            for clave in (
                "proximidad",
                "disponibilidad",
                "experiencia",
                "movilidad",
                "carga",
            )
        )
        for c in resultado["candidatos"]
    )


@pytest.mark.parametrize(
    ("distancia", "radio", "esperado"),
    [(0, 10, 100), (5, 10, 50), (10, 10, 0), (15, 30, 50)],
)
def test_score_proximidad(distancia, radio, esperado):
    assert matching._score_proximidad(distancia, radio) == esperado


@pytest.mark.parametrize(
    ("capacidad", "carga", "esperado"),
    [(3, 0, 100), (2, 1, 50), (2, 2, 0), (0, 0, 0)],
)
def test_score_carga(capacidad, carga, esperado):
    assert matching._score_carga(capacidad, carga) == esperado


def test_score_disponibilidad_usa_franjas_de_mexico():
    class FechaFija(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 7, 20, 10, 30, tzinfo=tz)

    en_horario = {"dias": ["lun"], "franjas": ["matutino"]}
    fuera_de_horario = {"dias": ["lun"], "franjas": ["vespertino"]}

    with patch.object(matching, "datetime", FechaFija):
        assert matching._score_disponibilidad(
            en_horario, "inmediata", "si"
        ) == 100
        assert matching._score_disponibilidad(
            fuera_de_horario, "inmediata", "si"
        ) == 35


def test_score_total_respeta_pesos(reporte_multi_animal):
    class FechaFija(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 7, 20, 10, 30, tzinfo=tz)

    perfecto = candidato(
        distancia_km=0,
        radio_max_km=30,
        max_casos_simultaneos=1,
        carga_actual=0,
        disponibilidad={"dias": ["lun"], "franjas": ["matutino"]},
        tiempo_reaccion="inmediata",
        primeros_auxilios_nivel="formal",
        experiencias_campo=["docil_estable", "lesion_movilidad_reducida"],
        experiencia_anios="mas_3",
        trayectoria_tipos=["rescate_independiente"],
    )
    with patch.object(matching, "datetime", FechaFija):
        resultado = ejecutar_matching(reporte_multi_animal, [perfecto])

    assert resultado["candidatos"][0]["score"] == {
        "total": 100,
        "proximidad": 30,
        "disponibilidad": 25,
        "experiencia": 20,
        "movilidad": 15,
        "carga": 10,
    }
