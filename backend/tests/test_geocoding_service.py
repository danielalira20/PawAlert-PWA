import asyncio

from app.services import geocoding_service as service


class _Respuesta:
    def raise_for_status(self):
        return None

    def json(self):
        return [
            {
                "lat": "19.0432",
                "lon": "-98.1987",
                "display_name": "Centro, Puebla, México",
                "address": {
                    "road": "Calle 3 Sur",
                    "suburb": "Centro",
                    "city": "Puebla",
                    "state": "Puebla",
                },
            }
        ]


class _Cliente:
    def __init__(self, *args, **kwargs):
        self.llamada = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url, *, params, headers):
        self.llamada = (url, params, headers)
        assert params["countrycodes"] == "mx"
        assert headers["User-Agent"].startswith("PawAlert/")
        return _Respuesta()


def test_geocodifica_y_cachea_direccion(monkeypatch):
    service._cache.clear()
    service._ultima_consulta = 0.0
    monkeypatch.setattr(service.httpx, "AsyncClient", _Cliente)

    primera = asyncio.run(
        service.geocodificar_direccion("Calle 3 Sur 905, Centro, Puebla")
    )
    segunda = asyncio.run(
        service.geocodificar_direccion("Calle 3 Sur 905, Centro, Puebla")
    )

    assert primera == segunda
    assert primera["latitud"] == 19.0432
    assert primera["longitud"] == -98.1987
    assert primera["municipio"] == "Puebla"
    assert primera["colonia"] == "Centro"


def test_normaliza_direccion_de_puebla_como_respaldo():
    variantes = service._variantes_consulta(
        "Calle 3 Sur 905, colonia Centro, Puebla, Puebla"
    )
    assert variantes == [
        "Calle 3 Sur 905, colonia Centro, Puebla, Puebla",
        "Calle 3 Sur 905, Centro, Heroica Puebla de Zaragoza, Puebla, México",
    ]
