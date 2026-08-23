from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import report_activation_service


@pytest.fixture(autouse=True)
def _mock_initial_urgency():
    with patch(
        "app.services.urgency_service.evaluate_report_urgency"
    ) as evaluate:
        yield evaluate


def _clientes(make_query, *, asociacion: bool):
    tablas = {
        "reporte_estados": make_query(data=[{"id": "estado-operativo"}]),
        "asignacion_estados": make_query(data=[{"id": "estado-notificada"}]),
        "reporte_asignaciones": make_query(data=[]),
        "reportes": make_query(data=[{"id": "reporte-1"}]),
        "historial_reporte": make_query(data=[]),
        "notificacion_tipos": make_query(data=[{"id": "tipo-nuevo-reporte"}]),
        "notificaciones": make_query(data=[]),
    }
    admin_tablas = {
        "casos_administrativos": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: admin_tablas[nombre]
    asociacion_data = (
        {"id": "asociacion-1", "nombre": "Rescate Centro"}
        if asociacion
        else None
    )
    return supabase, supabase_admin, tablas, admin_tablas, asociacion_data


def _activar(condicion_mas_grave="herido"):
    return report_activation_service.activar_reporte(
        reporte_id="reporte-1",
        latitud=19.04,
        longitud=-98.20,
        especies=["perro", "perro", "gato"],
        condicion_mas_grave=condicion_mas_grave,
        tipo_animal_mas_grave="gato",
        municipio="Puebla",
    )


def test_activar_reporte_abre_cobertura_despues_de_validacion(
    make_query, _mock_initial_urgency
):
    supabase, supabase_admin, tablas, _, asociacion = _clientes(
        make_query, asociacion=True
    )
    candidatos = {"candidatos": [{"voluntario_id": "voluntario-1"}]}

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "asignar_asociacion",
            return_value=asociacion,
        ) as asignar,
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
            return_value=candidatos,
        ) as obtener_candidatos,
    ):
        resultado = _activar()

    assert resultado == {"estado": "asignado", "asociacion": asociacion}
    asignar.assert_called_once_with(
        19.04,
        -98.20,
        tipos_animales=["perro", "gato"],
        es_critico=False,
    )
    actualizacion = tablas["reportes"].update.call_args_list[0].args[0]
    assert actualizacion["estado_validacion_reporte"] == "aprobado"
    assert actualizacion["estado_reporte"] == "asignado"
    assert actualizacion["estado_cobertura"] == "abierto"
    assert actualizacion["asociacion_asignada_id"] == "asociacion-1"
    assert actualizacion["activado_at"] is not None
    assert actualizacion["urgency_excluido"] is False
    assert actualizacion["urgency_razones_exclusion"] == []
    assert tablas["reporte_asignaciones"].insert.called
    assert tablas["notificaciones"].insert.called
    obtener_candidatos.assert_called_once_with("reporte-1")
    _mock_initial_urgency.assert_called_once_with("reporte-1")

    eventos = [
        llamada.args[0]["tipo_evento"]
        for llamada in tablas["historial_reporte"].insert.call_args_list
    ]
    assert eventos == [
        "validacion_reporte_aprobada",
        "asociacion_asignada",
        "candidatos_presentados",
    ]


def test_activar_reporte_informa_si_el_caso_es_critico(
    make_query, _mock_initial_urgency
):
    supabase, supabase_admin, _, _, asociacion = _clientes(
        make_query, asociacion=False
    )

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "asignar_asociacion",
            return_value=asociacion,
        ) as asignar,
    ):
        _activar(condicion_mas_grave="grave")

    asignar.assert_called_once_with(
        19.04,
        -98.20,
        tipos_animales=["perro", "gato"],
        es_critico=True,
    )


def test_fallo_interno_de_urgencia_no_rompe_activacion(
    make_query, _mock_initial_urgency
):
    supabase, supabase_admin, tablas, _, asociacion = _clientes(
        make_query, asociacion=True
    )
    _mock_initial_urgency.side_effect = RuntimeError("fallo de persistencia")

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "asignar_asociacion",
            return_value=asociacion,
        ),
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
            return_value={"candidatos": []},
        ) as obtener_candidatos,
    ):
        resultado = _activar()

    assert resultado["estado"] == "asignado"
    obtener_candidatos.assert_called_once_with("reporte-1")

    segunda_actualizacion = tablas["reportes"].update.call_args_list[1].args[0]
    assert "urgency_proximo_recalculo_at" in segunda_actualizacion

    eventos = [
        llamada.args[0]["tipo_evento"]
        for llamada in tablas["historial_reporte"].insert.call_args_list
    ]
    assert "urgency_inicial_fallida" in eventos


