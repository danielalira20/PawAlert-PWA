from __future__ import annotations

import math
import mimetypes
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.db.supabase import supabase_admin


GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files"
MAX_VIDEO_BYTES = 500 * 1024 * 1024
COINCIDENCIA_MAX_M = 250
IMPRECISA_MAX_M = 500


class EvidenciaTemporal(BaseModel):
    momento: str = Field(description="Marca de tiempo aproximada, por ejemplo 00:18")
    observacion: str


class AnalisisVideoHogar(BaseModel):
    observabilidad: Literal["completa", "parcial", "insuficiente"]
    resumen_breve: str
    areas_observadas: list[str]
    caracteristicas_visibles: list[str]
    condiciones_aparentes: list[str]
    riesgos_aparentes: list[str]
    otros_animales_visibles: list[str]
    espacios_aislamiento_visibles: list[str]
    puntos_no_observados: list[str]
    evidencias_temporales: list[EvidenciaTemporal]


ANALISIS_SCHEMA = {
    "type": "object",
    "properties": {
        "observabilidad": {
            "type": "string",
            "enum": ["completa", "parcial", "insuficiente"],
        },
        "resumen_breve": {"type": "string"},
        "areas_observadas": {"type": "array", "items": {"type": "string"}},
        "caracteristicas_visibles": {
            "type": "array",
            "items": {"type": "string"},
        },
        "condiciones_aparentes": {
            "type": "array",
            "items": {"type": "string"},
        },
        "riesgos_aparentes": {"type": "array", "items": {"type": "string"}},
        "otros_animales_visibles": {
            "type": "array",
            "items": {"type": "string"},
        },
        "espacios_aislamiento_visibles": {
            "type": "array",
            "items": {"type": "string"},
        },
        "puntos_no_observados": {
            "type": "array",
            "items": {"type": "string"},
        },
        "evidencias_temporales": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "momento": {"type": "string"},
                    "observacion": {"type": "string"},
                },
                "required": ["momento", "observacion"],
            },
        },
    },
    "required": [
        "observabilidad",
        "resumen_breve",
        "areas_observadas",
        "caracteristicas_visibles",
        "condiciones_aparentes",
        "riesgos_aparentes",
        "otros_animales_visibles",
        "espacios_aislamiento_visibles",
        "puntos_no_observados",
        "evidencias_temporales",
    ],
}


PROMPT_ANALISIS = """
Analiza exclusivamente lo que sea visible en este recorrido de una posible
casa temporal para animales. Tu resultado será evidencia de apoyo para una
asociación protectora y, si existe visita, para la persona verificadora.

Reglas obligatorias:
- Describe hechos visibles y limita claramente lo que no se alcanzó a ver.
- No apruebes, rechaces, califiques ni recomiendes una decisión.
- No infieras identidad, propiedad de la vivienda, vacunación, ubicación
  exacta, medidas exactas ni información que el video no demuestre.
- No afirmes que un espacio es seguro; describe características o riesgos
  aparentes que una persona deberá comprobar.
- Usa lenguaje neutral, breve y respetuoso en español.
- Incluye marcas de tiempo aproximadas solo cuando ayuden a localizar evidencia.
""".strip()


ISO6709_RE = re.compile(
    rb"([+-]\d{1,3}(?:\.\d+))([+-]\d{1,3}(?:\.\d+))(?:[+-]\d+(?:\.\d+)?)?/?"
)
LOCATION_MARKERS = (
    b"com.apple.quicktime.location.iso6709",
    b"\xa9xyz",
    b"location",
)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _actualizar_verificacion(verificacion_id: str, valores: dict) -> None:
    supabase_admin.table("verificaciones_hogar").update({
        **valores,
        "updated_at": _ahora(),
    }).eq("id", verificacion_id).execute()


