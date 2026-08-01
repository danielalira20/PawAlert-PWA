import base64
import json

import httpx

from app.config import settings


SCHEMA = {
    "type": "object",
    "properties": {
        "es_animal_real": {"type": "boolean"},
        "categoria_rechazo": {
            "type": "string",
            "enum": [
                "no_hay_animal",
                "peluche_o_figura",
                "captura_pantalla_o_descarga",
                "imagen_no_clara",
            ],
            "nullable": True,
        },
        "confianza": {"type": "number"},
        "condicion_estimada": {
            "type": "string",
            "enum": ["estable", "herido", "grave"],
            "nullable": True,
        },
    },
    "required": ["es_animal_real", "confianza"],
}

MENSAJE_IMAGEN_NO_CLARA = "La foto no se ve clara, intenta con mejor luz o más de cerca."
MENSAJE_RECHAZO_GENERICO = (
    "No pudimos confirmar que la foto muestra un animal real. "
    "Intenta con otra fotografía tomada directamente."
)


def mensaje_rechazo(categoria: str | None) -> str:
    if categoria == "imagen_no_clara":
        return MENSAJE_IMAGEN_NO_CLARA
    return MENSAJE_RECHAZO_GENERICO


def verificar_foto_animal(contenido: bytes, content_type: str = "image/jpeg") -> dict:
    if not settings.gemini_api_key:
        return {"estado": "error_tecnico", "detalle": "Gemini no está configurado"}
    try:
        partes = [
            {
                "text": (
                    "Evalúa si esta fotografía muestra un animal real y en qué condición "
                    "aparente está. Rechaza si no hay ningún animal, si es un peluche, "
                    "figura o dibujo, si es una captura de pantalla o una imagen descargada "
                    "de internet, o si la imagen no es lo bastante clara para evaluarla. "
                    "No tomes decisiones finales de rescate; esto es solo un filtro de "
                    "calidad y una estimación informativa de la condición del animal."
                )
            },
            {
                "inline_data": {
                    "mime_type": content_type,
                    "data": base64.b64encode(contenido).decode("ascii"),
                }
            },
        ]
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
    except Exception as error:
        return {"estado": "error_tecnico", "detalle": str(error)[:200]}
