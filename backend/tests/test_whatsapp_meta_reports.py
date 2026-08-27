import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import whatsapp_report_service as service


def test_verificacion_webhook_meta(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_meta_verify_token", "token-prueba")
    cliente = TestClient(app)

    respuesta = cliente.get(
        "/webhooks/meta/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "token-prueba",
            "hub.challenge": "12345",
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.text == "12345"


def test_webhook_rechaza_firma_invalida(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_meta_app_secret", "app-secret")
    cliente = TestClient(app)

    respuesta = cliente.post(
        "/webhooks/meta/whatsapp",
        json={"object": "whatsapp_business_account", "entry": []},
        headers={"X-Hub-Signature-256": "sha256=incorrecta"},
    )

    assert respuesta.status_code == 403


def test_webhook_acepta_firma_y_delega(monkeypatch):
    secreto = "app-secret"
    payload = {"object": "whatsapp_business_account", "entry": []}
    cuerpo = json.dumps(payload, separators=(",", ":")).encode()
    firma = "sha256=" + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    recibidos = []

    async def procesar(payload_recibido):
        recibidos.append(payload_recibido)

    monkeypatch.setattr(settings, "whatsapp_meta_app_secret", secreto)
    monkeypatch.setattr("app.api.webhooks.procesar_webhook_meta", procesar)
    cliente = TestClient(app)

    respuesta = cliente.post(
        "/webhooks/meta/whatsapp",
        content=cuerpo,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": firma},
    )

    assert respuesta.status_code == 200
    assert recibidos == [payload]


def test_extrae_texto_y_ubicacion_del_payload():
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {"id": "uno", "from": "5211111111111", "type": "text", "text": {"body": "Hola"}},
                                {
                                    "id": "dos",
                                    "from": "5211111111111",
                                    "type": "location",
                                    "location": {"latitude": 19.4, "longitude": -99.1},
                                },
                            ]
                        }
                    }
                ]
            }
        ]
    }

    mensajes = service._extraer_mensajes(payload)

    assert service._contenido(mensajes[0]) == ("text", "Hola")
    assert service._contenido(mensajes[1]) == (
        "location",
        {"latitud": 19.4, "longitud": -99.1, "nombre": None, "direccion": None},
    )


def test_extrae_imagen_de_meta():
    assert service._contenido(
        {
            "type": "image",
            "image": {"id": "media-1", "mime_type": "image/jpeg", "sha256": "hash"},
        }
    ) == (
        "image",
        {"media_id": "media-1", "mime_type": "image/jpeg", "sha256": "hash"},
    )


def test_valida_opciones_con_acentos():
    assert service._validar_respuesta("tamanio", "text", "Pequeño") == (
        True,
        "pequeno",
        None,
    )
    valido, _, mensaje = service._validar_respuesta("condicion", "text", "no sé")
    assert valido is False
    assert "estable" in mensaje


def test_normaliza_telefono_mexicano():
    assert service._telefono_local("5212212848351") == "2212848351"
    assert service._telefono_local("522212848351") == "2212848351"


def test_ruta_individual_incluye_campos_condicionales():
    respuestas = {"cantidad": 1, "tipo_animal": "perro", "sexo": "hembra"}
    assert service._siguiente_estado("tamanio", respuestas) == "sexo"
    assert service._siguiente_estado("edad", respuestas) == "raza"
    assert service._siguiente_estado("comportamiento", respuestas) == "esta_prenada"


def test_ruta_grupo_omite_ficha_individual():
    respuestas = {"cantidad": 4, "tipo_animal": "gato"}
    assert service._siguiente_estado("tamanio", respuestas) == "edad"
    assert service._siguiente_estado("edad", respuestas) == "descripcion"


def test_foto_es_aceptada_y_omitir_se_distingue():
    foto = {"media_id": "media-1", "mime_type": "image/jpeg"}
    assert service._validar_respuesta("foto", "image", foto) == (True, foto, None)
    assert service._validar_respuesta("foto", "text", "OMITIR") == (True, None, None)
