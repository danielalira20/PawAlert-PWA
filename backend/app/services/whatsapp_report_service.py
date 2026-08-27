"""Formulario conversacional de reportes mediante WhatsApp Cloud API."""

from __future__ import annotations

import logging
import unicodedata
from io import BytesIO
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.report import AnimalInput
from app.services.report_service import crear_reporte


logger = logging.getLogger(__name__)

INICIO = "nombre"

PREGUNTAS = {
    "nombre": "🐾 Vamos a crear tu reporte de PawAlert.\n\n¿Cuál es tu nombre?",
    "cantidad": "¿Cuántos animales son aproximadamente? Responde con un número (1, 2, 3...).",
    "foto": (
        "Envía una foto clara del animal. Si estás reportando un grupo y no puedes "
        "fotografiarlos juntos, escribe OMITIR."
    ),
    "tipo_animal": "¿Qué animal estás reportando? Responde: perro, gato u otro.",
    "categoria_otro": "¿Qué categoría es? Responde: ave, reptil, roedor, fauna silvestre u otro.",
    "especie_descripcion": "Describe qué especie es (por ejemplo: caballo o tlacuache).",
    "condicion": "¿Cómo se encuentra? Responde: estable, herido o grave.",
    "tamanio": "¿De qué tamaño es? Responde: pequeño, mediano o grande.",
    "sexo": "¿Cuál es su sexo? Responde: macho, hembra o desconocido.",
    "edad": "¿Qué edad aproximada tiene? Responde: cachorro, joven, adulto, senior o desconocido.",
    "raza": "¿Qué raza parece ser? Escribe la raza o responde OTRO si no está en la lista.",
    "tiene_collar": "¿Tiene collar? Responde SÍ o NO.",
    "comportamiento": "¿Parece agresivo? Responde SÍ o NO.",
    "es_domestico": "¿Parece doméstico o se deja acercar? Responde SÍ o NO.",
    "esta_prenada": "¿Parece estar preñada? Responde SÍ o NO.",
    "trae_crias": "¿Trae crías con ella? Responde SÍ o NO.",
    "numero_crias": "¿Cuántas crías aproximadamente? Responde con un número o escribe OMITIR.",
    "descripcion": "Describe brevemente al animal y la situación (máximo 300 caracteres).",
    "ubicacion": (
        "Comparte tu ubicación usando el clip de WhatsApp, o escribe el municipio "
        "donde se encuentra el animal."
    ),
    "referencia": "Escribe una referencia breve del lugar y del animal.",
    "duplicado": (
        "Encontramos un reporte cercano que podría ser el mismo caso. "
        "Responde MISMO para vincularlo o NUEVO si es una situación distinta."
    ),
}

def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto.strip().lower())
    return "".join(c for c in texto if not unicodedata.combining(c))


def _telefono_local(wa_id: str) -> str:
    """El contrato actual de invitados almacena teléfonos mexicanos a 10 dígitos."""
    digitos = "".join(c for c in wa_id if c.isdigit())
    if digitos.startswith("521") and len(digitos) == 13:
        return digitos[3:]
    if digitos.startswith("52") and len(digitos) == 12:
        return digitos[2:]
    return digitos[-10:]


def _extraer_mensajes(payload: dict[str, Any]) -> list[dict[str, Any]]:
    encontrados: list[dict[str, Any]] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value") or {}
            for mensaje in value.get("messages") or []:
                encontrados.append(mensaje)
    return encontrados


def _contenido(mensaje: dict[str, Any]) -> tuple[str, Any] | None:
    tipo = mensaje.get("type")
    if tipo == "text":
        return "text", (mensaje.get("text") or {}).get("body", "").strip()
    if tipo == "location":
        ubicacion = mensaje.get("location") or {}
        if ubicacion.get("latitude") is not None and ubicacion.get("longitude") is not None:
            return "location", {
                "latitud": float(ubicacion["latitude"]),
                "longitud": float(ubicacion["longitude"]),
                "nombre": ubicacion.get("name"),
                "direccion": ubicacion.get("address"),
            }
    if tipo == "image":
        imagen = mensaje.get("image") or {}
        if imagen.get("id"):
            return "image", {
                "media_id": imagen["id"],
                "mime_type": imagen.get("mime_type"),
                "sha256": imagen.get("sha256"),
            }
    return None


def _booleano(texto: str) -> bool | None:
    valor = _normalizar(texto)
    if valor in {"si", "s", "yes", "1"}:
        return True
    if valor in {"no", "n", "0"}:
        return False
    return None


