import math
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.services import road_risk_service


@pytest.fixture(autouse=True)
def _clear_road_risk_cache():
    road_risk_service._cache.clear()
    yield
    road_risk_service._cache.clear()


def _offset_deg(distancia_m: float) -> float:
    """Grados de latitud equivalentes a distancia_m metros hacia el norte,
    usando el mismo radio terrestre que road_risk_service -- para
    construir geometrías de prueba con una distancia esperada exacta."""
    return math.degrees(distancia_m / road_risk_service._EARTH_RADIUS_M)


# ─── Selección pura (_select_road) ───


def test_selecciona_unica_via_dentro_del_radio():
    offset = _offset_deg(30)
    elements = [
        {
            "type": "way",
            "tags": {"highway": "primary"},
            "geometry": [{"lat": 19.04 + offset, "lon": -98.20}],
        },
    ]

    resultado = road_risk_service._select_road(19.04, -98.20, elements)

    assert resultado is not None
    tipo, distancia = resultado
    assert tipo == "primary"
    assert abs(distancia - 30) < 0.01


def test_prioriza_motorway_sobre_trunk_y_primary_aunque_no_sea_la_mas_cercana():
    offset_cerca = _offset_deg(10)
    offset_lejos = _offset_deg(45)
    elements = [
        {"tags": {"highway": "primary"}, "geometry": [{"lat": 19.04 + offset_cerca, "lon": -98.20}]},
        {"tags": {"highway": "trunk"}, "geometry": [{"lat": 19.04 + offset_cerca, "lon": -98.20}]},
        {"tags": {"highway": "motorway"}, "geometry": [{"lat": 19.04 + offset_lejos, "lon": -98.20}]},
    ]

    tipo, distancia = road_risk_service._select_road(19.04, -98.20, elements)

    assert tipo == "motorway"
    assert abs(distancia - 45) < 0.01


def test_elige_la_mas_cercana_dentro_del_mismo_tipo():
    offset_cerca = _offset_deg(12)
    offset_lejos = _offset_deg(40)
    elements = [
        {"tags": {"highway": "trunk"}, "geometry": [{"lat": 19.04 + offset_lejos, "lon": -98.20}]},
        {"tags": {"highway": "trunk"}, "geometry": [{"lat": 19.04 + offset_cerca, "lon": -98.20}]},
    ]

    tipo, distancia = road_risk_service._select_road(19.04, -98.20, elements)

    assert tipo == "trunk"
    assert abs(distancia - 12) < 0.01


def test_ninguna_via_no_selecciona_nada():
    assert road_risk_service._select_road(19.04, -98.20, []) is None


def test_clamp_a_50m_recorta_y_deja_warning_visible(caplog):
    # Overpass ya garantiza <=50m vía around:50; esta geometría de prueba
    # (60m) simula el desacuerdo por redondeo de la reproyección local que
    # el clamp existe para absorber.
    offset = _offset_deg(60)
    elements = [
        {"tags": {"highway": "primary"}, "geometry": [{"lat": 19.04 + offset, "lon": -98.20}]},
    ]

    with caplog.at_level("WARNING", logger="app.services.road_risk_service"):
        tipo, distancia = road_risk_service._select_road(19.04, -98.20, elements)

    assert tipo == "primary"
    assert distancia == 50.0
    assert len(caplog.records) == 1
    mensaje = caplog.records[0].getMessage()
    assert "60.00" in mensaje
    assert "primary" in mensaje
    assert "se recorta a 50.0" in mensaje


def test_sin_clamp_no_hay_warning(caplog):
    offset = _offset_deg(30)
    elements = [
        {"tags": {"highway": "primary"}, "geometry": [{"lat": 19.04 + offset, "lon": -98.20}]},
    ]

    with caplog.at_level("WARNING", logger="app.services.road_risk_service"):
        road_risk_service._select_road(19.04, -98.20, elements)

    assert caplog.records == []


