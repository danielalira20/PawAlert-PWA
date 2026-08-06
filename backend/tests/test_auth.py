from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

REGISTER_BASE_DATA = {
    "email": "ana@test.com",
    "password": "Segura123",
    "nombre": "Ana",
    "apellido_paterno": "López",
    "telefono": "5512345678",
}


def test_login_credenciales_invalidas():
    with patch("app.api.auth.get_fresh_client") as mock_client:
        mock_client.return_value.auth.sign_in_with_password.side_effect = Exception("Invalid credentials")
        response = client.post("/auth/login", json={
            "email": "noexiste@test.com",
            "password": "wrongpass",
        })
    assert response.status_code == 401
    assert "contraseña" in response.json()["detail"].lower() or "incorrectos" in response.json()["detail"].lower()


def test_login_devuelve_token():
    mock_session = MagicMock()
    mock_session.session.access_token = "token_de_prueba_123"
    mock_session.session.refresh_token = "refresh_de_prueba_456"
    mock_session.user.id = "auth-user-uuid"

    mock_usuario = MagicMock()
    mock_usuario.data = [{
        "id": "usuario-uuid",
        "nombre": "Ana",
        "apellido_paterno": "López",
        "apellido_materno": None,
        "email": "ana@test.com",
        "telefono": "5512345678",
        "asociacion_id": "asoc-uuid",
        "roles": None,
    }]

    with patch("app.api.auth.get_fresh_client") as mock_client, \
         patch("app.api.auth.supabase") as mock_supa:

        mock_client.return_value.auth.sign_in_with_password.return_value = mock_session
        mock_supa.auth.get_user.return_value = mock_session
        mock_supa.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_usuario

        response = client.post("/auth/login", json={
            "email": "ana@test.com",
            "password": "Segura123",
        })

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["access_token"] == "token_de_prueba_123"
    assert data["refresh_token"] == "refresh_de_prueba_456"
    assert "usuario" in data


def test_register_nombre_invalido_devuelve_422(make_query):
    # El chequeo de nombre corre antes de tocar la BD, salvo por el select
    # de verificaciones_telefono que ocurre siempre al inicio de register().
    tablas = {"verificaciones_telefono": make_query(data=[])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch("app.api.auth.supabase", supabase):
        response = client.post("/auth/register", json={**REGISTER_BASE_DATA, "nombre": "Ana2"})

    assert response.status_code == 422
    assert response.json()["detail"] == "El nombre solo puede contener letras y espacios."


def test_register_apellido_paterno_muy_corto_devuelve_422(make_query):
    tablas = {"verificaciones_telefono": make_query(data=[])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch("app.api.auth.supabase", supabase):
        response = client.post("/auth/register", json={**REGISTER_BASE_DATA, "apellido_paterno": "Lo"})

    assert response.status_code == 422
    assert response.json()["detail"] == "El apellido paterno debe tener al menos 3 caracteres."


def test_register_nombre_valido_pasa_el_chequeo_y_crea_cuenta(make_query):
    tablas = {
        "verificaciones_telefono": make_query(data=[]),
        "usuarios": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),  # existe (por telefono): no hay cuenta previa
            SimpleNamespace(data=[{"id": "nuevo-user-id"}], count=None),  # insert
            SimpleNamespace(data=[{"roles": None}], count=None),  # rol_result
        ]),
        "roles": make_query(data=[{"id": "rol-reportante-id"}]),
        "perfil_apoyo": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    auth_creado = SimpleNamespace(user=SimpleNamespace(id="auth-user-nuevo"))
    login = SimpleNamespace(session=SimpleNamespace(access_token="tok-nuevo", refresh_token="reftok-nuevo"))

    with (
        patch("app.api.auth.supabase", supabase),
        patch("app.api.auth.supabase_admin") as admin,
        patch("app.api.auth.get_fresh_client") as fresh_client,
    ):
        admin.auth.admin.create_user.return_value = auth_creado
        fresh_client.return_value.auth.sign_in_with_password.return_value = login
        response = client.post("/auth/register", json=REGISTER_BASE_DATA)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"] == "tok-nuevo"
    assert body["usuario"]["nombre"] == "Ana"
