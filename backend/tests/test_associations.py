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