def test_activar_reporte_sin_asociacion_crea_caso_administrativo(make_query):
    supabase, supabase_admin, tablas, admin_tablas, asociacion = _clientes(
        make_query, asociacion=False
    )

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "asignar_asociacion",
            return_value=asociacion,
        ),
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
        ) as obtener_candidatos,
    ):
        resultado = _activar()

    assert resultado == {"estado": "sin_cobertura", "asociacion": None}
    actualizacion = tablas["reportes"].update.call_args.args[0]
    assert actualizacion["estado_validacion_reporte"] == "aprobado"
    assert actualizacion["estado_reporte"] == "sin_cobertura"
    assert actualizacion["estado_cobertura"] is None
    assert actualizacion["asociacion_asignada_id"] is None
    assert admin_tablas["casos_administrativos"].insert.called
    assert not tablas["reporte_asignaciones"].insert.called
    assert not tablas["notificaciones"].insert.called
    obtener_candidatos.assert_not_called()


def test_activar_reporte_compensa_preparacion_si_falla_actualizacion(make_query):
    supabase, supabase_admin, tablas, _, asociacion = _clientes(
        make_query, asociacion=True
    )
    tablas["reportes"].execute.side_effect = RuntimeError("fallo de escritura")

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "asignar_asociacion",
            return_value=asociacion,
        ),
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
        ) as obtener_candidatos,
    ):
        try:
            _activar()
        except RuntimeError as error:
            assert str(error) == "fallo de escritura"
        else:
            raise AssertionError("La activacion debio propagar el fallo principal")

    assert tablas["reporte_asignaciones"].delete.called
    obtener_candidatos.assert_not_called()


def test_enviar_reporte_a_revision_no_abre_cobertura(make_query):
    supabase, supabase_admin, tablas, _, _ = _clientes(
        make_query, asociacion=True
    )
    razones = [
        {"codigo": "gemini_error_tecnico", "resultado": "revision_manual"}
    ]

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(report_activation_service, "asignar_asociacion") as asignar,
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
        ) as obtener_candidatos,
    ):
        resultado = report_activation_service.enviar_reporte_a_revision(
            reporte_id="reporte-1",
            razones=razones,
            razones_exclusion_urgency=[{"codigo": "gemini_error_tecnico"}],
            revision_expira_at="2026-08-21T12:15:00+00:00",
        )

    assert resultado == {"estado": "revision_manual", "asociacion": None}
    actualizacion = tablas["reportes"].update.call_args.args[0]
    assert actualizacion["estado_validacion_reporte"] == "revision_manual"
    assert actualizacion["estado_moderacion"] == "en_revision"
    assert actualizacion["estado_cobertura"] is None
    assert actualizacion["asociacion_asignada_id"] is None
    assert actualizacion["urgency_excluido"] is True
    assert actualizacion["razones_validacion"] == razones
    assert actualizacion["validacion_revision_expira_at"] == (
        "2026-08-21T12:15:00+00:00"
    )
    asignar.assert_not_called()
    obtener_candidatos.assert_not_called()
    assert not tablas["reporte_asignaciones"].insert.called
    assert not tablas["notificaciones"].insert.called


def test_marcar_duplicado_vinculable_no_crea_trabajo_operativo(make_query):
    supabase, supabase_admin, tablas, _, _ = _clientes(
        make_query, asociacion=True
    )
    razones = [
        {
            "codigo": "duplicado_vinculado",
            "resultado": "no_operativo",
            "reporte_original_id": "reporte-original",
        }
    ]

    with (
        patch.object(report_activation_service, "supabase", supabase),
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(report_activation_service, "asignar_asociacion") as asignar,
        patch.object(
            report_activation_service.matching,
            "obtener_candidatos",
        ) as obtener_candidatos,
    ):
        resultado = (
            report_activation_service.marcar_reporte_duplicado_vinculable(
                reporte_id="reporte-1",
                reporte_original_id="reporte-original",
                razones=razones,
                razones_exclusion_urgency=[{"codigo": "duplicado_vinculado"}],
            )
        )

    assert resultado == {"estado": "duplicado_vinculable", "asociacion": None}
    actualizacion = tablas["reportes"].update.call_args.args[0]
    assert actualizacion["estado_reporte"] == "duplicado_vinculable"
    assert actualizacion["estado_cobertura"] is None
    assert actualizacion["asociacion_asignada_id"] is None
    assert actualizacion["activado_at"] is None
    assert actualizacion["validacion_revision_expira_at"] is None
    assert actualizacion["urgency_excluido"] is True
    asignar.assert_not_called()
    obtener_candidatos.assert_not_called()
    assert not tablas["reporte_asignaciones"].insert.called
    assert not tablas["notificaciones"].insert.called


