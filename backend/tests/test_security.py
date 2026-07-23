from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.api import associations, reports
from app.main import app
from app.services import report_service, voluntario_service


client = TestClient(app)


def test_cambio_estado_sin_token_devuelve_401():
    response = client.patch("/reports/rep-1/status", json={"estado": "en_camino"})
    assert response.status_code == 401


def test_cambio_estado_bloquea_reporte_de_otra_asociacion(make_query):
    query = make_query(data=[{"id": "rep-1", "asociacion_asignada_id": "aso-ajena"}])
    supabase = MagicMock()
    supabase.table.return_value = query

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={
            "id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-propia",
        }),
        patch.object(reports, "supabase", supabase),
        patch.object(reports, "cambiar_estado_reporte", new_callable=AsyncMock) as cambiar,
    ):
        response = client.patch(
            "/reports/rep-1/status",
            json={"estado": "en_camino"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
    cambiar.assert_not_awaited()


def test_cambio_estado_permite_a_asociacion_duena(make_query):
    query = make_query(data=[{"id": "rep-1", "asociacion_asignada_id": "aso-1"}])
    supabase = MagicMock()
    supabase.table.return_value = query

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={
            "id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-1",
        }),
        patch.object(reports, "supabase", supabase),
        patch.object(
            reports, "cambiar_estado_reporte", new_callable=AsyncMock,
            return_value={"id": "rep-1", "estado": "en_camino", "updated_at": "ahora"},
        ) as cambiar,
    ):
        response = client.patch(
            "/reports/rep-1/status",
            json={"estado": "en_camino"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200
    cambiar.assert_awaited_once_with(
        "rep-1", "en_camino", conclusion=None, notas=None, usuario_id="user-aso", foto_url=None
    )


def test_cerrar_caso_registra_conclusion_notas_y_usuario(make_query):
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1", "estado_reporte": "rescatado", "usuario_id": None,
            "updated_at": "2026-07-23T12:00:00+00:00",
        }]),
        "reporte_estados": make_query(data=[{"id": "estado-cerrado"}]),
        "asignacion_estados": make_query(data=[{"id": "asignacion-completada"}]),
        "reporte_asignaciones": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(report_service, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        import asyncio
        resultado = asyncio.run(report_service.cambiar_estado_reporte(
            "rep-1", "cerrado",
            conclusion="Animal rescatado y estable",
            notas="Se llevó al refugio sin incidentes",
            usuario_id="user-aso-1",
            foto_url="https://x/foto-cierre.jpg",
        ))

    assert resultado["estado"] == "cerrado"
    historial.assert_called_once_with(
        reporte_id="rep-1",
        usuario_id="user-aso-1",
        tipo_evento="caso_cerrado",
        descripcion="Caso cerrado: Animal rescatado y estable — Se llevó al refugio sin incidentes",
        datos_extra={
            "estado_anterior": "rescatado",
            "estado_nuevo": "cerrado",
            "conclusion": "Animal rescatado y estable",
            "notas": "Se llevó al refugio sin incidentes",
            "foto_url": "https://x/foto-cierre.jpg",
        },
    )


def test_cerrar_caso_sin_foto_no_incluye_foto_url(make_query):
    # La foto es opcional: si no se adjunta, el cierre debe seguir
    # funcionando igual que antes, solo con foto_url=None en datos_extra.
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1", "estado_reporte": "rescatado", "usuario_id": None,
            "updated_at": "2026-07-23T12:00:00+00:00",
        }]),
        "reporte_estados": make_query(data=[{"id": "estado-cerrado"}]),
        "asignacion_estados": make_query(data=[{"id": "asignacion-completada"}]),
        "reporte_asignaciones": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(report_service, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        import asyncio
        resultado = asyncio.run(report_service.cambiar_estado_reporte(
            "rep-1", "cerrado",
            conclusion="Animal rescatado y estable",
            usuario_id="user-aso-1",
        ))

    assert resultado["estado"] == "cerrado"
    _, kwargs = historial.call_args
    assert kwargs["datos_extra"]["foto_url"] is None


def test_transicion_no_cerrado_mantiene_historial_generico(make_query):
    # Cualquier transición que no sea el cierre del caso debe seguir
    # exactamente igual que antes: tipo_evento genérico y usuario_id=None,
    # sin importar si el llamador manda usuario_id/conclusion/notas o no.
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1", "estado_reporte": "asignado", "usuario_id": None,
            "updated_at": "2026-07-23T12:00:00+00:00",
        }]),
        "reporte_estados": make_query(data=[{"id": "estado-en-camino"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(report_service, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        import asyncio
        resultado = asyncio.run(report_service.cambiar_estado_reporte("rep-1", "en_camino"))

    assert resultado["estado"] == "en_camino"
    historial.assert_called_once_with(
        reporte_id="rep-1",
        usuario_id=None,
        tipo_evento="estado_cambiado",
        descripcion="Estado cambiado de asignado a en_camino",
        datos_extra={"estado_anterior": "asignado", "estado_nuevo": "en_camino", "razon": None},
    )


def test_busqueda_telefono_sin_token_devuelve_401():
    response = client.get("/users/phone/5512345678")
    assert response.status_code == 401


def test_mapa_publico_redondea_coordenadas(make_query):
    query = make_query(data=[{
        "id": "rep-1",
        "estado_reporte": "pendiente",
        "latitud": 19.0432167,
        "longitud": -98.1987654,
        "municipio": "Puebla",
        "colonia": "Centro",
        "created_at": "2026-07-19T10:00:00+00:00",
        "animal": [],
    }])
    supabase = MagicMock()
    supabase.table.return_value = query

    with patch.object(report_service, "supabase", supabase):
        import asyncio
        resultado = asyncio.run(report_service.obtener_reportes())

    assert resultado[0]["latitud"] == 19.043
    assert resultado[0]["longitud"] == -98.199


def test_reportes_asociacion_conservan_coordenadas_exactas(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reporte_asignaciones": make_query(data=[{
            "id": "asig-1", "assigned_at": "2026-07-19T10:00:00+00:00",
            "accepted_at": None, "closed_at": None, "notas": None,
            "asignacion_estados": {"clave": "notificada", "descripcion": "Notificada"},
            "reportes": {
                "id": "rep-1", "estado_reporte": "en_camino", "confirmacion_voluntario": "confirmado",
                "municipio": "Puebla", "colonia": "Centro", "calle": "1 Oriente",
                "latitud": 19.0432167, "longitud": -98.1987654,
                "created_at": "2026-07-19T10:00:00+00:00", "animal": [],
            },
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(associations, "_obtener_usuario_autenticado", return_value={
            "id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-1",
        }),
        patch.object(associations, "supabase", supabase),
    ):
        import asyncio
        resultado = asyncio.run(associations.get_reportes_asignados("Bearer token"))

    assert resultado[0]["latitud"] == 19.0432167
    assert resultado[0]["longitud"] == -98.1987654


def test_reportes_voluntario_conservan_coordenadas_exactas(make_query):
    tablas = {
        "voluntarios": make_query(data=[{"id": "vol-1", "estado": "activo_nivel_1"}]),
        "capacidades": make_query(data=[{"latitud": 19.0, "longitud": -98.0}]),
        "reportes": make_query(data=[{
            "id": "rep-1", "estado_reporte": "en_camino", "confirmacion_voluntario": "confirmado",
            "municipio": "Puebla", "colonia": "Centro", "calle": "1 Oriente", "referencia": None,
            "latitud": 19.0432167, "longitud": -98.1987654,
            "created_at": "2026-07-19T10:00:00+00:00",
            "asociaciones": {"nombre": "Patitas", "contacto_telefono": "5512345678"},
            "animal": [],
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(voluntario_service, "supabase", supabase):
        import asyncio
        resultado = asyncio.run(voluntario_service.obtener_reportes_voluntario("user-vol-1"))

    assert resultado["en_accion"][0]["latitud"] == 19.0432167
    assert resultado["en_accion"][0]["longitud"] == -98.1987654