def _validar_respuesta(estado: str, tipo: str, valor: Any) -> tuple[bool, Any, str | None]:
    if estado == "foto":
        if tipo == "image":
            return True, valor, None
        if tipo == "text" and _normalizar(valor) == "omitir":
            return True, None, None
        return False, None, PREGUNTAS[estado]
    if estado == "ubicacion":
        if tipo == "location":
            return True, valor, None
        if isinstance(valor, str) and len(valor.strip()) >= 2:
            return True, {"municipio": valor.strip()}, None
        return False, None, PREGUNTAS[estado]

    if tipo != "text" or not valor:
        return False, None, "Por ahora necesito una respuesta escrita. " + PREGUNTAS[estado]

    texto = valor.strip()
    normalizado = _normalizar(texto)
    opciones = {
        "tipo_animal": {"perro", "gato", "otro"},
        "categoria_otro": {"ave", "reptil", "roedor", "fauna silvestre", "otro"},
        "condicion": {"estable", "herido", "grave"},
        "tamanio": {"pequeno", "mediano", "grande"},
        "sexo": {"macho", "hembra", "desconocido"},
        "edad": {"cachorro", "joven", "adulto", "senior", "desconocido"},
    }
    if estado in opciones and normalizado not in opciones[estado]:
        return False, None, PREGUNTAS[estado]
    if estado == "nombre" and not (2 <= len(texto) <= 100):
        return False, None, "Escribe un nombre de entre 2 y 100 caracteres."
    if estado == "cantidad":
        if not texto.isdigit() or not (1 <= int(texto) <= 99):
            return False, None, "Escribe una cantidad entre 1 y 99."
        return True, int(texto), None
    if estado in {"tiene_collar", "comportamiento", "es_domestico", "esta_prenada", "trae_crias"}:
        booleano = _booleano(texto)
        if booleano is None:
            return False, None, PREGUNTAS[estado]
        return True, booleano, None
    if estado == "numero_crias":
        if normalizado == "omitir":
            return True, None, None
        if not texto.isdigit() or not (1 <= int(texto) <= 99):
            return False, None, "Escribe una cantidad entre 1 y 99 o responde OMITIR."
        return True, int(texto), None
    if estado in {"descripcion", "referencia"} and not (2 <= len(texto) <= 300):
        return False, None, "Escribe una respuesta de entre 2 y 300 caracteres."
    if estado == "especie_descripcion" and not (2 <= len(texto) <= 100):
        return False, None, "Describe la especie usando entre 2 y 100 caracteres."
    if estado == "raza" and not (2 <= len(texto) <= 50):
        return False, None, "Escribe una raza válida o responde OTRO."
    return True, normalizado if estado in opciones else texto, None


def _siguiente_estado(estado: str, respuestas: dict[str, Any]) -> str:
    tipo = respuestas.get("tipo_animal")
    cantidad = respuestas.get("cantidad", 1)
    rutas_fijas = {
        "nombre": "cantidad",
        "cantidad": "foto",
        "foto": "tipo_animal",
        "categoria_otro": "especie_descripcion" if respuestas.get("categoria_otro") == "otro" else "condicion",
        "especie_descripcion": "condicion",
        "condicion": "tamanio",
        "edad": "descripcion" if cantidad > 1 or tipo == "otro" else "raza",
        "descripcion": "ubicacion",
        "ubicacion": "referencia",
        "referencia": "confirmacion",
    }
    if estado == "tipo_animal":
        return "categoria_otro" if tipo == "otro" else "condicion"
    if estado == "tamanio":
        return "edad" if cantidad > 1 else "sexo"
    if estado == "sexo":
        return "edad"
    if estado == "raza":
        return "tiene_collar"
    if estado == "tiene_collar":
        return "comportamiento" if tipo == "perro" else "es_domestico"
    if estado in {"comportamiento", "es_domestico"}:
        return "esta_prenada" if respuestas.get("sexo") == "hembra" else "descripcion"
    if estado == "esta_prenada":
        return "trae_crias"
    if estado == "trae_crias":
        return "numero_crias" if respuestas.get("trae_crias") else "descripcion"
    if estado == "numero_crias":
        return "descripcion"
    return rutas_fijas[estado]


def _resumen(respuestas: dict[str, Any]) -> str:
    ubicacion = respuestas.get("ubicacion") or {}
    lugar = ubicacion.get("municipio") or ubicacion.get("direccion") or "ubicación compartida"
    return (
        "Confirma tu reporte:\n"
        f"• Animal: {respuestas['tipo_animal']}\n"
        f"• Cantidad: {respuestas['cantidad']}\n"
        f"• Condición: {respuestas['condicion']}\n"
        f"• Tamaño: {respuestas['tamanio']}\n"
        f"• Edad: {respuestas['edad']}\n"
        f"• Foto: {'sí' if respuestas.get('foto') else 'no'}\n"
        f"• Lugar: {lugar}\n"
        f"• Referencia: {respuestas['referencia']}\n\n"
        "Responde SÍ para enviarlo o NO para cancelarlo."
    )


