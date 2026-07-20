import sys
from types import ModuleType
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


# `app.api.auth` importa Twilio al cargar la aplicación, pero el paquete no
# está declarado actualmente en requirements.txt. Estas pruebas no ejercitan
# SMS: instalamos un módulo ficticio solo en el proceso de pytest para que la
# colección siga aislada, sin cambiar dependencias ni código de producción.
try:
    from twilio.rest import Client as _TwilioClient  # noqa: F401
except ModuleNotFoundError:
    twilio_module = ModuleType("twilio")
    twilio_rest_module = ModuleType("twilio.rest")
    twilio_rest_module.Client = MagicMock
    twilio_module.rest = twilio_rest_module
    sys.modules["twilio"] = twilio_module
    sys.modules["twilio.rest"] = twilio_rest_module


@pytest.fixture
def animal_payload():
    """Contrato mínimo vigente de un elemento de POST /reports.animales."""
    return {
        "condicion": "estable",
        "tipo_animal": "perro",
        "tamanio": "mediano",
        "cantidad": 1,
        "es_grupo": False,
    }


@pytest.fixture
def reporte_multi_animal():
    return {
        "id": "reporte-1",
        "asociacion_asignada_id": "asociacion-1",
        "animales": [
            {"tipo_animal": "perro", "tamanio": "mediano", "condicion": "estable", "cantidad": 1},
            {"tipo_animal": "gato", "tamanio": "pequeno", "condicion": "grave", "cantidad": 3},
        ],
    }


def query_mock(*, data=None, count=None, execute_results=None):
    """Crea una cadena fluida tipo supabase.table(...).select(...).eq(...).execute().

    Cada prueba conserva acceso al MagicMock para comprobar filtros y escrituras.
    `execute_results` permite simular varias ejecuciones sobre la misma tabla.
    """
    query = MagicMock()
    for method in (
        "select", "eq", "neq", "gte", "lte", "is_", "not_", "in_",
        "order", "limit", "single", "insert", "update", "delete",
    ):
        getattr(query, method).return_value = query

    if execute_results is not None:
        query.execute.side_effect = [
            result if hasattr(result, "data") else SimpleNamespace(data=result, count=None)
            for result in execute_results
        ]
    else:
        query.execute.return_value = SimpleNamespace(data=data, count=count)
    return query


@pytest.fixture
def make_query():
    return query_mock