def test_ignora_elementos_mal_formados_sin_reventar():
    offset = _offset_deg(20)
    elements = [
        {"tags": {"highway": "residential"}, "geometry": [{"lat": 19.04, "lon": -98.20}]},  # no relevante
        {"tags": None, "geometry": [{"lat": 19.04, "lon": -98.20}]},
        {"tags": {"highway": "primary"}, "geometry": None},
        "no-es-un-dict",
        {"tags": {"highway": "primary"}, "geometry": [{"lat": 19.04 + offset, "lon": -98.20}]},
    ]

    tipo, distancia = road_risk_service._select_road(19.04, -98.20, elements)

    assert tipo == "primary"
    assert abs(distancia - 20) < 0.01


# ─── Llamada HTTP simulada (_fetch_from_provider) ───


def _mock_response(status_code: int, payload: dict | None = None):
    respuesta = MagicMock()
    respuesta.status_code = status_code
    if payload is not None:
        respuesta.json.return_value = payload
    return respuesta


def _payload_sin_vias():
    return {"elements": []}


def _payload_con_una_via():
    offset = _offset_deg(15)
    return {
        "elements": [
            {
                "type": "way",
                "tags": {"highway": "primary"},
                "geometry": [{"lat": 19.04 + offset, "lon": -98.20}],
            }
        ]
    }


def test_fetch_completo_con_via_cercana():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_con_una_via())
    ) as mock_post:
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert resultado.score == 100
    assert resultado.road_type == "primary"
    assert abs(resultado.distance_m - 15) < 0.01
    assert mock_post.call_count == 1


def test_fetch_completo_sin_vias_cercanas():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert resultado.score == 0
    assert resultado.road_type is None
    assert resultado.distance_m is None


def test_fetch_401_no_autorizado():
    with patch.object(road_risk_service.httpx, "post", return_value=_mock_response(401)):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.unauthorized


def test_fetch_429_limite_de_tasa():
    with patch.object(road_risk_service.httpx, "post", return_value=_mock_response(429)):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.rate_limited


def test_fetch_5xx_error_de_proveedor():
    with patch.object(road_risk_service.httpx, "post", return_value=_mock_response(500)):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.provider_error


def test_fetch_timeout_hace_maximo_un_reintento():
    with patch.object(
        road_risk_service.httpx,
        "post",
        side_effect=httpx.TimeoutException("timeout"),
    ) as mock_post:
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.timeout
    assert mock_post.call_count == 2  # 1 intento + 1 reintento


def test_fetch_406_en_primer_intento_y_200_en_segundo_recupera_resultado_completo():
    """Overpass reparte trafico entre instancias espejo y al menos una
    responde 406 de forma intermitente ante la misma solicitud exacta --
    un fallo transitorio del proveedor, no de nuestro request. El
    reintento (mismo _MAX_ATTEMPTS de siempre) ya debe cubrir esto."""
    respuestas = [_mock_response(406), _mock_response(200, _payload_con_una_via())]
    with patch.object(road_risk_service.httpx, "post", side_effect=respuestas) as mock_post:
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert resultado.score == 100
    assert resultado.road_type == "primary"
    assert mock_post.call_count == 2


def test_fetch_406_en_ambos_intentos_es_unavailable():
    respuestas = [_mock_response(406), _mock_response(406)]
    with patch.object(road_risk_service.httpx, "post", side_effect=respuestas) as mock_post:
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    # 406 no tiene mapeo propio en _error_code_for_status -- cae en el
    # caso default (provider_error), lo cual es el comportamiento
    # esperado, no un código nuevo inventado para 406.
    assert resultado.error_code == ExternalSignalErrorCode.provider_error
    assert mock_post.call_count == 2


def test_request_overpass_envia_accept_y_user_agent():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ) as mock_post:
        road_risk_service._fetch_from_provider(19.04, -98.20)

    headers_enviados = mock_post.call_args.kwargs["headers"]
    assert headers_enviados["Accept"] == "*/*"
    assert headers_enviados["User-Agent"] == "PawAlert-PWA/1.0 (contacto@pawalert.example)"


def test_fetch_json_sin_elements_no_propaga_excepcion():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, {"unexpected": "shape"})
    ):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.invalid_response


def test_fetch_json_con_elements_no_lista_no_propaga_excepcion():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, {"elements": "no-es-lista"})
    ):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.error_code == ExternalSignalErrorCode.invalid_response