def _sesion(wa_id: str) -> dict[str, Any] | None:
    resultado = (
        supabase_admin.table("whatsapp_reporte_sesiones")
        .select("wa_id, estado, respuestas")
        .eq("wa_id", wa_id)
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _guardar_sesion(wa_id: str, estado: str, respuestas: dict[str, Any]) -> None:
    supabase_admin.table("whatsapp_reporte_sesiones").upsert(
        {
            "wa_id": wa_id,
            "estado": estado,
            "respuestas": respuestas,
            "actualizado_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="wa_id",
    ).execute()


def _eliminar_sesion(wa_id: str) -> None:
    supabase_admin.table("whatsapp_reporte_sesiones").delete().eq("wa_id", wa_id).execute()


def _registrar_mensaje(message_id: str, wa_id: str) -> bool:
    existente = (
        supabase_admin.table("whatsapp_mensajes_recibidos")
        .select("message_id")
        .eq("message_id", message_id)
        .limit(1)
        .execute()
    )
    if existente.data:
        return False
    supabase_admin.table("whatsapp_mensajes_recibidos").insert(
        {"message_id": message_id, "wa_id": wa_id}
    ).execute()
    return True


def _olvidar_mensaje(message_id: str) -> None:
    supabase_admin.table("whatsapp_mensajes_recibidos").delete().eq(
        "message_id", message_id
    ).execute()


async def enviar_texto(wa_id: str, texto: str) -> None:
    if not settings.whatsapp_meta_access_token or not settings.whatsapp_meta_phone_number_id:
        raise RuntimeError("WhatsApp Cloud API no está configurada")
    url = (
        f"https://graph.facebook.com/{settings.whatsapp_meta_graph_version}/"
        f"{settings.whatsapp_meta_phone_number_id}/messages"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        respuesta = await client.post(
            url,
            headers={"Authorization": f"Bearer {settings.whatsapp_meta_access_token}"},
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": wa_id,
                "type": "text",
                "text": {"preview_url": False, "body": texto},
            },
        )
    respuesta.raise_for_status()


async def _descargar_imagen(media: dict[str, Any]) -> UploadFile:
    """Resuelve el media_id de Meta y devuelve un archivo compatible con crear_reporte."""
    headers = {"Authorization": f"Bearer {settings.whatsapp_meta_access_token}"}
    url_info = (
        f"https://graph.facebook.com/{settings.whatsapp_meta_graph_version}/"
        f"{media['media_id']}"
    )
    async with httpx.AsyncClient(timeout=20) as client:
        info = await client.get(url_info, headers=headers)
        info.raise_for_status()
        datos = info.json()
        descarga = await client.get(datos["url"], headers=headers)
        descarga.raise_for_status()
    contenido = descarga.content
    if len(contenido) > 10 * 1024 * 1024:
        raise ValueError("La fotografía excede el límite de 10 MB")
    mime = datos.get("mime_type") or media.get("mime_type") or "image/jpeg"
    extensiones = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    if mime not in extensiones:
        raise ValueError("Formato de fotografía no admitido")
    return UploadFile(
        file=BytesIO(contenido),
        filename=f"whatsapp.{extensiones[mime]}",
        headers=Headers({"content-type": mime}),
    )


async def _crear_desde_respuestas(
    wa_id: str,
    respuestas: dict[str, Any],
    *,
    es_duplicado_confirmado: bool | None = None,
    reporte_original_id: str | None = None,
) -> dict[str, Any]:
    ubicacion = respuestas["ubicacion"]
    foto = await _descargar_imagen(respuestas["foto"]) if respuestas.get("foto") else None
    tipo = respuestas["tipo_animal"]
    raza = _normalizar(respuestas.get("raza", "")) or None
    mapas_raza = {
        "perro": {"mestizo", "labrador", "pitbull", "pastor aleman", "chihuahua"},
        "gato": {"comun", "siames", "persa"},
    }
    raza_clave = raza if raza in mapas_raza.get(tipo, set()) else (f"otro_{tipo}" if raza else None)
    return await crear_reporte(
        nombre=respuestas["nombre"],
        apellido_paterno=None,
        apellido_materno=None,
        telefono=_telefono_local(wa_id),
        email=None,
        usuario_id=None,
        fotos=[foto] if foto else None,
        fotos_ordenes="[1]" if foto else None,
        fotos_animal_index="[0]" if foto else None,
        animales=[
            AnimalInput(
                tipo_animal=respuestas["tipo_animal"],
                condicion=respuestas["condicion"],
                tamanio=respuestas["tamanio"],
                sexo=respuestas.get("sexo", "desconocido"),
                edad_aproximada=respuestas["edad"],
                tiene_collar=respuestas.get("tiene_collar"),
                esta_prenada=respuestas.get("esta_prenada"),
                es_agresivo=respuestas.get("comportamiento"),
                es_domestico_probable=respuestas.get("es_domestico"),
                raza_clave=raza_clave,
                tipo_animal_otro_clave=respuestas.get("categoria_otro"),
                especie_descripcion=respuestas.get("especie_descripcion"),
                descripcion=respuestas["descripcion"],
                es_grupo=respuestas["cantidad"] > 1,
                cantidad=respuestas["cantidad"],
                trae_crias_nacidas=respuestas.get("trae_crias"),
                numero_crias_nacidas=respuestas.get("numero_crias"),
            )
        ],
        latitud=ubicacion.get("latitud"),
        longitud=ubicacion.get("longitud"),
        calle=None,
        colonia=None,
        municipio=ubicacion.get("municipio"),
        estado_ubicacion=None,
        referencia=respuestas["referencia"],
        es_duplicado_confirmado=es_duplicado_confirmado,
        reporte_original_id=reporte_original_id,
    )


async def _procesar_mensaje(mensaje: dict[str, Any]) -> None:
    wa_id = str(mensaje.get("from") or "")
    message_id = str(mensaje.get("id") or "")
    contenido = _contenido(mensaje)
    if not wa_id or not message_id:
        return
    if not _registrar_mensaje(message_id, wa_id):
        return

    try:
        sesion = _sesion(wa_id)
        if sesion is None:
            _guardar_sesion(wa_id, INICIO, {})
            await enviar_texto(wa_id, PREGUNTAS[INICIO])
            return

        estado = sesion["estado"]
        respuestas = dict(sesion.get("respuestas") or {})
        if estado == "duplicado":
            respuesta = _normalizar(contenido[1]) if contenido and contenido[0] == "text" else ""
            if respuesta not in {"mismo", "nuevo"}:
                await enviar_texto(wa_id, PREGUNTAS["duplicado"])
                return
            reporte = await _crear_desde_respuestas(
                wa_id,
                respuestas,
                es_duplicado_confirmado=True,
                reporte_original_id=(
                    respuestas.get("_duplicado_id") if respuesta == "mismo" else None
                ),
            )
            _eliminar_sesion(wa_id)
            await enviar_texto(
                wa_id,
                f"✅ Reporte creado correctamente.\nFolio: {reporte['id']}\nGracias por ayudar.",
            )
            return
        if estado == "confirmacion":
            respuesta = _normalizar(contenido[1]) if contenido and contenido[0] == "text" else ""
            if respuesta in {"no", "cancelar", "cancela"}:
                _eliminar_sesion(wa_id)
                await enviar_texto(wa_id, "Reporte cancelado. Escribe cualquier mensaje para comenzar otro.")
                return
            if respuesta not in {"si", "s", "confirmar", "confirmo"}:
                await enviar_texto(wa_id, "Responde SÍ para enviar el reporte o NO para cancelarlo.")
                return
            reporte = await _crear_desde_respuestas(wa_id, respuestas)
            if reporte.get("posible_duplicado"):
                respuestas["_duplicado_id"] = reporte["reporte_existente"]["id"]
                _guardar_sesion(wa_id, "duplicado", respuestas)
                await enviar_texto(wa_id, PREGUNTAS["duplicado"])
                return
            _eliminar_sesion(wa_id)
            await enviar_texto(
                wa_id,
                f"✅ Reporte creado correctamente.\nFolio: {reporte['id']}\nGracias por ayudar.",
            )
            return

        if contenido is None:
            await enviar_texto(
                wa_id,
                "Todavía no puedo procesar ese tipo de mensaje. " + PREGUNTAS[estado],
            )
            return
        valido, valor, error = _validar_respuesta(estado, *contenido)
        if not valido:
            await enviar_texto(wa_id, error or PREGUNTAS[estado])
            return
        if estado == "foto" and valor is None and respuestas.get("cantidad", 1) == 1:
            await enviar_texto(wa_id, "La foto es obligatoria para un animal individual. " + PREGUNTAS[estado])
            return
        respuestas[estado] = valor
        siguiente = _siguiente_estado(estado, respuestas)
        _guardar_sesion(wa_id, siguiente, respuestas)
        await enviar_texto(
            wa_id,
            _resumen(respuestas) if siguiente == "confirmacion" else PREGUNTAS[siguiente],
        )
    except Exception:
        _olvidar_mensaje(message_id)
        raise


async def procesar_webhook_meta(payload: dict[str, Any]) -> None:
    if payload.get("object") != "whatsapp_business_account":
        return
    for mensaje in _extraer_mensajes(payload):
        await _procesar_mensaje(mensaje)
