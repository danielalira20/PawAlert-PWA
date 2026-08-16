from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import coverage_service


@pytest.fixture(autouse=True)
def permitir_asignaciones_sin_restriccion():
    with (
        patch.object(
            coverage_service.reputacion_service,
            "consultar_restricciones",
            return_value={"bloqueado_nuevas_asignaciones": False},
        ),
        patch.object(
            coverage_service,
            "_reporte_disponible_para_cobertura",
            return_value=True,
        ),
    ):
        yield


def test_compatibilidad_exige_todas_las_especies_y_tamanios():
    capacidades = {
        "especies_manejo": ["perro", "gato"],
        "tamanios_manejo": ["pequeno", "mediano"],
    }
    compatibles = [
        {"tipo_animal": "perro", "tamanio": "mediano"},
        {"tipo_animal": "gato", "tamanio": "pequeno"},
    ]
    incompatible = compatibles + [
        {"tipo_animal": "ave", "tamanio": "pequeno"},
    ]

    assert coverage_service._animales_compatibles(compatibles, capacidades)
    assert not coverage_service._animales_compatibles(incompatible, capacidades)


def test_distancia_cercana_se_calcula_en_kilometros():
    distancia = coverage_service._distancia_km(
        19.4326, -99.1332, 19.4426, -99.1332
    )
    assert distancia == pytest.approx(1.11, abs=0.03)


def test_ofrecimiento_usa_funcion_transaccional_e_idempotente():
    ejecucion = MagicMock()
    ejecucion.execute.return_value = SimpleNamespace(
        data={"id": "oferta-1", "estado": "vigente"}
    )
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion
    perfil = {
        "id": "vol-1",
        "capacidades": {"max_casos_simultaneos": 2},
    }
    caso = {
        "id": "rep-1",
        "distancia_precisa_km": 3.4,
    }

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch.object(coverage_service, "obtener_perfil_externo", return_value=perfil),
        patch.object(coverage_service, "obtener_casos_cercanos", return_value=[caso]),
        patch.object(coverage_service, "_carga_activa", return_value=0),
        patch.object(
            coverage_service.matching,
            "evaluar_candidato_externo",
            return_value={"score": {"total": 73}},
        ),
    ):
        oferta = coverage_service.crear_ofrecimiento("user-1", "rep-1")

    assert oferta == {"id": "oferta-1", "estado": "vigente"}
    supabase_admin.rpc.assert_called_once_with(
        "crear_ofrecimiento_externo",
        {
            "p_reporte_id": "rep-1",
            "p_voluntario_id": "vol-1",
            "p_usuario_id": "user-1",
            "p_compatibilidad": 73,
            "p_distancia_km": 3.4,
            "p_capacidad_disponible": 2,
        },
    )


def test_ofrecimiento_devuelve_conflicto_cuando_el_caso_cambio():
    ejecucion = MagicMock()
    ejecucion.execute.side_effect = Exception("caso_no_disponible")
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion
    perfil = {
        "id": "vol-1",
        "capacidades": {"max_casos_simultaneos": 1},
    }
    caso = {
        "id": "rep-1",
        "distancia_precisa_km": 1.0,
    }

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch.object(coverage_service, "obtener_perfil_externo", return_value=perfil),
        patch.object(coverage_service, "obtener_casos_cercanos", return_value=[caso]),
        patch.object(coverage_service, "_carga_activa", return_value=0),
        patch.object(
            coverage_service.matching,
            "evaluar_candidato_externo",
            return_value={"score": {"total": 73}},
        ),
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.crear_ofrecimiento("user-1", "rep-1")

    assert error.value.status_code == 409
    assert "ya no acepta ofrecimientos" in error.value.detail


