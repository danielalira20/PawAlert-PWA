from unittest.mock import MagicMock, patch

from app.services import report_activation_service


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


def _activar():
    return report_activation_service.activar_reporte(
        reporte_id="reporte-1",
        latitud=19.04,
        longitud=-98.20,
        especies=["perro", "perro", "gato"],
        condicion_mas_grave="herido",
        tipo_animal_mas_grave="gato",
        municipio="Puebla",
    )


def test_activar_reporte_abre_cobertura_despues_de_validacion(make_query):
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
    )
    actualizacion = tablas["reportes"].update.call_args_list[0].args[0]
    assert actualizacion["estado_validacion_reporte"] == "aprobado"
    assert actualizacion["estado_reporte"] == "asignado"
    assert actualizacion["estado_cobertura"] == "abierto"
    assert actualizacion["asociacion_asignada_id"] == "asociacion-1"
    assert actualizacion["activado_at"] is not None
    assert tablas["reporte_asignaciones"].insert.called
    assert tablas["notificaciones"].insert.called
    obtener_candidatos.assert_called_once_with("reporte-1")

    eventos = [
        llamada.args[0]["tipo_evento"]
        for llamada in tablas["historial_reporte"].insert.call_args_list
    ]
    assert eventos == [
        "validacion_reporte_aprobada",
        "asociacion_asignada",
        "candidatos_presentados",
    ]


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
