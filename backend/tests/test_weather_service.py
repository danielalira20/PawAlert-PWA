from unittest.mock import MagicMock, patch

import httpx

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.services import weather_service


def test_clasifica_temperatura_normal_como_cero():
    assert weather_service._classify_temperature_score(24) == 0


def test_clasifica_calor_extremo_como_cien():
    assert weather_service._classify_temperature_score(37.2) == 100


def test_clasifica_frio_extremo_como_cien():
    assert weather_service._classify_temperature_score(2) == 100


def test_clasifica_condicion_normal_como_cero():
    assert weather_service._classify_condition_score(800) == 0


def test_clasifica_lluvia_moderada_como_cincuenta():
    assert weather_service._classify_condition_score(501) == 50


def test_clasifica_lluvia_intensa_como_cien():
    assert weather_service._classify_condition_score(502) == 100


def test_clasifica_tormenta_electrica_como_cien():
    assert weather_service._classify_condition_score(211) == 100


def test_gana_el_riesgo_mas_alto_entre_temperatura_y_condicion():
    assert weather_service._classify_score(temperature_c=24, condition_code=502) == 100
    assert weather_service._classify_score(temperature_c=37, condition_code=800) == 100
    assert weather_service._classify_score(temperature_c=24, condition_code=501) == 50
    assert weather_service._classify_score(temperature_c=24, condition_code=800) == 0


def _mock_response(status_code: int, payload: dict | None = None):
    respuesta = MagicMock()
    respuesta.status_code = status_code
    if payload is not None:
        respuesta.json.return_value = payload
    return respuesta


def _payload_normal():
    return {
        "main": {"temp": 24},
        "weather": [{"id": 800}],
        "dt": 1700000000,
    }


def test_fetch_completo_con_clima_normal():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx, "get", return_value=_mock_response(200, _payload_normal())
        ) as mock_get,
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert resultado.score == 0
    assert resultado.temperature_c == 24
    assert mock_get.call_count == 1


def test_fetch_sin_llave_configurada():
    with patch.object(weather_service.settings, "openweather_api_key", ""):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.score is None
    assert resultado.error_code == ExternalSignalErrorCode.not_configured


def test_fetch_401_no_autorizado():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(401)),
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.unauthorized


def test_fetch_429_limite_de_tasa():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(429)),
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.error_code == ExternalSignalErrorCode.rate_limited


def test_fetch_5xx_error_de_proveedor():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(500)),
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.error_code == ExternalSignalErrorCode.provider_error


def test_fetch_json_incompleto_es_invalido():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx, "get", return_value=_mock_response(200, {"main": {}})
        ),
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.invalid_response


def test_fetch_timeout_hace_maximo_un_reintento():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx,
            "get",
            side_effect=httpx.TimeoutException("timeout"),
        ) as mock_get,
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.timeout
    assert mock_get.call_count == 2


def test_fetch_nunca_devuelve_score_cero_ante_fallo_tecnico():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(500)),
    ):
        resultado = weather_service._fetch_from_provider(19.04, -98.20)

    assert resultado.score is None
