import json
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import pytest

from scripts import run_internal_job as runner


class _Response:
    def __init__(self, payload: dict, status: int = 200):
        self.status = status
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_eventos_invoca_endpoint_con_secreto_y_normaliza_url():
    response = _Response({"run_id": "run-1", "estado": "completado"})
    with patch.object(runner, "urlopen", return_value=response) as open_url:
        result = runner.run_internal_job(
            "events-lifecycle",
            backend_url="https://backend.test/",
            cron_secret="secret-test",
        )

    request = open_url.call_args.args[0]
    assert request.full_url == (
        "https://backend.test/internal/events/lifecycle/run"
    )
    assert request.method == "POST"
    assert request.get_header("X-cron-secret") == "secret-test"
    assert open_url.call_args.kwargs["timeout"] == 120
    assert result["estado"] == "completado"


def test_push_acepta_resultado_de_dispatch():
    with patch.object(
        runner,
        "urlopen",
        return_value=_Response({"enviada": 2, "omitida": 1}),
    ):
        result = runner.run_internal_job(
            "push",
            backend_url="https://backend.test",
            cron_secret="secret-test",
        )

    assert result == {"enviada": 2, "omitida": 1}


@pytest.mark.parametrize(
    "payload",
    [
        {"run_id": "run-1", "estado": "error"},
        {"error": "firebase_admin not initialized"},
    ],
)
def test_resultado_logico_de_error_hace_fallar_cron(payload):
    with patch.object(runner, "urlopen", return_value=_Response(payload)):
        with pytest.raises(runner.InternalJobError):
            runner.run_internal_job(
                "events-lifecycle",
                backend_url="https://backend.test",
                cron_secret="secret-test",
            )


def test_error_http_se_sanitiza_sin_imprimir_respuesta():
    error = HTTPError(
        "https://backend.test/internal/push/run",
        503,
        "Service Unavailable",
        {},
        BytesIO(b'{"detail":"database connection secret"}'),
    )
    with patch.object(runner, "urlopen", side_effect=error):
        with pytest.raises(runner.InternalJobError) as raised:
            runner.run_internal_job(
                "push",
                backend_url="https://backend.test",
                cron_secret="secret-test",
            )

    assert str(raised.value) == "El endpoint interno respondio HTTP 503"
    assert "database" not in str(raised.value)


def test_error_de_red_no_expone_url_ni_secreto():
    with patch.object(
        runner, "urlopen", side_effect=URLError("connection refused")
    ):
        with pytest.raises(runner.InternalJobError) as raised:
            runner.run_internal_job(
                "push",
                backend_url="https://backend.test",
                cron_secret="secret-test",
            )

    assert "backend.test" not in str(raised.value)
    assert "secret-test" not in str(raised.value)


@pytest.mark.parametrize(
    "backend_url",
    ["", "backend.test", "ftp://backend.test", "https://user:pass@backend.test"],
)
def test_rechaza_backend_url_invalida(backend_url):
    with pytest.raises(runner.InternalJobError):
        runner.run_internal_job(
            "push",
            backend_url=backend_url,
            cron_secret="secret-test",
        )


def test_main_devuelve_uno_sin_configuracion_y_no_imprime_secreto(capsys):
    with patch.dict("os.environ", {}, clear=True):
        exit_code = runner.main(["events-lifecycle"])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "CRON_SECRET" in captured.err
    assert captured.out == ""


def test_main_imprime_resultado_seguro_y_devuelve_cero(capsys):
    with (
        patch.dict(
            "os.environ",
            {"BACKEND_URL": "https://backend.test", "CRON_SECRET": "secret"},
            clear=True,
        ),
        patch.object(
            runner,
            "run_internal_job",
            return_value={"run_id": "run-1", "estado": "completado"},
        ),
    ):
        exit_code = runner.main(["events-lifecycle"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert '"estado": "completado"' in captured.out
    assert "secret" not in captured.out
