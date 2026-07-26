from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import reports
from app.services import report_service, red_aliados_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}


# ─── Unit: _nivel_urgencia_efectivo — puramente lógico, sin mocks ────────

@pytest.mark.parametrize(
    "condicion_animal,condicion_observada,esperado",
    [
        ("estable", "Igual que en el reporte", "no_urgente"),
        ("herido", "Igual que en el reporte", "urgente"),
        ("grave", "Igual que en el reporte", "critico"),
        ("estable", "Peor de lo esperado", "urgente"),
        ("herido", "Peor de lo esperado", "urgente"),
        ("grave", "Peor de lo esperado", "critico"),  # ya estaba arriba, no baja
        ("estable", "En estado crítico", "critico"),
        ("herido", "En estado crítico", "critico"),
        ("grave", "No estaba en el lugar", None),
        ("estable", "No estaba en el lugar", None),
        ("herido", None, "urgente"),  # sin condicion_observada -> sin cambio
        ("estable", "valor-no-reconocido", "no_urgente"),  # desconocido -> sin cambio
        (None, "Igual que en el reporte", "no_urgente"),  # sin animal (defensivo)
    ],
)
def test_nivel_urgencia_efectivo(condicion_animal, condicion_observada, esperado):
    assert red_aliados_service._nivel_urgencia_efectivo(condicion_animal, condicion_observada) == esperado


# ─── Unit: sugerir_aliado_veterinario — RPC mockeado ─────────────────────

def test_sugerir_aliado_veterinario_con_match():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=[{
        "oferta_id": "oferta-1",
        "perfil_apoyo_id": "perfil-1",
        "usuario_id": "user-1",
        "nombre": "Clínica Vet Norte",
        "distancia_km": 3.2,
        "unidad": "citas",
        "capacidad_disponible": 2,
    }])

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.sugerir_aliado_veterinario("rep-1", "critico")

    assert resultado["nombre"] == "Clínica Vet Norte"
    assert resultado["nivel_urgencia"] == "critico"
    supabase.rpc.assert_called_once_with(
        "sugerencia_veterinaria_cercana",
        {"p_reporte_id": "rep-1", "p_nivel_urgencia": "critico"},
    )


def test_sugerir_aliado_veterinario_sin_match():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=[])

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.sugerir_aliado_veterinario("rep-1", "no_urgente")

    assert resultado is None


# ─── Integración: POST /reports/{id}/hitos ───────────────────────────────

def _mock_reporte_encontre_animal(make_query, *, condicion_clave="grave"):
    return {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(execute_results=[
            SimpleNamespace(data=[{
                "id": "rep-1",
                "estado_reporte": "en_camino",
                "staff_asignado_id": "staff-1",
                "asociacion_asignada_id": "aso-1",
            }], count=None),
            SimpleNamespace(data=[{"id": "rep-1"}], count=None),  # resultado del UPDATE de estado
            SimpleNamespace(data=[{
                "animal": [{"orden": 1, "condicion_catalogo": {"clave": condicion_clave}}],
            }], count=None),
        ]),
        "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
    }


def test_hito_encontre_animal_incluye_sugerencia_cuando_hay_match(make_query):
    tablas = _mock_reporte_encontre_animal(make_query, condicion_clave="grave")
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    sugerencia_mock = {
        "oferta_id": "oferta-1",
        "perfil_apoyo_id": "perfil-1",
        "nombre": "Clínica Vet Norte",
        "distancia_km": 1.8,
        "unidad": "citas",
        "capacidad_disponible": 1,
        "nivel_urgencia": "critico",
    }

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
        patch.object(red_aliados_service, "sugerir_aliado_veterinario", return_value=sugerencia_mock) as sugerir,
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "encontre_animal", "condicion_observada": "Igual que en el reporte"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["sugerencia_aliado"] == sugerencia_mock
    historial.assert_called_once()
    sugerir.assert_called_once_with("rep-1", "critico")  # grave + "sin cambio" -> critico


def test_hito_encontre_animal_no_estaba_en_el_lugar_no_ejecuta_matching(make_query):
    tablas = _mock_reporte_encontre_animal(make_query, condicion_clave="estable")
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial"),
        patch.object(red_aliados_service, "sugerir_aliado_veterinario") as sugerir,
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "encontre_animal", "condicion_observada": "No estaba en el lugar"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["sugerencia_aliado"] is None
    sugerir.assert_not_called()