def test_fetch_nunca_devuelve_score_ante_fallo_tecnico():
    with patch.object(road_risk_service.httpx, "post", return_value=_mock_response(500)):
        resultado = road_risk_service._fetch_from_provider(19.04, -98.20)

    assert resultado.score is None


# ─── Caché (get_road_risk) ───


def test_get_road_risk_primera_llamada_consulta_y_cachea():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ) as mock_post:
        resultado = road_risk_service.get_road_risk(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.complete
    assert mock_post.call_count == 1
    assert road_risk_service._cache[(19.04, -98.20)].status == ExternalSignalStatus.complete


def test_get_road_risk_misma_coordenada_exacta_usa_cache():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ) as mock_post:
        primera = road_risk_service.get_road_risk(19.04, -98.20)
        segunda = road_risk_service.get_road_risk(19.04, -98.20)

    assert mock_post.call_count == 1
    assert segunda.status == ExternalSignalStatus.cached
    assert segunda.score == primera.score


def test_get_road_risk_coordenada_que_redondea_igual_a_4_decimales_usa_cache():
    # 19.04213 y 19.04211 redondean ambos a 19.0421
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ) as mock_post:
        road_risk_service.get_road_risk(19.04213, -98.20)
        segunda = road_risk_service.get_road_risk(19.04211, -98.20)

    assert mock_post.call_count == 1
    assert segunda.status == ExternalSignalStatus.cached


def test_get_road_risk_coordenada_que_redondea_distinto_no_usa_cache():
    # 19.04213 redondea a 19.0421; 19.04217 redondea a 19.0422
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
    ) as mock_post:
        road_risk_service.get_road_risk(19.04213, -98.20)
        segunda = road_risk_service.get_road_risk(19.04217, -98.20)

    assert mock_post.call_count == 2
    assert segunda.status == ExternalSignalStatus.complete


def test_get_road_risk_con_via_encontrada_tambien_se_cachea():
    with patch.object(
        road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_con_una_via())
    ) as mock_post:
        primera = road_risk_service.get_road_risk(19.04, -98.20)
        segunda = road_risk_service.get_road_risk(19.04, -98.20)

    assert mock_post.call_count == 1
    assert primera.road_type == "primary"
    assert segunda.status == ExternalSignalStatus.cached
    assert segunda.road_type == primera.road_type
    assert segunda.distance_m == primera.distance_m


def test_get_road_risk_falla_sin_cache_previo_devuelve_unavailable():
    with patch.object(
        road_risk_service.httpx, "post", side_effect=httpx.TimeoutException("timeout")
    ):
        resultado = road_risk_service.get_road_risk(19.04, -98.20)

    assert resultado.status == ExternalSignalStatus.unavailable
    assert resultado.score is None
    # Un fallo no debe quedar cacheado -- la próxima llamada debe reintentar.
    assert (19.04, -98.20) not in road_risk_service._cache


def test_get_road_risk_cache_no_expira_por_tiempo():
    """A diferencia de weather_service (que sí expira caché por TTL), aquí
    no existe _CACHE_TTL ni equivalente: una vez cacheado, el resultado se
    sirve indefinidamente. Se simula el paso de meses mockeando datetime.now
    y se confirma que la segunda llamada, mucho más tarde, sigue sin volver
    a golpear Overpass."""
    assert not hasattr(road_risk_service, "_CACHE_TTL")
    assert not hasattr(road_risk_service, "_STALE_CACHE_TTL")

    momento_inicial = datetime(2026, 8, 12, 12, 0, tzinfo=timezone.utc)
    meses_despues = datetime(2026, 12, 1, 8, 0, tzinfo=timezone.utc)

    mock_datetime = MagicMock()
    mock_datetime.now.side_effect = [momento_inicial, meses_despues]

    with (
        patch.object(road_risk_service, "datetime", mock_datetime),
        patch.object(
            road_risk_service.httpx, "post", return_value=_mock_response(200, _payload_sin_vias())
        ) as mock_post,
    ):
        primera = road_risk_service.get_road_risk(19.04, -98.20)
        segunda = road_risk_service.get_road_risk(19.04, -98.20)

    assert mock_post.call_count == 1
    assert primera.calculated_at == momento_inicial
    assert segunda.status == ExternalSignalStatus.cached
    assert segunda.calculated_at == meses_despues
