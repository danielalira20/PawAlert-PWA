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
    response = client.get(
        "/associations/me/reportes",
        headers={"Authorization": "Bearer token_falso_invalido"}
    )
    assert response.status_code == 401
