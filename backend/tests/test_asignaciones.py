from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api import asignaciones


def tablas_mock(make_query, configuracion):
    tablas = {nombre: make_query(**datos) for nombre, datos in configuracion.items()}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    return supabase, tablas


def test_obtener_candidatos_incluye_configuracion_y_confirmacion(make_query):
    supabase, tablas = tablas_mock(make_query, {
        "asociaciones": {"data": {
            "modo_asignacion": "semi_automatico",
            "timeout_grave": 5,
            "timeout_herido": 15,
            "timeout_estable": 30,
        }},
    })
    reporte = {
        "id": "rep-1",
        "asociacion_asignada_id": "aso-1",
        "condicion": "grave",
        "confirmacion_voluntario": "esperando",
        "candidatos_presentados_at": "2026-07-19T10:00:00+00:00",
    }

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value={"id": "aso-user"}),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(asignaciones, "_validar_es_asociacion_duena"),
        patch.object(asignaciones.matching, "obtener_candidatos", return_value={"candidatos": [{"voluntario_id": "vol-1"}]}),
        patch.object(asignaciones.coverage_service, "obtener_ofrecimientos_reporte", return_value=[]),
        patch.object(asignaciones, "supabase", supabase),
    ):
        resultado = asignaciones.obtener_candidatos("rep-1", "Bearer token")

    assert resultado["modo_asignacion"] == "semi_automatico"
    assert resultado["timeout_min"] == 5
    assert resultado["confirmacion_voluntario"] == "esperando"
    # Ya tenía timestamp: no debe volver a sellarlo.
    assert not supabase.table.called or "reportes" not in [c.args[0] for c in supabase.table.call_args_list]


def test_obtener_candidatos_sella_primera_presentacion(make_query):
    supabase, tablas = tablas_mock(make_query, {
        "asociaciones": {"data": {
            "modo_asignacion": "manual", "timeout_grave": 5,
            "timeout_herido": 15, "timeout_estable": 30,
        }},
        "reportes": {"data": []},
        "historial_reporte": {"data": []},
    })
    reporte = {
        "id": "rep-1", "asociacion_asignada_id": "aso-1", "condicion": "estable",
        "confirmacion_voluntario": None, "candidatos_presentados_at": None,
    }

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value={"id": "aso-user"}),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(asignaciones, "_validar_es_asociacion_duena"),
        patch.object(asignaciones.matching, "obtener_candidatos", return_value={"candidatos": [{"voluntario_id": "vol-1"}]}),
        patch.object(asignaciones.coverage_service, "obtener_ofrecimientos_reporte", return_value=[]),
        patch.object(asignaciones, "supabase", supabase),
    ):
        asignaciones.obtener_candidatos("rep-1", "Bearer token")

    tablas["reportes"].update.assert_called_once()
    tablas["historial_reporte"].insert.assert_called_once()
    assert tablas["historial_reporte"].insert.call_args.args[0]["tipo_evento"] == "candidatos_presentados"


def test_asignar_voluntario_deja_confirmacion_esperando(make_query):
    supabase, tablas = tablas_mock(make_query, {
        "voluntarios": {"data": {
            "id": "vol-1", "usuario_id": "user-vol-1", "estado": "activo_nivel_1",
            "usuarios": {
                "nombre": "Ana",
                "apellido_paterno": "López",
                "roles": {"nombre": "voluntario_interno"},
            },
        }},
        "reportes": {"data": []},
        "asignacion_estados": {"data": [{"id": "estado-aceptada"}]},
        "reporte_asignaciones": {"data": []},
        "historial_reporte": {"data": []},
    })
    reporte = {"id": "rep-1", "asociacion_asignada_id": "aso-1", "staff_asignado_id": None}

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value={"id": "aso-user"}),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(asignaciones, "_validar_es_asociacion_duena"),
        patch.object(
            asignaciones.matching,
            "obtener_candidatos",
            return_value={"candidatos": [{"voluntario_id": "vol-1"}]},
        ),
        patch.object(
            asignaciones.coverage_service,
            "reservar_cobertura",
        ) as reservar,
        patch.object(asignaciones, "supabase", supabase),
    ):
        resultado = asignaciones.asignar_voluntario(
            "rep-1", asignaciones.AsignarBody(voluntario_id="vol-1"), "Bearer token"
        )

    reservar.assert_called_once_with(
        reporte_id="rep-1",
        usuario_asignado_id="user-vol-1",
        voluntario_id="vol-1",
        asociacion_id="aso-1",
        actor_id="aso-user",
        origen="equipo_interno",
    )
    assert resultado["confirmacion"] == "esperando"


def test_asignar_rechaza_voluntario_inactivo(make_query):
    supabase, _ = tablas_mock(make_query, {
        "voluntarios": {"data": {
            "id": "vol-1", "usuario_id": "user-vol-1", "estado": "pendiente",
            "usuarios": {"nombre": "Ana", "apellido_paterno": "López"},
        }},
    })
    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value={"id": "aso-user"}),
        patch.object(asignaciones, "_reporte_o_404", return_value={"staff_asignado_id": None}),
        patch.object(asignaciones, "_validar_es_asociacion_duena"),
        patch.object(asignaciones, "supabase", supabase),
        pytest.raises(HTTPException) as error,
    ):
        asignaciones.asignar_voluntario(
            "rep-1", asignaciones.AsignarBody(voluntario_id="vol-1"), "Bearer token"
        )
    assert error.value.status_code == 422