def extraer_coordenadas_video(ruta: str) -> dict | None:
    """Busca coordenadas ISO 6709 asociadas a metadatos QuickTime/MP4.

    La ausencia es neutral. Se exige una etiqueta cercana para evitar tomar
    números arbitrarios del contenido binario como coordenadas.
    """
    overlap = b""
    with open(ruta, "rb") as video:
        while True:
            chunk = video.read(1024 * 1024)
            if not chunk:
                break
            data = overlap + chunk
            data_lower = data.lower()
            for marker in LOCATION_MARKERS:
                inicio = 0
                while True:
                    posicion = data_lower.find(marker, inicio)
                    if posicion < 0:
                        break
                    ventana = data[max(0, posicion - 128):posicion + 2048]
                    coincidencia = ISO6709_RE.search(ventana)
                    if coincidencia:
                        latitud = float(coincidencia.group(1))
                        longitud = float(coincidencia.group(2))
                        if -90 <= latitud <= 90 and -180 <= longitud <= 180:
                            return {
                                "latitud": latitud,
                                "longitud": longitud,
                                "fuente": (
                                    "quicktime_iso6709"
                                    if b"iso6709" in marker
                                    else "metadatos_video"
                                ),
                            }
                    inicio = posicion + len(marker)
            overlap = data[-4096:]
    return None


def distancia_metros(
    latitud_a: float,
    longitud_a: float,
    latitud_b: float,
    longitud_b: float,
) -> float:
    radio_tierra_m = 6_371_000
    lat_a = math.radians(latitud_a)
    lat_b = math.radians(latitud_b)
    delta_lat = math.radians(latitud_b - latitud_a)
    delta_lng = math.radians(longitud_b - longitud_a)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lng / 2) ** 2
    )
    return 2 * radio_tierra_m * math.asin(math.sqrt(haversine))


def validar_coordenadas_video(
    ruta: str,
    latitud_declarada: float | None,
    longitud_declarada: float | None,
) -> dict:
    coordenadas = extraer_coordenadas_video(ruta)
    if not coordenadas:
        return {
            "estado": "sin_metadatos",
            "detalle": {
                "mensaje": (
                    "El video no contiene metadatos de ubicación utilizables. "
                    "Este resultado es neutral."
                ),
            },
        }

    if latitud_declarada is None or longitud_declarada is None:
        return {
            "estado": "imprecisa",
            "latitud": coordenadas["latitud"],
            "longitud": coordenadas["longitud"],
            "fuente": coordenadas["fuente"],
            "detalle": {
                "mensaje": "No existe una ubicación declarada para comparar.",
            },
        }

    distancia = distancia_metros(
        float(latitud_declarada),
        float(longitud_declarada),
        coordenadas["latitud"],
        coordenadas["longitud"],
    )
    if distancia <= COINCIDENCIA_MAX_M:
        estado = "coincide"
    elif distancia <= IMPRECISA_MAX_M:
        estado = "imprecisa"
    else:
        estado = "discrepancia"

    return {
        "estado": estado,
        "latitud": coordenadas["latitud"],
        "longitud": coordenadas["longitud"],
        "distancia_m": round(distancia, 1),
        "fuente": coordenadas["fuente"],
        "detalle": {
            "umbral_coincidencia_m": COINCIDENCIA_MAX_M,
            "umbral_discrepancia_m": IMPRECISA_MAX_M,
            "mensaje": (
                "La ubicación es una señal de apoyo y no constituye una "
                "decisión automática."
            ),
        },
    }


def _descargar_video(url: str) -> tuple[str, str]:
    extension = Path(urlparse(url).path).suffix or ".mp4"
    temporal = tempfile.NamedTemporaryFile(delete=False, suffix=extension)
    ruta = temporal.name
    total = 0
    try:
        with temporal, httpx.stream(
            "GET",
            url,
            follow_redirects=True,
            timeout=httpx.Timeout(120.0),
        ) as respuesta:
            respuesta.raise_for_status()
            mime_type = (
                respuesta.headers.get("content-type", "").split(";")[0]
                or mimetypes.guess_type(url)[0]
                or "video/mp4"
            )
            for fragmento in respuesta.iter_bytes():
                total += len(fragmento)
                if total > MAX_VIDEO_BYTES:
                    raise ValueError("El video supera el límite de procesamiento")
                temporal.write(fragmento)
        return ruta, mime_type
    except Exception:
        if os.path.exists(ruta):
            os.unlink(ruta)
        raise


