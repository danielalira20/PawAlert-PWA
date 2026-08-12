from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.services import weather_service


@pytest.fixture(autouse=True)
def _clear_weather_cache():
    weather_service._cache.clear()
    yield
    weather_service._cache.clear()


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
        "dt": int(datetime.now(timezone.utc).timestamp()),
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


def test_redondea_coordenadas_a_dos_decimales_para_la_llave_de_cache():
    assert weather_service._cache_key(19.0421, -98.2019) == (19.04, -98.20)
    assert weather_service._cache_key(19.0449, -98.2051) == (19.04, -98.21)


def test_get_weather_primera_llamada_consulta_al_proveedor_y_cachea():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx, "get", return_value=_mock_response(200, _payload_normal())
        ) as mock_get,
    ):
        resultado = weather_service.get_weather(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert mock_get.call_count == 1
    assert weather_service._cache[(19.04, -98.20)].status == ExternalSignalStatus.complete


def test_get_weather_reutiliza_cache_valido_sin_llamar_al_proveedor():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx, "get", return_value=_mock_response(200, _payload_normal())
        ) as mock_get,
    ):
        primera = weather_service.get_weather(19.04, -98.20)
        segunda = weather_service.get_weather(19.041, -98.199)

    assert mock_get.call_count == 1
    assert segunda.status == ExternalSignalStatus.cached
    assert segunda.score == primera.score
    assert segunda.temperature_c == primera.temperature_c


def test_get_weather_no_reutiliza_cache_vencido():
    vencido = weather_service.WeatherResult(
        score=0,
        status=ExternalSignalStatus.complete,
        temperature_c=24,
        precipitation_mm_h=0,
        condition_code=800,
        observed_at=datetime.now(timezone.utc) - timedelta(minutes=16),
        evaluated_at=datetime.now(timezone.utc) - timedelta(minutes=16),
    )
    weather_service._cache[(19.04, -98.20)] = vencido

    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(
            weather_service.httpx, "get", return_value=_mock_response(200, _payload_normal())
        ) as mock_get,
    ):
        resultado = weather_service.get_weather(19.04, -98.20)

    assert mock_get.call_count == 1
    assert resultado.status == ExternalSignalStatus.complete


def test_get_weather_usa_cache_vieja_util_cuando_el_proveedor_falla():
    vieja_pero_util = weather_service.WeatherResult(
        score=50,
        status=ExternalSignalStatus.complete,
        temperature_c=22,
        precipitation_mm_h=3,
        condition_code=501,
        observed_at=datetime.now(timezone.utc) - timedelta(minutes=25),
        evaluated_at=datetime.now(timezone.utc) - timedelta(minutes=25),
    )
    weather_service._cache[(19.04, -98.20)] = vieja_pero_util

    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(500)),
    ):
        resultado = weather_service.get_weather(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.stale_cache
    assert resultado.score == 50


def test_get_weather_sin_cache_util_devuelve_unavailable():
    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(500)),
    ):
        resultado = weather_service.get_weather(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.score is None


def test_get_weather_no_usa_cache_mas_vieja_de_30_minutos():
    demasiado_vieja = weather_service.WeatherResult(
        score=0,
        status=ExternalSignalStatus.complete,
        temperature_c=24,
        precipitation_mm_h=0,
        condition_code=800,
        observed_at=datetime.now(timezone.utc) - timedelta(minutes=31),
        evaluated_at=datetime.now(timezone.utc) - timedelta(minutes=31),
    )
    weather_service._cache[(19.04, -98.20)] = demasiado_vieja

    with (
        patch.object(weather_service.settings, "openweather_api_key", "clave-test"),
        patch.object(weather_service.httpx, "get", return_value=_mock_response(500)),
    ):
        resultado = weather_service.get_weather(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.score is None
