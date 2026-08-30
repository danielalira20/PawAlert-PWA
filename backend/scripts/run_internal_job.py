"""Invoca un endpoint interno de PawAlert y termina para Railway Cron."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


JOB_PATHS = {
    "events-lifecycle": "/internal/events/lifecycle/run",
    "push": "/internal/push/run",
}
DEFAULT_TIMEOUT_SECONDS = 120


class InternalJobError(RuntimeError):
    """Error seguro para mostrar en logs del servicio cron."""


def _build_url(backend_url: str, job_name: str) -> str:
    if job_name not in JOB_PATHS:
        raise InternalJobError("Trabajo interno no soportado")

    parsed = urlsplit(backend_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise InternalJobError("BACKEND_URL debe ser una URL HTTP valida")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise InternalJobError("BACKEND_URL no debe incluir credenciales, query o fragmento")

    base_path = parsed.path.rstrip("/")
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            f"{base_path}{JOB_PATHS[job_name]}",
            "",
            "",
        )
    )


def run_internal_job(
    job_name: str,
    *,
    backend_url: str,
    cron_secret: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Ejecuta un job y valida tanto HTTP como el resultado de negocio."""
    if not cron_secret.strip():
        raise InternalJobError("CRON_SECRET no esta configurado")
    if timeout_seconds <= 0:
        raise InternalJobError("El timeout debe ser mayor que cero")

    request = Request(
        _build_url(backend_url, job_name),
        data=b"",
        headers={
            "Accept": "application/json",
            "X-Cron-Secret": cron_secret,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status = response.status
            raw_body = response.read().decode("utf-8")
    except HTTPError as error:
        raise InternalJobError(
            f"El endpoint interno respondio HTTP {error.code}"
        ) from error
    except (URLError, TimeoutError) as error:
        raise InternalJobError(
            "No se pudo conectar con el backend dentro del timeout"
        ) from error

    if not 200 <= status < 300:
        raise InternalJobError(f"El endpoint interno respondio HTTP {status}")

    try:
        payload = json.loads(raw_body)
    except (TypeError, ValueError) as error:
        raise InternalJobError(
            "El endpoint interno no devolvio JSON valido"
        ) from error

    if not isinstance(payload, dict):
        raise InternalJobError("La respuesta del endpoint debe ser un objeto JSON")
    if payload.get("estado") == "error" or payload.get("error"):
        raise InternalJobError("El endpoint reporto un resultado de error")

    return payload


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Ejecuta un job interno protegido de PawAlert."
    )
    parser.add_argument("job", choices=sorted(JOB_PATHS))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    backend_url = os.getenv("BACKEND_URL", "")
    cron_secret = os.getenv("CRON_SECRET", "")

    try:
        payload = run_internal_job(
            args.job,
            backend_url=backend_url,
            cron_secret=cron_secret,
        )
    except InternalJobError as error:
        print(f"[cron:{args.job}] error: {error}", file=sys.stderr)
        return 1

    print(
        f"[cron:{args.job}] completado: "
        f"{json.dumps(payload, ensure_ascii=True, sort_keys=True)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