def _gemini_headers() -> dict[str, str]:
    return {"x-goog-api-key": settings.gemini_api_key}


def _subir_video_gemini(ruta: str, mime_type: str) -> dict:
    tamanio = os.path.getsize(ruta)
    inicio = httpx.post(
        GEMINI_UPLOAD_URL,
        headers={
            **_gemini_headers(),
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(tamanio),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        },
        json={"file": {"display_name": f"pawalert-{Path(ruta).name}"}},
        timeout=30.0,
    )
    inicio.raise_for_status()
    upload_url = inicio.headers.get("x-goog-upload-url")
    if not upload_url:
        raise RuntimeError("Gemini no devolvió una URL de carga")

    def contenido():
        with open(ruta, "rb") as archivo:
            while fragmento := archivo.read(1024 * 1024):
                yield fragmento

    carga = httpx.post(
        upload_url,
        headers={
            "Content-Length": str(tamanio),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        },
        content=contenido(),
        timeout=httpx.Timeout(300.0),
    )
    carga.raise_for_status()
    archivo = carga.json().get("file") or {}
    if not archivo.get("name"):
        raise RuntimeError("Gemini no confirmó el archivo cargado")
    return archivo


def _esperar_archivo_gemini(archivo: dict) -> dict:
    limite = time.monotonic() + settings.gemini_file_timeout_seconds
    actual = archivo
    while time.monotonic() < limite:
        estado = (actual.get("state") or "").upper()
        if estado == "ACTIVE":
            return actual
        if estado == "FAILED":
            raise RuntimeError("Gemini no pudo procesar el video")
        time.sleep(2)
        respuesta = httpx.get(
            f"https://generativelanguage.googleapis.com/v1beta/{actual['name']}",
            headers=_gemini_headers(),
            timeout=30.0,
        )
        respuesta.raise_for_status()
        actual = respuesta.json()
    raise TimeoutError("Gemini tardó demasiado en preparar el video")


