"""Verificacion visual de un avistamiento contra la(s) foto(s) originales
del animal reportado, via Gemini multimodal.

Mismo patron/estilo que custody_vision_service.py (comparacion multi-imagen,
nunca usada todavia en produccion) y report_photo_vision_service.py (schema
JSON + llamada a Gemini). A diferencia de ambas, esta funcion SI reintenta
una vez ante timeout o error 5xx -- el resultado puede bloquear el registro
de un avistamiento (si no es un animal real, o la especie no coincide), asi
que vale la pena un intento extra antes de rendirse. Un fallo tecnico nunca
se traduce en bloqueo: eso lo decide quien llama, y el criterio de este
modulo es que un problema externo deja las cosas como ya estaban, nunca
las empeora.
"""

import base64
import json

import httpx

from app.config import settings


SCHEMA = {
    "type": "object",
    "properties": {
        "es_animal_real": {"type": "boolean"},
        "especie_coincide": {"type": "boolean", "nullable": True},
        "probabilidad_mismo_animal": {"type": "number"},
        "notas": {"type": "string", "nullable": True},
    },
    "required": ["es_animal_real", "probabilidad_mismo_animal"],
}

MENSAJE_NO_ES_ANIMAL = (
    "No pudimos confirmar que la foto del avistamiento muestra un animal "
    "real. Intenta con otra fotografía tomada directamente."
)
MENSAJE_ESPECIE_NO_COINCIDE = (
    "La foto no parece coincidir con la especie del animal reportado. "
    "Verifica que sea el animal correcto antes de continuar."
)


def mensaje_advertencia_coincidencia_baja() -> str:
    return (
        "Esta foto se parece menos de lo esperado a las fotos originales "
        "del reporte. Antes de continuar, confirma que se trata del mismo "
        "animal reportado."
    )


_MAX_INTENTOS = 2
_TIMEOUT_SEGUNDOS = 45.0
_MAX_BYTES_IMAGEN = 10 * 1024 * 1024


def _imagen(url: str) -> dict:
    respuesta = httpx.get(url, timeout=15.0, follow_redirects=True)
    respuesta.raise_for_status()
    if len(respuesta.content) > _MAX_BYTES_IMAGEN:
        raise ValueError("La imagen excede 10 MB")
    mime = respuesta.headers.get("content-type", "image/jpeg").split(";")[0]
    return {
        "inline_data": {
            "mime_type": mime,
            "data": base64.b64encode(respuesta.content).decode("ascii"),
        }
    }


def verificar_coherencia_avistamiento(
    foto_avistamiento_url: str,
    fotos_referencia_urls: list[str],
) -> dict:
    """Compara la foto de un avistamiento contra la(s) foto(s) originales
    del animal reportado. Nunca lanza: cualquier fallo (Gemini no
    configurado, sin fotos de referencia, error tecnico) se refleja en el
    campo "estado" del resultado en vez de propagarse.
    """
    if not settings.gemini_api_key:
        return {"estado": "no_configurado"}
    if not fotos_referencia_urls:
        return {"estado": "sin_referencia"}

    try:
        partes = [
            {
                "text": (
                    "Estás ayudando a verificar el avistamiento de un animal "
                    "previamente reportado como perdido o en riesgo. Primero "
                    "te muestro la(s) foto(s) originales del reporte, y "
                    "después la foto nueva del avistamiento. Evalúa: (1) si "
                    "la foto del avistamiento muestra un animal real -- "
                    "rechaza solo si no hay ningún animal, es un peluche, "
                    "dibujo, o una captura de pantalla/imagen de internet; "
                    "(2) si su especie es compatible con la de las fotos "
                    "originales (por ejemplo, perro vs. gato SÍ sería "
                    "incompatible; dos perros de razas distintas NO lo es "
                    "por sí solo); y (3), en una escala de 0 a 1, qué tan "
                    "probable es que ambas fotos muestren al mismo animal "
                    "individual, considerando color, marcas, tamaño y "
                    "contexto. No bajes esa probabilidad por diferencias de "
                    "ángulo, iluminación, postura o calidad de la foto -- "
                    "eso no es evidencia de que sean animales distintos. Si "
                    "no puedes determinar la especie con certeza, no la "
                    "marques como incompatible (usa null). No tomes "
                    "decisiones finales de rescate; esto es solo un filtro "
                    "de calidad y una señal de apoyo para quien revise el "
                    "caso."
                )
            },
        ]
        for url in fotos_referencia_urls:
            partes.append({"text": "Foto original del reporte:"})
            partes.append(_imagen(url))
        partes.append({"text": "Foto nueva del avistamiento:"})
        partes.append(_imagen(foto_avistamiento_url))

        ultimo_error: Exception | None = None
        for _intento in range(_MAX_INTENTOS):
            try:
                respuesta = httpx.post(
                    (
                        "https://generativelanguage.googleapis.com/v1beta/"
                        f"models/{settings.gemini_model}:generateContent"
                    ),
                    headers={
                        "x-goog-api-key": settings.gemini_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "contents": [{"role": "user", "parts": partes}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseJsonSchema": SCHEMA,
                        },
                    },
                    timeout=httpx.Timeout(_TIMEOUT_SEGUNDOS),
                )
                respuesta.raise_for_status()
                texto = respuesta.json()["candidates"][0]["content"]["parts"][0]["text"]
                analisis = json.loads(texto)
                analisis["estado"] = "completado"
                analisis["modelo"] = settings.gemini_model
                return analisis
            except httpx.TimeoutException as error:
                ultimo_error = error
                continue
            except httpx.HTTPStatusError as error:
                ultimo_error = error
                if error.response is not None and error.response.status_code < 500:
                    break
                continue
        return {"estado": "error_tecnico", "detalle": str(ultimo_error)[:200]}
    except Exception as error:
        return {"estado": "error_tecnico", "detalle": str(error)[:200]}
