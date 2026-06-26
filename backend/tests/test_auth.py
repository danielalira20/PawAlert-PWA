import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)


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
    assert "usuario" in data