def _analizar_con_gemini(archivo: dict) -> AnalisisVideoHogar:
    respuesta = httpx.post(
        (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        ),
        headers={**_gemini_headers(), "Content-Type": "application/json"},
        json={
            "contents": [{
                "role": "user",
                "parts": [
                    {
                        "file_data": {
                            "file_uri": archivo["uri"],
                            "mime_type": archivo.get("mimeType", "video/mp4"),
                        },
                    },
                    {"text": PROMPT_ANALISIS},
                ],
            }],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "responseJsonSchema": ANALISIS_SCHEMA,
            },
        },
        timeout=httpx.Timeout(300.0),
    )
    respuesta.raise_for_status()
    cuerpo = respuesta.json()
    try:
        texto = cuerpo["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError("Gemini no devolvió un análisis utilizable") from error
    return AnalisisVideoHogar.model_validate_json(texto)


def _eliminar_archivo_gemini(nombre: str | None) -> None:
    if not nombre:
        return
    try:
        httpx.delete(
            f"https://generativelanguage.googleapis.com/v1beta/{nombre}",
            headers=_gemini_headers(),
            timeout=30.0,
        )
    except Exception:
        pass


def analizar_video_gemini(ruta: str, mime_type: str) -> dict:
    archivo = None
    try:
        archivo = _subir_video_gemini(ruta, mime_type)
        archivo = _esperar_archivo_gemini(archivo)
        analisis = _analizar_con_gemini(archivo)
        return {
            "version": 1,
            "generado_at": _ahora(),
            "modelo": settings.gemini_model,
            **analisis.model_dump(mode="json"),
            "advertencia": (
                "Observaciones automáticas de apoyo. Una persona debe revisar "
                "el video y tomar la decisión."
            ),
        }
    finally:
        _eliminar_archivo_gemini((archivo or {}).get("name"))


def procesar_evidencia_verificacion(
    verificacion_id: str,
    forzar: bool = False,
) -> dict:
    """Procesa coordenadas y Gemini sin bloquear ni decidir la postulación."""
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, perfil_casa_temporal_id, analisis_video_estado"
    ).eq("id", verificacion_id).limit(1).execute()
    if not verificacion.data:
        return {"estado": "no_encontrada"}

    registro = verificacion.data[0]
    estado_actual = registro.get("analisis_video_estado")
    if not forzar and estado_actual in (
        "procesando",
        "completado",
        "no_configurado",
    ):
        return {"estado": estado_actual, "omitido": True}

    perfil = supabase_admin.table("perfil_casa_temporal").select(
        "video_recorrido_url, latitud, longitud"
    ).eq("id", registro["perfil_casa_temporal_id"]).limit(1).execute()
    hogar = perfil.data[0] if perfil.data else {}
    video_url = hogar.get("video_recorrido_url")
    if not video_url:
        _actualizar_verificacion(verificacion_id, {
            "analisis_video_estado": "sin_video",
            "estado_coordenadas": "sin_video",
            "analisis_video_error": None,
            "analisis_video_procesado_at": _ahora(),
        })
        return {"estado": "sin_video"}

    _actualizar_verificacion(verificacion_id, {
        "analisis_video_estado": "procesando",
        "estado_coordenadas": "procesando",
        "analisis_video_error": None,
        "analisis_video_iniciado_at": _ahora(),
    })

    ruta = None
    try:
        ruta, mime_type = _descargar_video(video_url)
    except Exception as error:
        print(
            "[video_evidence] descarga fallida:",
            type(error).__name__,
        )
        _actualizar_verificacion(verificacion_id, {
            "analisis_video_estado": "fallido",
            "estado_coordenadas": "fallida",
            "analisis_video_error": "No fue posible descargar el video para analizarlo.",
            "analisis_video_procesado_at": _ahora(),
        })
        return {"estado": "fallido"}

    try:
        try:
            coordenadas = validar_coordenadas_video(
                ruta,
                hogar.get("latitud"),
                hogar.get("longitud"),
            )
            _actualizar_verificacion(verificacion_id, {
                "estado_coordenadas": coordenadas["estado"],
                "coordenadas_video_lat": coordenadas.get("latitud"),
                "coordenadas_video_lng": coordenadas.get("longitud"),
                "distancia_coordenadas_m": coordenadas.get("distancia_m"),
                "coordenadas_fuente": coordenadas.get("fuente"),
                "coordenadas_detalle": coordenadas.get("detalle") or {},
            })
        except Exception as error:
            print(
                "[video_evidence] metadatos fallidos:",
                type(error).__name__,
            )
            _actualizar_verificacion(verificacion_id, {
                "estado_coordenadas": "fallida",
                "coordenadas_detalle": {
                    "mensaje": "No fue posible revisar los metadatos del video.",
                },
            })

        if not settings.gemini_api_key:
            _actualizar_verificacion(verificacion_id, {
                "analisis_video_estado": "no_configurado",
                "analisis_video_modelo": settings.gemini_model,
                "analisis_video_error": None,
                "analisis_video_procesado_at": _ahora(),
            })
            return {"estado": "no_configurado"}

        try:
            analisis = analizar_video_gemini(ruta, mime_type)
            _actualizar_verificacion(verificacion_id, {
                "analisis_video": analisis,
                "analisis_video_estado": "completado",
                "analisis_video_modelo": settings.gemini_model,
                "analisis_video_error": None,
                "analisis_video_procesado_at": _ahora(),
            })
            return {"estado": "completado", "analisis": analisis}
        except Exception as error:
            print(
                "[video_evidence] Gemini falló:",
                type(error).__name__,
            )
            _actualizar_verificacion(verificacion_id, {
                "analisis_video_estado": "fallido",
                "analisis_video_modelo": settings.gemini_model,
                "analisis_video_error": (
                    "No fue posible generar observaciones automáticas. "
                    "El video continúa disponible para revisión manual."
                ),
                "analisis_video_procesado_at": _ahora(),
            })
            return {"estado": "fallido"}
    finally:
        if ruta and os.path.exists(ruta):
            os.unlink(ruta)