def test_hito_llegue_refugio_no_ejecuta_matching(make_query):
    # tipo_hito distinto de "encontre_animal" -> la rama nueva ni se toca.
    # Ubicación exactamente igual a la de la asociación -> distancia 0,
    # pasa la validación existente de <200m sin modificarla.
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(execute_results=[
            SimpleNamespace(data=[{
                "id": "rep-1",
                "estado_reporte": "en_atencion",
                "staff_asignado_id": "staff-1",
                "asociacion_asignada_id": "aso-1",
            }], count=None),
            SimpleNamespace(data=[{"id": "rep-1"}], count=None),  # resultado del UPDATE de estado
        ]),
        "reporte_estados": make_query(data=[{"id": "estado-rescatado"}]),
        "asociaciones": make_query(data=[{"latitud": 19.04, "longitud": -98.19}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial"),
        patch.object(red_aliados_service, "sugerir_aliado_veterinario") as sugerir,
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={
                "tipo_hito": "llegue_refugio",
                "foto_url": "https://x/foto-refugio.jpg",
                "latitud": 19.04,
                "longitud": -98.19,
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["sugerencia_aliado"] is None
    sugerir.assert_not_called()


# ─── Integración: POST /reports/{id}/hitos con tipo_hito=llego_veterinaria ───
# BACK01/BACK02 - decisión de UX B: mismo gate estado_reporte == 'en_atencion'
# que los demás hitos; decisión A: sin select de estado, solo GPS+foto
# obligatorios validados contra la ubicación del aliado (no la asociación).

def test_hito_llego_veterinaria_estado_incorrecto_falla_400(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_camino",  # no en_atencion todavía
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "llego_veterinaria", "foto_url": "https://x/foto.jpg", "latitud": 19.04, "longitud": -98.19},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "en_atencion" in response.json()["detail"]


def test_hito_llego_veterinaria_sin_sugerencia_aceptada_falla_400(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_atencion",
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
        "contribuciones": make_query(data=[]),  # nadie aceptó ninguna sugerencia
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "llego_veterinaria", "foto_url": "https://x/foto.jpg", "latitud": 19.04, "longitud": -98.19},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "sugerencia de aliado veterinario aceptada" in response.json()["detail"]


def test_hito_llego_veterinaria_sin_gps_falla_422(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_atencion",
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
        "contribuciones": make_query(data=[{"id": "contrib-1", "oferta_proactiva_id": "oferta-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "llego_veterinaria", "foto_url": "https://x/foto.jpg"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "ubicación GPS es obligatoria" in response.json()["detail"]


def test_hito_llego_veterinaria_sin_foto_falla_422(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_atencion",
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
        "contribuciones": make_query(data=[{"id": "contrib-1", "oferta_proactiva_id": "oferta-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "llego_veterinaria", "latitud": 19.04, "longitud": -98.19},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 422
    assert "foto es obligatoria" in response.json()["detail"]


def test_hito_llego_veterinaria_lejos_de_la_veterinaria_falla_400(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_atencion",
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
        "contribuciones": make_query(data=[{"id": "contrib-1", "oferta_proactiva_id": "oferta-1"}]),
        "ofertas_proactivas": make_query(data=[{"perfil_apoyo_id": "perfil-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=[{
        "latitud": 19.04, "longitud": -98.19, "calle": None, "colonia": None, "municipio": None, "referencia": None,
    }])

    with patch.object(reports, "supabase", supabase):
        response = client.post(
            "/reports/rep-1/hitos",
            # A ~1500km de la veterinaria mockeada.
            json={"tipo_hito": "llego_veterinaria", "foto_url": "https://x/foto.jpg", "latitud": 32.5, "longitud": -117.0},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 400
    assert "no coincide con la veterinaria" in response.json()["detail"]


def test_hito_llego_veterinaria_caso_feliz_no_cambia_estado(make_query):
    tablas = {
        "usuarios": make_query(data=[{"id": "staff-1", "asociacion_id": "aso-1"}]),
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "en_atencion",
            "staff_asignado_id": "staff-1",
            "asociacion_asignada_id": "aso-1",
        }]),
        "contribuciones": make_query(data=[{"id": "contrib-1", "oferta_proactiva_id": "oferta-1"}]),
        "ofertas_proactivas": make_query(data=[{"perfil_apoyo_id": "perfil-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-staff-1"))
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=[{
        "latitud": 19.04, "longitud": -98.19, "calle": "Av. Test", "colonia": "Centro", "municipio": "Puebla", "referencia": None,
    }])

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post(
            "/reports/rep-1/hitos",
            json={"tipo_hito": "llego_veterinaria", "foto_url": "https://x/foto.jpg", "latitud": 19.04, "longitud": -98.19},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    body = response.json()
    # A diferencia de encontre_animal/llegue_refugio, este hito no toca
    # estado_reporte: solo queda registrado como evento de historial.
    assert body["estado"] is None
    historial.assert_called_once()
    tablas["reportes"].update.assert_not_called()
