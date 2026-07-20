import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.api import reports
from app.models.report import RechazarReporteRequest


def base_reporte():
    return {
        "id": "rep-1",
        "estado_reporte": "asignado",
        "asociacion_asignada_id": "aso-1",
        "latitud": 19.0432,
        "longitud": -98.1987,
        "municipio": "Puebla",
        "animal": [
            {"orden": 1, "tipo_animal_catalogo": {"clave": "perro"}},
            {"orden": 2, "tipo_animal_catalogo": {"clave": "gato"}},
            {"orden": 3, "tipo_animal_catalogo": {"clave": "perro"}},
        ],
    }


def ejecutar_rechazo(supabase, asignar, contactos):
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
            "rep-1", RechazarReporteRequest(motivo="Sin espacio", comentario="Caso grande"), "Bearer token"
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
    )
    contactos.assert_not_called()
    assert resultado["nueva_asociacion"] == "Huellitas"
    assert reportes.update.call_args.args[0]["asociacion_asignada_id"] == "aso-2"


def test_sin_cobertura_busca_contactos_por_especie_y_deduplica(make_query):
    reportes = make_query(execute_results=[
        SimpleNamespace(data=[base_reporte()], count=None),
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
    assert [c.kwargs["tipo_animal"] for c in contactos.call_args_list] == ["perro", "gato"]
    assert [c["id"] for c in resultado["contactos_emergencia"]] == [
        "contacto-compartido", "contacto-perro",
    ]
    assert resultado["estado"] == "sin_cobertura"
