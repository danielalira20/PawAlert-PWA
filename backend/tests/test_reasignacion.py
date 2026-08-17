import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.api import reports
from app.models.report import RechazarReporteRequest


def base_reporte(condicion="estable"):
    return {
        "id": "rep-1",
        "estado_reporte": "asignado",
        "asociacion_asignada_id": "aso-1",
        "latitud": 19.0432,
        "longitud": -98.1987,
        "municipio": "Puebla",
        "animal": [
            {
                "orden": 1,
                "tipo_animal_catalogo": {"clave": "perro"},
                "condicion_catalogo": {"clave": condicion},
            },
            {
                "orden": 2,
                "tipo_animal_catalogo": {"clave": "gato"},
                "condicion_catalogo": {"clave": "estable"},
            },
            {
                "orden": 3,
                "tipo_animal_catalogo": {"clave": "perro"},
                "condicion_catalogo": {"clave": "estable"},
            },
        ],
    }


def ejecutar_rechazo(supabase, asignar, contactos, *, motivo_clave=None):
    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={
            "id": "user-aso-1", "rol": "asociacion", "asociacion_id": "aso-1",
        }),
        patch.object(reports, "supabase", supabase),
        patch("app.services.assignment_service.asignar_asociacion", side_effect=asignar) as asignar_mock,
        patch("app.services.assignment_service.obtener_contactos_emergencia", side_effect=contactos) as contactos_mock,
        patch("app.services.report_service.registrar_historial") as historial,
    ):
        resultado = asyncio.run(reports.rechazar_reporte(
            "rep-1",
            RechazarReporteRequest(motivo="Sin espacio", comentario="Caso grande", motivo_clave=motivo_clave),
            "Bearer token",
        ))
    return resultado, asignar_mock, contactos_mock, historial


def test_rechazo_reasigna_con_todas_las_especies_y_excluye_anteriores(make_query):
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[base_reporte()], count=None),
        SimpleNamespace(data=[{"id": "rep-1"}], count=None),
    ])
    asignaciones_q = make_query(execute_results=[
        SimpleNamespace(data=[], count=None),
        SimpleNamespace(data=[{"asociacion_id": "aso-1"}, {"asociacion_id": "aso-vieja"}], count=None),
        SimpleNamespace(data=[{"id": "asig-nueva"}], count=None),
    ])
    estados_asignacion = make_query(execute_results=[
        SimpleNamespace(data=[{"id": "rechazada-id"}], count=None),
        SimpleNamespace(data=[{"id": "notificada-id"}], count=None),
    ])
    tablas = {
        "reportes": reportes,
        "reporte_asignaciones": asignaciones_q,
        "asignacion_estados": estados_asignacion,
        "reporte_estados": make_query(data=[{"id": "asignado-id"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    resultado, asignar, contactos, _ = ejecutar_rechazo(
        supabase,
        asignar=lambda *args, **kwargs: {"id": "aso-2", "nombre": "Huellitas"},
        contactos=lambda **kwargs: [],
    )

    asignar.assert_called_once_with(
        19.0432, -98.1987,
        excluir_ids=["aso-1", "aso-vieja"],
        tipos_animales=["perro", "gato"],
        es_critico=False,
    )
    contactos.assert_not_called()
    assert resultado["nueva_asociacion"] == "Huellitas"
    assert reportes.update.call_args.args[0]["asociacion_asignada_id"] == "aso-2"


def test_sin_cobertura_busca_contactos_por_especie_y_deduplica(make_query):
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[base_reporte(condicion="grave")], count=None),
        SimpleNamespace(data=[{"id": "rep-1"}], count=None),
    ])
    asignaciones_q = make_query(execute_results=[
        SimpleNamespace(data=[], count=None),
        SimpleNamespace(data=[{"asociacion_id": "aso-1"}], count=None),
    ])
    tablas = {
        "reportes": reportes,
        "reporte_asignaciones": asignaciones_q,
        "asignacion_estados": make_query(data=[{"id": "rechazada-id"}]),
        "reporte_estados": make_query(data=[{"id": "sin-cobertura-id"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    def contactos_por_especie(*, tipo_animal, municipio):
        compartido = {"id": "contacto-compartido", "nombre": "Protección Animal"}
        if tipo_animal == "perro":
            return [compartido, {"id": "contacto-perro", "nombre": "Rescate Canino"}]
        return [compartido]

    resultado, asignar, contactos, _ = ejecutar_rechazo(
        supabase,
        asignar=lambda *args, **kwargs: None,
        contactos=contactos_por_especie,
    )

    assert asignar.call_args.kwargs["tipos_animales"] == ["perro", "gato"]
    assert asignar.call_args.kwargs["es_critico"] is True
    assert [c.kwargs["tipo_animal"] for c in contactos.call_args_list] == ["perro", "gato"]
    assert [c["id"] for c in resultado["contactos_emergencia"]] == [
        "contacto-compartido", "contacto-perro",
    ]
    assert resultado["estado"] == "sin_cobertura"


def test_motivo_foto_no_es_animal_cierra_sin_reasignar(make_query):
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[base_reporte()], count=None),
        SimpleNamespace(data=[{"id": "rep-1"}], count=None),
    ])
    asignaciones_q = make_query(data=[])
    tablas = {
        "reportes": reportes,
        "reporte_asignaciones": asignaciones_q,
        "asignacion_estados": make_query(data=[{"id": "rechazada-id"}]),
        "reporte_estados": make_query(data=[{"id": "cerrado-id"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    resultado, asignar, contactos, _ = ejecutar_rechazo(
        supabase,
        asignar=lambda *args, **kwargs: {"id": "aso-2", "nombre": "Huellitas"},
        contactos=lambda **kwargs: [],
        motivo_clave="foto_no_es_animal",
    )

    # No se busca ni se reasigna a otra asociación por este motivo.
    asignar.assert_not_called()
    contactos.assert_not_called()
    asignaciones_q.insert.assert_not_called()

    assert resultado == {
        "mensaje": "Reporte rechazado y cerrado — la fotografía no corresponde a un animal real.",
        "estado": "cerrado",
    }
    actualizacion = reportes.update.call_args.args[0]
    assert actualizacion["estado_reporte"] == "cerrado"
    assert actualizacion["estado_cobertura"] == "finalizado"
    assert "asociacion_asignada_id" not in actualizacion
