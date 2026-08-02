import json
from unittest.mock import MagicMock, patch

import httpx

from app.services import report_photo_vision_service as vision


def _mock_response(payload: dict):
    respuesta = MagicMock()
    respuesta.raise_for_status = MagicMock()
    respuesta.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]
    }
    return respuesta


def test_verificar_foto_animal_completado():
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(
            vision.httpx,
            "post",
            return_value=_mock_response({
                "es_animal_real": True,
                "categoria_rechazo": None,
                "confianza": 0.92,
                "condicion_estimada": "estable",
            }),
        ),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso", "image/jpeg")

    assert resultado["estado"] == "completado"
    assert resultado["es_animal_real"] is True
    assert resultado["condicion_estimada"] == "estable"
    assert resultado["modelo"] == vision.settings.gemini_model


def test_verificar_foto_animal_rechazo_por_peluche():
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(
            vision.httpx,
            "post",
            return_value=_mock_response({
                "es_animal_real": False,
                "categoria_rechazo": "peluche_o_figura",
                "confianza": 0.81,
                "condicion_estimada": None,
            }),
        ),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    assert resultado["estado"] == "completado"
    assert resultado["es_animal_real"] is False
    assert resultado["categoria_rechazo"] == "peluche_o_figura"


def test_verificar_foto_animal_error_tecnico_por_timeout():
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(
            vision.httpx,
            "post",
            side_effect=httpx.TimeoutException("tardó demasiado"),
        ),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    assert resultado["estado"] == "error_tecnico"
    assert "tardó" in resultado["detalle"]


def test_verificar_foto_animal_error_tecnico_por_http_error():
    respuesta = MagicMock()
    respuesta.raise_for_status.side_effect = httpx.HTTPStatusError(
        "500", request=MagicMock(), response=MagicMock()
    )
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(vision.httpx, "post", return_value=respuesta),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    assert resultado["estado"] == "error_tecnico"


def test_verificar_foto_animal_error_tecnico_por_json_malformado():
    respuesta = MagicMock()
    respuesta.raise_for_status = MagicMock()
    respuesta.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": "esto no es json"}]}}]
    }
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(vision.httpx, "post", return_value=respuesta),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    assert resultado["estado"] == "error_tecnico"


def test_verificar_foto_animal_sin_api_key_no_llama_http():
    with (
        patch.object(vision.settings, "gemini_api_key", ""),
        patch.object(vision.httpx, "post") as post_mock,
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    post_mock.assert_not_called()
    assert resultado["estado"] == "error_tecnico"


def test_verificar_foto_animal_trunca_detalle_a_200_caracteres():
    mensaje_largo = "x" * 500
    with (
        patch.object(vision.settings, "gemini_api_key", "clave-test"),
        patch.object(vision.httpx, "post", side_effect=RuntimeError(mensaje_largo)),
    ):
        resultado = vision.verificar_foto_animal(b"contenido-falso")

    assert len(resultado["detalle"]) == 200


def test_mensaje_rechazo_imagen_no_clara():
    assert vision.mensaje_rechazo("imagen_no_clara") == vision.MENSAJE_IMAGEN_NO_CLARA


def test_mensaje_rechazo_otras_categorias_usa_generico():
    for categoria in [
        "no_hay_animal",
        "peluche_o_figura",
        "captura_pantalla_o_descarga",
        None,
    ]:
        assert vision.mensaje_rechazo(categoria) == vision.MENSAJE_RECHAZO_GENERICO


def test_mensaje_advertencia_identificacion_devuelve_texto_esperado():
    assert vision.mensaje_advertencia_identificacion() == vision.MENSAJE_ADVERTENCIA_IDENTIFICACION
