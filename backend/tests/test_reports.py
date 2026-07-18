import json
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.services.report_service import _clasificar_escenario

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
        "escenario": 1,
        "animal": {
            "id": "animal-123",
            "tipo_animal_catalogo": {"clave": "perro"},
            "condicion_catalogo": {"clave": "estable"},
        },
        "foto_url": None,
        "animales_resumen": [
            {"tipo_animal": "perro", "condicion": "estable", "cantidad": 1, "foto_url": None},
        ],
    }]

    with patch("app.services.report_service.verificar_duplicados", return_value=duplicado_mock):
        response = client.post("/reports", data={
            "nombre": "Juan",
            "apellido_paterno": "Pérez",
            "telefono": "5512345678",
            "municipio": "Puebla",
            "animales": json.dumps([
                {"condicion": "estable", "tipo_animal": "perro", "tamanio": "mediano"},
            ]),
        })

    assert response.status_code == 200
    data = response.json()
    assert data.get("posible_duplicado") is True
    assert data.get("escenario") == 1
    assert data["reporte_existente"]["id"] == "abc-123"
    assert data["reporte_existente"]["animales"] == duplicado_mock[0]["animales_resumen"]


def test_report_detecta_duplicado_escenario_2_grupo():
    duplicado_mock = [{
        "id": "abc-456",
        "municipio": "Puebla",
        "colonia": "Centro",
        "created_at": "2026-01-01T00:00:00",
        "escenario": 2,
        "animal": {
            "id": "animal-456",
            "tipo_animal_catalogo": {"clave": "gato"},
            "condicion_catalogo": {"clave": "grave"},
        },
        "foto_url": None,
        "animales_resumen": [
            {"tipo_animal": "gato", "condicion": "grave", "cantidad": 5, "foto_url": None},
        ],
    }]

    with patch("app.services.report_service.verificar_duplicados", return_value=duplicado_mock):
        response = client.post("/reports", data={
            "nombre": "Juan",
            "apellido_paterno": "Pérez",
            "telefono": "5512345678",
            "municipio": "Puebla",
            "animales": json.dumps([
                {"condicion": "estable", "tipo_animal": "gato", "tamanio": "pequeno"},
            ]),
        })

    assert response.status_code == 200
    data = response.json()
    assert data.get("posible_duplicado") is True
    assert data.get("escenario") == 2


def test_clasificar_escenario_1_coincidencia_simple():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 1, "es_grupo": False}]}
    assert _clasificar_escenario(existente, ["perro-id"], 1) == 1


def test_clasificar_escenario_2_existente_es_grupo():
    existente = {"animales": [{"tipo_animal_id": "gato-id", "cantidad": 5, "es_grupo": True}]}
    assert _clasificar_escenario(existente, ["gato-id"], 1) == 2


def test_clasificar_escenario_none_por_especie_no_cubierta():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 1, "es_grupo": False}]}
    assert _clasificar_escenario(existente, ["gato-id"], 1) is None


def test_clasificar_escenario_none_por_cantidad_mayor_130_por_ciento():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 2, "es_grupo": True}]}
    assert _clasificar_escenario(existente, ["perro-id"], 10) is None