def test_activar_reporte_desde_revision_reconstruye_contexto_y_aprobacion(make_query):
    reporte = {
        "id": "reporte-1",
        "latitud": 19.04,
        "longitud": -98.20,
        "municipio": "Puebla",
        "estado_validacion_reporte": "revision_manual",
        "razones_validacion": [
            {"codigo": "phash_coincidencia", "resultado": "revision_manual"}
        ],
        "animal": [
            {
                "tipo_animal_catalogo": {"clave": "perro"},
                "condicion_catalogo": {"clave": "estable"},
            },
            {
                "tipo_animal_catalogo": {"clave": "gato"},
                "condicion_catalogo": {"clave": "grave"},
            },
        ],
    }
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = make_query(data=[reporte])

    with (
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "activar_reporte",
            return_value={"estado": "asignado", "asociacion": {"id": "a-1"}},
        ) as activar,
    ):
        resultado = report_activation_service.activar_reporte_desde_revision(
            reporte_id="reporte-1",
            admin_id="admin-1",
            notas="Evidencia confirmada",
        )

    assert resultado["estado"] == "asignado"
    argumentos = activar.call_args.kwargs
    assert argumentos["especies"] == ["perro", "gato"]
    assert argumentos["condicion_mas_grave"] == "grave"
    assert argumentos["tipo_animal_mas_grave"] == "gato"
    assert argumentos["estado_validacion_esperado"] == "revision_manual"
    assert argumentos["moderacion_aprobada_por"] == "admin-1"
    assert argumentos["moderacion_notas"] == "Evidencia confirmada"
    assert argumentos["razones_validacion"][-1]["codigo"] == (
        "revision_manual_aprobada"
    )


def test_activar_reporte_por_vencimiento_clip_exige_unico_bloqueo(make_query):
    reporte = {
        "id": "reporte-1",
        "latitud": 19.04,
        "longitud": -98.20,
        "municipio": "Puebla",
        "estado_validacion_reporte": "revision_manual",
        "validacion_revision_expira_at": "2026-08-21T00:00:00+00:00",
        "razones_validacion": [
            {"codigo": "clip_zona_gris", "resultado": "revision_temporal"}
        ],
        "animal": [
            {
                "tipo_animal_catalogo": {"clave": "perro"},
                "condicion_catalogo": {"clave": "estable"},
            }
        ],
    }
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = make_query(data=[reporte])

    with (
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(
            report_activation_service,
            "activar_reporte",
            return_value={"estado": "asignado", "asociacion": {"id": "a-1"}},
        ) as activar,
    ):
        resultado = report_activation_service.activar_reporte_por_vencimiento_clip(
            "reporte-1"
        )

    assert resultado["estado"] == "asignado"
    argumentos = activar.call_args.kwargs
    assert argumentos["estado_validacion_esperado"] == "revision_manual"
    assert argumentos["moderacion_aprobada_automaticamente"] is True
    assert argumentos["razones_validacion"][-1]["codigo"] == (
        "clip_zona_gris_expirada"
    )


def test_activar_reporte_por_vencimiento_clip_rechaza_otro_bloqueo(make_query):
    reporte = {
        "id": "reporte-1",
        "estado_validacion_reporte": "revision_manual",
        "validacion_revision_expira_at": "2026-08-21T00:00:00+00:00",
        "razones_validacion": [
            {"codigo": "clip_zona_gris", "resultado": "revision_temporal"},
            {"codigo": "phash_coincidencia", "resultado": "revision_manual"},
        ],
        "animal": [],
    }
    supabase_admin = MagicMock()
    supabase_admin.table.return_value = make_query(data=[reporte])

    with (
        patch.object(report_activation_service, "supabase_admin", supabase_admin),
        patch.object(report_activation_service, "activar_reporte") as activar,
    ):
        with pytest.raises(HTTPException) as exc_info:
            report_activation_service.activar_reporte_por_vencimiento_clip(
                "reporte-1"
            )

    assert exc_info.value.status_code == 409
    activar.assert_not_called()