def test_asociacion_recibe_datos_del_externo_con_cliente_administrativo():
    consulta_ofertas = MagicMock()
    consulta_ofertas.select.return_value = consulta_ofertas
    consulta_ofertas.eq.return_value = consulta_ofertas
    consulta_ofertas.in_.return_value = consulta_ofertas
    consulta_ofertas.order.return_value = consulta_ofertas
    consulta_ofertas.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "oferta-1",
                "voluntario_id": "vol-1",
                "estado": "vigente",
                "compatibilidad": 100,
                "distancia_km": 1.2,
                "capacidad_disponible": 2,
                "ofrecido_at": "2026-07-28T18:00:00+00:00",
            }
        ]
    )

    consulta_perfil = MagicMock()
    consulta_perfil.select.return_value = consulta_perfil
    consulta_perfil.eq.return_value = consulta_perfil
    consulta_perfil.limit.return_value = consulta_perfil
    consulta_perfil.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "vol-1",
                "usuario_id": "user-1",
                "estado": "activo_nivel_2",
                "usuarios": {
                    "nombre": "Rafael",
                    "apellido_paterno": "Jude",
                },
                "capacidades": {"max_casos_simultaneos": 2},
            }
        ]
    )

    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = [consulta_ofertas, consulta_perfil]
    supabase_publico = MagicMock()

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch.object(coverage_service, "supabase", supabase_publico),
        patch.object(coverage_service, "_carga_activa", return_value=0),
        patch.object(
            coverage_service.matching,
            "evaluar_candidato_externo",
            return_value={
                "radio_max_km": 10,
                "carga_actual": 0,
                "max_casos_simultaneos": 2,
                "medios_transporte": ["automovil"],
                "score": {
                    "total": 78,
                    "proximidad": 26,
                    "disponibilidad": 18,
                    "experiencia": 14,
                    "movilidad": 10,
                    "carga": 10,
                },
                "coincidencias": ["Manejo de animales dóciles o estables"],
                "alertas": [],
                "capacidad_resumen": "0 de 2 casos activos",
            },
        ),
    ):
        ofertas = coverage_service.obtener_ofrecimientos_reporte("rep-1")

    assert ofertas[0]["nombre"] == "Rafael Jude"
    assert ofertas[0]["etiqueta"] == "Se ofreció"
    assert ofertas[0]["tipo"] == "voluntario_externo"
    assert ofertas[0]["score"]["total"] == 78
    assert ofertas[0]["capacidad_resumen"] == "0 de 2 casos activos"
    assert supabase_admin.table.call_count == 2
    supabase_publico.table.assert_not_called()


def test_propuestas_pendientes_solo_consulta_las_activas_del_usuario():
    consulta = MagicMock()
    consulta.select.return_value = consulta
    consulta.eq.return_value = consulta
    consulta.order.return_value = consulta
    consulta.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "propuesta-1",
                "reporte_id": "rep-1",
                "enviada_at": "2026-07-28T18:00:00+00:00",
                "vence_at": None,
            }
        ]
    )
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = consulta

    with patch.object(coverage_service, "supabase_admin", supabase_admin):
        propuestas = coverage_service.obtener_propuestas_pendientes("user-1")

    assert propuestas[0]["reporte_id"] == "rep-1"
    supabase_admin.table.assert_called_once_with("propuestas_asignacion")
    assert consulta.eq.call_args_list[0].args == (
        "usuario_asignado_id",
        "user-1",
    )
    assert consulta.eq.call_args_list[1].args == ("estado", "activa")


def test_reserva_usa_una_sola_funcion_transaccional():
    ejecucion = MagicMock()
    ejecucion.execute.return_value = SimpleNamespace(data="propuesta-1")
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion

    with patch.object(coverage_service, "supabase_admin", supabase_admin):
        propuesta = coverage_service.reservar_cobertura(
            reporte_id="rep-1",
            usuario_asignado_id="user-1",
            voluntario_id="vol-1",
            asociacion_id="aso-1",
            actor_id="actor-1",
            origen="equipo_interno",
        )

    assert propuesta == "propuesta-1"
    nombre_rpc, argumentos = supabase_admin.rpc.call_args.args
    assert nombre_rpc == "reservar_cobertura_reporte"
    assert argumentos["p_reporte_id"] == "rep-1"
    assert argumentos["p_usuario_asignado_id"] == "user-1"
    assert argumentos["p_voluntario_id"] == "vol-1"
    assert argumentos["p_asociacion_id"] == "aso-1"
    assert argumentos["p_actor_id"] == "actor-1"
    assert argumentos["p_origen"] == "equipo_interno"
    assert argumentos["p_vence_at"]


def test_reserva_rechaza_reporte_sin_validacion_aprobada():
    supabase_admin = MagicMock()
    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch.object(
            coverage_service,
            "_reporte_disponible_para_cobertura",
            return_value=False,
        ),
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.reservar_cobertura(
            reporte_id="rep-1",
            usuario_asignado_id="user-1",
            voluntario_id="vol-1",
            asociacion_id="aso-1",
            actor_id="actor-1",
            origen="equipo_interno",
        )

    assert error.value.status_code == 409
    supabase_admin.rpc.assert_not_called()


