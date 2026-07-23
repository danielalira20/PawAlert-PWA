from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BASE_DATA = {
    "nombre": "Rescate Animal AC",
    "nombre_responsable": "Ana",
    "apellido_responsable": "López",
    "contacto_telefono": "5512345678",
    "contacto_email": "ana@rescate.com",
    "password": "Segura123",
    "tipos_animales": '["perro"]',
    "latitud": "19.04",
    "longitud": "-98.19",
    "radio_km": "10",
}


def test_association_telefono_invalido():
    data = {**BASE_DATA, "contacto_telefono": "123"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "10 dígitos" in response.json()["detail"]


def test_association_email_invalido():
    data = {**BASE_DATA, "contacto_email": "no-es-un-email"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "correo" in response.json()["detail"].lower()


def test_association_password_corta():
    data = {**BASE_DATA, "password": "123"}
    response = client.post("/associations", data=data)
    assert response.status_code == 422
    assert "6 caracteres" in response.json()["detail"]


def test_associations_me_reportes_sin_token():
    response = client.get("/associations/me/reportes")
    assert response.status_code == 401


def test_associations_me_reportes_token_invalido():
    # El fallo se simula localmente: nunca se envía el token falso a Supabase.
    with patch("app.api.associations.supabase.auth.get_user", side_effect=Exception("token inválido")):
        response = client.get(
            "/associations/me/reportes",
            headers={"Authorization": "Bearer token_falso_invalido"}
        )
    assert response.status_code == 401


def test_registro_asociacion_devuelve_access_y_refresh_token(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"id": "aso-1"}]),
        "roles": make_query(data=[{"id": "rol-asociacion"}]),
        "usuarios": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "user-aso-1"}], count=None),
        ]),
        "asociacion_tipo_animal": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    auth_creado = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    login = SimpleNamespace(session=SimpleNamespace(
        access_token="access-asociacion",
        refresh_token="refresh-asociacion",
    ))

    with (
        patch("app.api.associations.supabase", supabase),
        patch("app.api.associations.supabase_admin") as admin,
        patch("app.api.associations.get_fresh_client") as fresh_client,
        patch("app.api.associations.obtener_id_catalogo", return_value="tipo-perro-id"),
    ):
        admin.auth.admin.create_user.return_value = auth_creado
        fresh_client.return_value.auth.sign_in_with_password.return_value = login
        response = client.post("/associations", data=BASE_DATA)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"] == "access-asociacion"
    assert body["refresh_token"] == "refresh-asociacion"
    assert body["usuario"]["id"] == "user-aso-1"


def _mock_usuario_autenticado(tablas: dict, make_query) -> None:
    """Fila de `usuarios` que resuelve `_obtener_usuario_autenticado`: rol
    'asociacion' vinculado a 'aso-1' — reusada por las pruebas del
    historial de reporte."""
    tablas["usuarios"] = make_query(data=[{
        "id": "user-1",
        "asociacion_id": "aso-1",
        "roles": {"nombre": "asociacion"},
    }])


def test_historial_reporte_caso_feliz(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reportes": make_query(data=[{
            "id": "reporte-1",
            "created_at": "2026-07-20T10:00:00+00:00",
            "asociacion_asignada_id": "aso-1",
            "usuario_id": None,
            "reportante_nombre": "Juan",
            "reportante_apellido_paterno": "Pérez",
            "animal": [{
                "orden": 1,
                "descripcion": "Cojea de la pata trasera derecha",
                "condicion_catalogo": {"clave": "grave"},
                "animal_fotos": [{"foto_url": "https://x/foto-reporte.jpg", "orden": 1}],
            }],
        }]),
        "historial_reporte": make_query(data=[
            {
                "tipo_evento": "hito_llegue_refugio",
                "created_at": "2026-07-20T11:00:00+00:00",
                "datos_extra": {"foto_url": "https://x/foto-refugio.jpg", "condicion_observada": "Igual que en el reporte"},
                "usuarios": {"nombre": "Carlos", "apellido_paterno": "Ruiz"},
            },
            {
                "tipo_evento": "hito_encontre_animal",
                "created_at": "2026-07-20T10:30:00+00:00",
                "datos_extra": {
                    "foto_url": "https://x/foto-encontrado.jpg",
                    "condicion_observada": "Peor de lo esperado",
                    "comentario": "Tiene una herida en la pata",
                },
                "usuarios": {"nombre": "Carlos", "apellido_paterno": "Ruiz"},
            },
            {
                "tipo_evento": "caso_cerrado",
                "created_at": "2026-07-20T12:00:00+00:00",
                "datos_extra": {
                    "estado_anterior": "rescatado",
                    "estado_nuevo": "cerrado",
                    "conclusion": "Animal rescatado y estable",
                    "notas": "Se quedó en el refugio",
                },
                "usuarios": {"nombre": "Ana", "apellido_paterno": "Gómez"},
            },
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.get(
            "/associations/me/reportes/reporte-1/historial",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reporte_id"] == "reporte-1"
    tipos = [e["tipo_evento"] for e in body["eventos"]]
    # Orden cronológico (created_at asc), sin importar el orden en que
    # historial_reporte haya regresado los hitos. "caso_cerrado" queda al
    # final porque su created_at es el más reciente, no por un caso especial.
    assert tipos == ["reporte_creado", "hito_encontre_animal", "hito_llegue_refugio", "caso_cerrado"]

    creado = body["eventos"][0]
    assert creado["foto_url"] == "https://x/foto-reporte.jpg"
    assert creado["reportante_nombre"] == "Juan Pérez"
    assert creado["nota"] == "Cojea de la pata trasera derecha"

    encontrado = body["eventos"][1]
    assert encontrado["foto_url"] == "https://x/foto-encontrado.jpg"
    assert encontrado["usuario_nombre"] == "Carlos Ruiz"
    # condicion_observada (opción elegida) + comentario (texto libre), no el
    # "descripcion" genérico que escribe registrar_historial() para hitos.
    assert encontrado["nota"] == "Peor de lo esperado — Tiene una herida en la pata"

    refugio = body["eventos"][2]
    assert refugio["foto_url"] == "https://x/foto-refugio.jpg"
    assert refugio["usuario_nombre"] == "Carlos Ruiz"
    assert refugio["nota"] == "Igual que en el reporte"

    cierre = body["eventos"][3]
    assert cierre["foto_url"] is None
    assert cierre["usuario_nombre"] == "Ana Gómez"
    # conclusion (elegida en "¿Cómo concluyó el rescate?") + notas libres,
    # no condicion_observada/comentario — esos campos son de los hitos.
    assert cierre["nota"] == "Animal rescatado y estable — Se quedó en el refugio"


def test_historial_reporte_sin_hitos(make_query):
    tablas = {
        "asociaciones": make_query(data=[{"verificado": True}]),
        "reportes": make_query(data=[{
            "id": "reporte-2",
            "created_at": "2026-07-21T09:00:00+00:00",
            "asociacion_asignada_id": "aso-1",
            "usuario_id": None,
            "reportante_nombre": None,
            "reportante_apellido_paterno": None,
            "animal": [],
        }]),
        "historial_reporte": make_query(data=[]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with patch("app.api.associations.supabase", supabase):
        response = client.get(
            "/associations/me/reportes/reporte-2/historial",
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["eventos"]) == 1
    assert body["eventos"][0]["tipo_evento"] == "reporte_creado"
    assert body["eventos"][0]["nota"] is None
    assert body["eventos"][0]["foto_url"] is None
    assert body["eventos"][0]["reportante_nombre"] == "anónimo"