def test_asignar_rechaza_candidato_que_dejo_de_estar_disponible(make_query):
    supabase, _ = tablas_mock(make_query, {
        "voluntarios": {"data": {
            "id": "vol-1", "usuario_id": "user-vol-1",
            "estado": "activo_nivel_1",
            "usuarios": {"nombre": "Ana", "apellido_paterno": "López"},
        }},
    })
    reporte = {
        "id": "rep-1",
        "asociacion_asignada_id": "aso-1",
        "staff_asignado_id": None,
    }

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value={"id": "aso-user"}),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(asignaciones, "_validar_es_asociacion_duena"),
        patch.object(
            asignaciones.matching,
            "obtener_candidatos",
            return_value={"candidatos": []},
        ),
        patch.object(asignaciones, "supabase", supabase),
        pytest.raises(HTTPException) as error,
    ):
        asignaciones.asignar_voluntario(
            "rep-1",
            asignaciones.AsignarBody(voluntario_id="vol-1"),
            "Bearer token",
        )

    assert error.value.status_code == 409


def test_confirmar_asignacion_mueve_reporte_a_en_camino(make_query):
    supabase, _ = tablas_mock(make_query, {
        "reportes": {"data": []},
        "asignacion_estados": {"data": [{"id": "estado-aceptada"}]},
        "reporte_asignaciones": {"data": []},
        "historial_reporte": {"data": []},
    })
    usuario = {"id": "user-vol-1"}
    reporte = {"staff_asignado_id": "user-vol-1", "confirmacion_voluntario": "esperando"}

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value=usuario),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(
            asignaciones.coverage_service,
            "responder_propuesta",
            return_value={"ok": True, "estado_cobertura": "confirmado"},
        ) as responder,
        patch.object(asignaciones, "supabase", supabase),
    ):
        assert asignaciones.confirmar_asignacion("rep-1", "Bearer token") == {
            "ok": True,
            "estado_cobertura": "confirmado",
        }

    responder.assert_called_once_with("user-vol-1", "rep-1", True)


def test_rechazar_asignacion_libera_caso_sin_cambiar_estado_reporte(make_query):
    supabase, _ = tablas_mock(make_query, {
        "reportes": {"data": []},
        "asignacion_estados": {"data": [{"id": "estado-notificada"}]},
        "reporte_asignaciones": {"data": []},
        "historial_reporte": {"data": []},
    })
    usuario = {"id": "user-vol-1"}
    reporte = {"staff_asignado_id": "user-vol-1", "confirmacion_voluntario": "esperando"}

    with (
        patch.object(asignaciones, "_obtener_usuario_autenticado", return_value=usuario),
        patch.object(asignaciones, "_reporte_o_404", return_value=reporte),
        patch.object(
            asignaciones.coverage_service,
            "responder_propuesta",
            return_value={"ok": True, "estado_cobertura": "abierto"},
        ) as responder,
        patch.object(asignaciones, "supabase", supabase),
    ):
        resultado = asignaciones.rechazar_asignacion(
            "rep-1", asignaciones.RechazarBody(motivo="No puedo trasladarlo"), "Bearer token"
        )

    assert resultado == {"ok": True, "estado_cobertura": "abierto"}
    responder.assert_called_once_with(
        "user-vol-1", "rep-1", False, "No puedo trasladarlo"
    )


def test_validar_asociacion_duena_bloquea_rol_y_pertenencia():
    with pytest.raises(HTTPException) as rol_error:
        asignaciones._validar_es_asociacion_duena(
            {"rol": "voluntario_interno", "asociacion_id": "aso-1"},
            {"asociacion_asignada_id": "aso-1"},
        )
    assert rol_error.value.status_code == 403

    with pytest.raises(HTTPException) as pertenencia_error:
        asignaciones._validar_es_asociacion_duena(
            {"rol": "asociacion", "asociacion_id": "aso-2"},
            {"asociacion_asignada_id": "aso-1"},
        )
    assert pertenencia_error.value.status_code == 403


def test_validar_confirmacion_exige_voluntario_asignado_y_estado_esperando():
    with pytest.raises(HTTPException) as ajeno:
        asignaciones._validar_es_el_voluntario_asignado(
            {"id": "otro"}, {"staff_asignado_id": "asignado", "confirmacion_voluntario": "esperando"}
        )
    assert ajeno.value.status_code == 403

    with pytest.raises(HTTPException) as estado:
        asignaciones._validar_es_el_voluntario_asignado(
            {"id": "asignado"}, {"staff_asignado_id": "asignado", "confirmacion_voluntario": "confirmado"}
        )
    assert estado.value.status_code == 409
