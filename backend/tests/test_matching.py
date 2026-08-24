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


def ejecutar_matching(reporte, candidatos, rechazaron=None, propuestas_activas=None):
    """propuestas_activas simula lo que Postgres devolvería para
    `.eq("estado", "activa").gt("vence_at", ahora)` -- por defecto, nada
    (ninguna propuesta activa y sin vencer bloqueando a nadie)."""
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=candidatos)
    propuestas_query = MagicMock()
    propuestas_query.select.return_value = propuestas_query
    propuestas_query.eq.return_value = propuestas_query
    propuestas_query.gt.return_value = propuestas_query
    propuestas_query.execute.return_value = SimpleNamespace(
        data=propuestas_activas or []
    )
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
        patch.object(matching, "supabase_admin") as supabase_admin,
    ):
        supabase.rpc.return_value = rpc
        supabase_admin.table.side_effect = (
            lambda nombre: propuestas_query
            if nombre == "propuestas_asignacion"
            else MagicMock()
        )
        resultado = matching.obtener_candidatos(reporte["id"])
    supabase.rpc.assert_called_once_with(
        "candidatos_para_reporte",
        {"p_reporte_id": reporte["id"]},
    )
    supabase.table.assert_not_called()
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


def test_matching_por_lotes_omite_rutas_individuales(reporte_multi_animal):
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=[candidato()])

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
        ) as enrich,
    ):
        supabase.rpc.return_value = rpc
        result = matching.obtener_candidatos(
            reporte_multi_animal["id"],
            incluir_rutas=False,
        )

    assert len(result["candidatos"]) == 1
    enrich.assert_not_called()


def test_matching_exige_todas_las_especies(reporte_multi_animal):
    completo = candidato(usuario_id="completo")
    parcial = candidato(usuario_id="parcial", especies_manejo=["perro"])

    resultado = ejecutar_matching(reporte_multi_animal, [parcial, completo])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["completo"]


def test_matching_especie_manejo_vacia_usa_fallback_a_especies_base(
    reporte_multi_animal,
):
    """especies_manejo (experiencia de manejo especifica) y especies
    (especies que atiende en general) son campos distintos que coexisten en
    capacidades -- ver migracion
    0075_candidatos_para_reporte_especies_tamanios_base.sql. El fallback de
    matching.py:81-85 (usar `especies` si `especies_manejo` viene vacio) ya
    existia, pero para un voluntario interno nunca se habia ejercitado
    porque la RPC no traia la columna `especies` en absoluto antes de esa
    migracion. Confirma que, ahora que si llega, el fallback funciona."""
    solo_especie_base = candidato(
        usuario_id="solo-base",
        especies_manejo=[],
        especies=["perro", "gato"],
    )

    resultado = ejecutar_matching(reporte_multi_animal, [solo_especie_base])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["solo-base"]


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


def test_matching_radio_null_usa_max_radio_km(reporte_multi_animal):
    """migrations/0074_radio_max_km_null_sin_limite.sql quito el filtro SQL
    que excluia por completo cualquier fila con radio_max_km NULL -- este
    fallback de aca (or MAX_RADIO_KM) ya existia pero era codigo muerto para
    candidatos internos, porque la RPC nunca dejaba pasar una fila asi.
    Confirma que ahora que si llegan filas reales con radio_max_km=None,
    el fallback las trata como "hasta el maximo de la plataforma"."""
    sin_radio = candidato(usuario_id="sin-radio", distancia_km=15, radio_max_km=None)

    resultado = ejecutar_matching(reporte_multi_animal, [sin_radio])

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["sin-radio"]
    assert resultado["candidatos"][0]["radio_max_km"] == matching.MAX_RADIO_KM


def test_matching_radio_null_sigue_topado_en_max_radio_km(reporte_multi_animal):
    """El fallback a NULL no es "sin limite real": sigue topado al maximo
    de la plataforma, igual que la comparacion LEAST(..., 30) del lado SQL."""
    lejos = candidato(
        usuario_id="lejos", distancia_km=matching.MAX_RADIO_KM + 5, radio_max_km=None
    )

    resultado = ejecutar_matching(reporte_multi_animal, [lejos])

    assert resultado["candidatos"] == []


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


def test_matching_excluye_voluntario_con_propuesta_activa_sin_vencer(
    reporte_multi_animal,
):
    con_propuesta = candidato(usuario_id="con-propuesta", distancia_km=0)
    disponible = candidato(usuario_id="disponible", distancia_km=5)

    resultado = ejecutar_matching(
        reporte_multi_animal,
        [con_propuesta, disponible],
        propuestas_activas=[{"usuario_asignado_id": "con-propuesta"}],
    )

    assert [c["usuario_id"] for c in resultado["candidatos"]] == ["disponible"]


def test_propuesta_activa_vigente_bloquea_al_voluntario(make_query):
    """Postgres SI devuelve la fila: estado='activa' y vence_at futuro."""
    query = make_query(data=[{"usuario_asignado_id": "user-1"}])
    db_admin = MagicMock()
    db_admin.table.return_value = query
    db_anon = MagicMock()

    with (
        patch.object(matching, "supabase_admin", db_admin),
        patch.object(matching, "supabase", db_anon),
    ):
        resultado = matching._voluntarios_con_propuesta_activa()

    assert resultado == {"user-1"}
    db_admin.table.assert_called_once_with("propuestas_asignacion")
    db_anon.table.assert_not_called()
    query.eq.assert_called_once_with("estado", "activa")
    assert query.gt.call_args[0][0] == "vence_at"