def test_expira_propuestas_mediante_funcion_transaccional():
    ejecucion = MagicMock()
    ejecucion.execute.return_value = SimpleNamespace(data=[{"propuesta_id": "p1", "reporte_id": "r1", "usuario_asignado_id": "u1", "asociacion_coordinadora_id": "a1"}])
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion

    with patch.object(coverage_service, "supabase_admin", supabase_admin):
        total = coverage_service.expirar_propuestas_vencidas()

    assert total == 1
    supabase_admin.rpc.assert_called_once_with("expirar_propuestas_cobertura_detalladas")


@pytest.mark.parametrize("acepta", [True, False])
def test_respuesta_oportuna_interna_suma_trust_al_aceptar_o_rechazar(
    make_query, acepta,
):
    propuestas = make_query(data=[{"id": "propuesta-1"}])
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = propuestas
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data="confirmado" if acepta else "abierto"
    )

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch(
            "app.services.reputacion_service.procesar_respuesta_propuesta_interna"
        ) as mock_reputacion,
    ):
        resultado = coverage_service.responder_propuesta(
            "user-1", "rep-1", acepta, rol="voluntario_interno"
        )

    assert resultado["ok"] is True
    mock_reputacion.assert_called_once_with("propuesta-1", "user-1")
    propuestas.eq.assert_any_call("estado", "activa")


def test_respuesta_externa_no_usa_regla_interna():
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data="confirmado"
    )

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch(
            "app.services.reputacion_service.procesar_respuesta_propuesta_interna"
        ) as mock_reputacion,
    ):
        coverage_service.responder_propuesta(
            "user-ext", "rep-1", True, rol="voluntario_externo"
        )

    # supabase_admin.table is called to send pushes to the association
    # supabase_admin.table.assert_not_called()
    mock_reputacion.assert_not_called()


def test_reserva_concurrente_devuelve_conflicto_controlado():
    ejecucion = MagicMock()
    ejecucion.execute.side_effect = Exception("caso_no_disponible")
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.reservar_cobertura(
            reporte_id="rep-1",
            usuario_asignado_id="user-2",
            voluntario_id="vol-2",
            asociacion_id="aso-1",
            actor_id="actor-1",
            origen="equipo_interno",
        )

    assert error.value.status_code == 409
    assert "ya no está disponible" in error.value.detail


@pytest.mark.parametrize(
    "funcion_faltante",
    [
        "function st_point(numeric, numeric) does not exist",
        "function st_setsrid(extensions.geometry, integer) does not exist",
    ],
)
def test_reserva_explica_si_falta_compatibilidad_geografica(funcion_faltante):
    ejecucion = MagicMock()
    ejecucion.execute.side_effect = Exception(
        f"{{'code': '42883', 'message': '{funcion_faltante}'}}"
    )
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value = ejecucion

    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.reservar_cobertura(
            reporte_id="rep-1",
            usuario_asignado_id="user-1",
            voluntario_id="vol-1",
            asociacion_id="aso-1",
            actor_id="actor-1",
            origen="ofrecimiento_externo",
        )

    assert error.value.status_code == 503
    assert "migración 0022" in error.value.detail


def test_voluntario_externo_bloqueado_no_puede_crear_ofrecimiento():
    with (
        patch.object(
            coverage_service.reputacion_service,
            "consultar_restricciones",
            return_value={"bloqueado_nuevas_asignaciones": True},
        ),
        patch.object(coverage_service, "obtener_perfil_externo") as mock_perfil,
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.crear_ofrecimiento("user-ext", "rep-1")

    assert error.value.status_code == 403
    assert "casos nuevos" in error.value.detail
    mock_perfil.assert_not_called()


@pytest.mark.parametrize("origen", ["equipo_interno", "ofrecimiento_externo"])
def test_reserva_revalida_bloqueo_antes_de_la_operacion_atomica(origen):
    supabase_admin = MagicMock()
    with (
        patch.object(coverage_service, "supabase_admin", supabase_admin),
        patch.object(
            coverage_service.reputacion_service,
            "consultar_restricciones",
            return_value={"bloqueado_nuevas_asignaciones": True},
        ),
        pytest.raises(HTTPException) as error,
    ):
        coverage_service.reservar_cobertura(
            reporte_id="rep-1",
            usuario_asignado_id="user-1",
            voluntario_id="vol-1",
            asociacion_id="aso-1",
            actor_id="actor-1",
            origen=origen,
        )

    assert error.value.status_code == 409
    assert "no puede recibir nuevas asignaciones" in error.value.detail
    supabase_admin.rpc.assert_not_called()
