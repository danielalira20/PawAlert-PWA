import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)


def test_report_sin_nombre_ni_usuario_id():
    response = client.post("/reports", data={
        "condicion": "estable",
        "tipo_animal": "perro",
        "tamanio": "mediano",
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "nombre" in response.json()["detail"].lower() or "usuario_id" in response.json()["detail"].lower()


def test_report_sin_telefono_ni_usuario_id():
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "condicion": "estable",
        "tipo_animal": "perro",
        "tamanio": "mediano",
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "teléfono" in response.json()["detail"].lower() or "usuario_id" in response.json()["detail"].lower()


def test_report_telefono_invalido():
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "telefono": "123",
        "condicion": "estable",
        "tipo_animal": "perro",
        "tamanio": "mediano",
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "10 dígitos" in response.json()["detail"]


def test_report_sin_ubicacion():
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "telefono": "5512345678",
        "condicion": "estable",
        "tipo_animal": "perro",
        "tamanio": "mediano",
    })
    assert response.status_code == 422
    assert "ubicación" in response.json()["detail"].lower() or "municipio" in response.json()["detail"].lower()


def test_report_detecta_duplicado():
    duplicado_mock = [{
        "id": "abc-123",
        "municipio": "Puebla",
        "colonia": "Centro",
        "created_at": "2026-01-01T00:00:00",
        "animal": {
            "id": "animal-123",
            "tipo_animal_catalogo": {"clave": "perro"},
            "condicion_catalogo": {"clave": "estable"},
        },
        "foto_url": None,
    }]

    with patch("app.services.report_service.verificar_duplicados", return_value=duplicado_mock):
        response = client.post("/reports", data={
            "nombre": "Juan",
            "apellido_paterno": "Pérez",
            "telefono": "5512345678",
            "condicion": "estable",
            "tipo_animal": "perro",
            "tamanio": "mediano",
            "municipio": "Puebla",
        })

    assert response.status_code == 200
    data = response.json()
    assert data.get("posible_duplicado") is True
    assert data["reporte_existente"]["id"] == "abc-123"