def test_propuesta_vencida_no_bloquea_al_voluntario(make_query):
    """Una propuesta con vence_at en el pasado nunca llega aqui: Postgres
    ya la excluyo con `.gt("vence_at", ahora)`, asi que la fila no vuelve
    y nadie queda bloqueado -- el filtro es temporal, no permanente."""
    query = make_query(data=[])
    db_admin = MagicMock()
    db_admin.table.return_value = query

    with patch.object(matching, "supabase_admin", db_admin):
        resultado = matching._voluntarios_con_propuesta_activa()

    assert resultado == set()
    assert query.gt.call_args[0][0] == "vence_at"


def test_propuesta_en_otro_estado_no_bloquea_al_voluntario(make_query):
    """Una propuesta 'confirmada'/'rechazada'/'vencida'/'cancelada' nunca
    llega aqui: Postgres ya la excluyo con `.eq("estado", "activa")` --
    el filtro es especifico al estado activa-vigente, no a cualquier
    propuesta que haya existido alguna vez."""
    query = make_query(data=[])
    db_admin = MagicMock()
    db_admin.table.return_value = query

    with patch.object(matching, "supabase_admin", db_admin):
        resultado = matching._voluntarios_con_propuesta_activa()

    assert resultado == set()
    query.eq.assert_called_once_with("estado", "activa")


def test_propuestas_activas_usa_supabase_admin_no_el_cliente_anon(make_query):
    """Regresion del bug real de produccion: propuestas_asignacion tiene RLS
    habilitado con grants solo para service_role desde la migracion
    0069_rutas_asignacion_osrm.sql (REVOKE ALL ... FROM PUBLIC, anon,
    authenticated; GRANT ALL ... TO service_role). El cliente `supabase`
    (construido con SUPABASE_KEY) no tiene permiso sobre esta tabla y
    Postgres responde 42501 'permission denied for table
    propuestas_asignacion'. Un mock que solo verifica la respuesta (como
    hacian los tests anteriores, parcheando cualquiera de los dos clientes
    indistintamente) no detecta que la consulta corrio contra el cliente
    equivocado -- este test verifica explicitamente CUAL cliente se usa,
    no solo el resultado."""
    query = make_query(data=[{"usuario_asignado_id": "user-1"}])
    db_admin = MagicMock()
    db_admin.table.return_value = query
    db_anon = MagicMock()

    with (
        patch.object(matching, "supabase_admin", db_admin),
        patch.object(matching, "supabase", db_anon),
    ):
        matching._voluntarios_con_propuesta_activa()

    db_admin.table.assert_called_once_with("propuestas_asignacion")
    db_anon.table.assert_not_called()


def test_integracion_segunda_llamada_excluye_tras_reservar_cobertura(
    monkeypatch, reporte_multi_animal
):
    """Escenario real del bug: dos reportes, el mismo voluntario como
    mejor candidato en ambos. reservar_cobertura() corre de verdad (solo
    se mockea el cliente de Supabase, no la funcion) y escribe en una
    tabla falsa compartida; la segunda llamada a obtener_candidatos()
    lee de esa misma tabla y ya no debe incluirlo."""
    from app.services import coverage_service

    tabla_propuestas: list[dict] = []

    def fake_rpc(nombre, params):
        resultado_rpc = MagicMock()
        if nombre == "reservar_cobertura_reporte":
            tabla_propuestas.append(
                {"usuario_asignado_id": params["p_usuario_asignado_id"]}
            )
            resultado_rpc.execute.return_value = SimpleNamespace(
                data="propuesta-1"
            )
        return resultado_rpc

    supabase_admin_mock = MagicMock()
    supabase_admin_mock.rpc.side_effect = fake_rpc
    monkeypatch.setattr(coverage_service, "supabase_admin", supabase_admin_mock)
    monkeypatch.setattr(
        coverage_service, "_reporte_disponible_para_cobertura", lambda *a, **k: True
    )
    monkeypatch.setattr(
        coverage_service.reputacion_service,
        "consultar_restricciones",
        lambda *a, **k: {"bloqueado_nuevas_asignaciones": False},
    )

    def _propuestas_query() -> MagicMock:
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.gt.return_value = query
        query.execute.return_value = SimpleNamespace(data=list(tabla_propuestas))
        return query

    top = candidato(usuario_id="user-top", distancia_km=0)
    otro = candidato(usuario_id="user-otro", distancia_km=5)

    def ejecutar(reporte_id: str, candidatos: list[dict]) -> dict:
        rpc = MagicMock()
        rpc.execute.return_value = SimpleNamespace(data=candidatos)
        with (
            patch.object(
                matching,
                "_obtener_reporte",
                return_value={**reporte_multi_animal, "id": reporte_id},
            ),
            patch.object(
                matching, "_voluntarios_que_rechazaron", return_value=set()
            ),
            patch.object(matching, "supabase") as supabase,
            patch.object(matching, "supabase_admin") as supabase_admin,
        ):
            supabase.rpc.return_value = rpc
            supabase_admin.table.side_effect = (
                lambda nombre: _propuestas_query()
                if nombre == "propuestas_asignacion"
                else MagicMock()
            )
            return matching.obtener_candidatos(reporte_id)

    primera = ejecutar("reporte-1", [top, otro])
    assert primera["candidatos"][0]["usuario_id"] == "user-top"

    coverage_service.reservar_cobertura(
        reporte_id="reporte-1",
        usuario_asignado_id="user-top",
        voluntario_id="vol-1",
        asociacion_id="aso-1",
        actor_id="staff-1",
        origen="equipo_interno",
    )

    segunda = ejecutar("reporte-2", [top, otro])

    assert [c["usuario_id"] for c in segunda["candidatos"]] == ["user-otro"]


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
