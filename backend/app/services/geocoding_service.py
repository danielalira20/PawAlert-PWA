"""Geocodificación puntual de direcciones escritas para reportes."""

from __future__ import annotations

import asyncio
import logging
import re
from time import monotonic
from typing import Any

import httpx

from app.config import settings


logger = logging.getLogger(__name__)

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
_cache: dict[str, dict[str, Any] | None] = {}
_lock = asyncio.Lock()
_ultima_consulta = 0.0


def _texto(valor: Any) -> str | None:
    texto = str(valor or "").strip()
    return texto or None


def _variantes_consulta(consulta: str) -> list[str]:
    variantes = [consulta]
    simplificada = re.sub(r"\bcolonia\s+", "", consulta, flags=re.IGNORECASE)
    if re.search(r",\s*Puebla\s*,\s*Puebla(?:\s*,|$)", simplificada, re.IGNORECASE):
        simplificada = re.sub(
            r",\s*Puebla\s*,\s*Puebla(?:\s*,\s*México)?$",
            ", Heroica Puebla de Zaragoza, Puebla, México",
            simplificada,
            flags=re.IGNORECASE,
        )
    elif not re.search(r"\bMéxico\s*$", simplificada, re.IGNORECASE):
        simplificada += ", México"
    if simplificada.casefold() != consulta.casefold():
        variantes.append(simplificada)
    return variantes


async def geocodificar_direccion(direccion: str) -> dict[str, Any] | None:
    """Devuelve coordenadas y componentes; un fallo nunca bloquea el reporte."""
    global _ultima_consulta

    consulta = " ".join(direccion.split()).strip()
    if len(consulta) < 8:
        return None
    clave = consulta.casefold()
    if clave in _cache:
        return _cache[clave]

    async with _lock:
        if clave in _cache:
            return _cache[clave]
        try:
            identificador = f"PawAlert/1.0 (+{settings.frontend_url})"
            async with httpx.AsyncClient(timeout=6.0) as client:
                resultados = []
                for variante in _variantes_consulta(consulta):
                    espera = 1.0 - (monotonic() - _ultima_consulta)
                    if espera > 0:
                        await asyncio.sleep(espera)
                    _ultima_consulta = monotonic()
                    respuesta = await client.get(
                        NOMINATIM_SEARCH_URL,
                        params={
                            "q": variante,
                            "format": "jsonv2",
                            "addressdetails": 1,
                            "limit": 1,
                            "countrycodes": "mx",
                            "accept-language": "es-MX",
                        },
                        headers={
                            "User-Agent": identificador,
                            "Referer": settings.frontend_url,
                        },
                    )
                    respuesta.raise_for_status()
                    resultados = respuesta.json()
                    if resultados:
                        break
            if not resultados:
                _cache[clave] = None
                return None
            primero = resultados[0]
            componentes = primero.get("address") or {}
            resultado = {
                "latitud": float(primero["lat"]),
                "longitud": float(primero["lon"]),
                "calle": _texto(componentes.get("road")),
                "colonia": _texto(
                    componentes.get("suburb")
                    or componentes.get("neighbourhood")
                    or componentes.get("quarter")
                ),
                "municipio": _texto(
                    componentes.get("city")
                    or componentes.get("town")
                    or componentes.get("municipality")
                    or componentes.get("county")
                ),
                "estado": _texto(componentes.get("state")),
                "nombre_formateado": _texto(primero.get("display_name")),
            }
            # Caché acotado en memoria para no repetir direcciones comunes.
            if len(_cache) >= 500:
                _cache.pop(next(iter(_cache)))
            _cache[clave] = resultado
            return resultado
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            logger.warning("No se pudo geocodificar la dirección: %s", error)
            _cache[clave] = None
            return None
