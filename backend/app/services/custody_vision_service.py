import base64
import json

import httpx

from app.config import settings


SCHEMA = {
    "type": "object",
    "properties": {
        "probabilidad_mismo_animal": {"type": "number"},
        "cambios_visibles": {"type": "array", "items": {"type": "string"}},
        "calidad_evidencia": {"type": "string", "enum": ["adecuada", "limitada", "insuficiente"]},
        "inconsistencias": {"type": "array", "items": {"type": "string"}},
        "alertas_posibles": {"type": "array", "items": {"type": "string"}},
        "requiere_revision_humana": {"type": "boolean"},
    },
    "required": [
        "probabilidad_mismo_animal",
        "cambios_visibles",
        "calidad_evidencia",
        "inconsistencias",
        "alertas_posibles",
        "requiere_revision_humana",
    ],
}


def _imagen(url: str) -> dict:
    respuesta = httpx.get(url, timeout=30.0, follow_redirects=True)
    respuesta.raise_for_status()
    if len(respuesta.content) > 10 * 1024 * 1024:
        raise ValueError("La imagen excede 10 MB")
    mime = respuesta.headers.get("content-type", "image/jpeg").split(";")[0]
    return {
        "inline_data": {
            "mime_type": mime,
            "data": base64.b64encode(respuesta.content).decode("ascii"),
        }
    }


def analizar_evidencia_custodia(
    foto_actual_url: str,
    foto_anterior_url: str | None = None,
    foto_entorno_url: str | None = None,
) -> dict:
    if not settings.gemini_api_key:
        return {"estado": "no_configurado", "requiere_revision_humana": True}
    partes = [
        {
            "text": (
                "Apoya la revisión de bienestar animal. Compara las fotos si hay más de una, "
                "estima si muestran al mismo animal, describe cambios visibles y calidad de "
                "evidencia, y señala posibles alertas del animal o entorno. No tomes decisiones "
                "finales; toda alerta será revisada por una asociación."
            )
        },
        _imagen(foto_actual_url),
    ]
    if foto_anterior_url:
        partes.extend([{"text": "Fotografía anterior:"}, _imagen(foto_anterior_url)])
    if foto_entorno_url:
        partes.extend([{"text": "Entorno actual:"}, _imagen(foto_entorno_url)])
    respuesta = httpx.post(
        (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        ),
        headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": partes}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": SCHEMA,
            },
        },
        timeout=httpx.Timeout(90.0),
    )
    respuesta.raise_for_status()
    texto = respuesta.json()["candidates"][0]["content"]["parts"][0]["text"]
    analisis = json.loads(texto)
    analisis["estado"] = "completado"
    analisis["modelo"] = settings.gemini_model
    return analisis
