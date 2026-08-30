"""Formulario conversacional de reportes mediante WhatsApp Cloud API."""

from __future__ import annotations

import logging
import unicodedata
from io import BytesIO
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.datastructures import Headers

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.report import AnimalInput
from app.services.report_service import FotoAnimalRechazada, crear_reporte


logger = logging.getLogger(__name__)


class FotoAnimalInvalida(ValueError):
    """Conserva qué ficha necesita reemplazar su fotografía."""

    def __init__(self, indice: int, detalle: str) -> None:
        super().__init__(detalle)
        self.indice = indice

INICIO = "nombre"
SITIO_PAWALERT = "https://paw-alert-pwa.vercel.app"

COMANDOS_REINICIO = {
    "nuevo reporte",
    "nuevo reporte.",
    "quiero hacer un reporte",
    "quiero hacer otro reporte",
    "quiero reportar",
    "hacer un reporte",
    "hacer otro reporte",
    "reiniciar",
    "empezar de nuevo",
    "comenzar de nuevo",
}

PREGUNTAS = {
    "nombre": (
        "🐾 *¡Bienvenido a PawAlert!*\n\n"
        "Te guiaré paso a paso para crear un reporte y ayudar a un animal. "
        "Tus respuestas se guardarán únicamente para completar el reporte.\n\n"
        "Para comenzar, ¿cuál es tu nombre?"
    ),
    "cantidad": (
        "¿Cuántos animales viste? Elige una opción.\n"
        "Si son más de 6, elige *Otro (son más)* y te pediré el número."
    ),
    "cantidad_detalle": (
        "¿Cuántos animales se encuentran aproximadamente? "
        "Escribe solo el número (por ejemplo: 8)."
    ),
    "modo_grupo": (
        "Viste varios animales. ¿Cómo son?\n\n"
        "• *Mamá con crías*: una hembra adulta con sus cachorros\n"
        "• *Grupo parecido*: varios de la misma especie, tamaño y estado\n"
        "• *Son diferentes*: distinta especie, edad o condición"
    ),
    "foto": (
        "📸 Envía una foto clara y reciente del animal. Procura que tenga buena luz, "
        "que el animal sea visible y que no sea una captura de pantalla.\n\n"
        "Si la foto no permite validar el caso, te pediré otra. Si reportas un grupo "
        "y no puedes fotografiarlos juntos, escribe OMITIR."
    ),
    "tipo_animal": "¿Qué animal estás reportando?",
    "categoria_otro": "¿Qué tipo de animal es?",
    "especie_descripcion": (
        "¿Qué especie es? Escríbelo (por ejemplo: caballo, tlacuache, zarigüeya, tortuga)."
    ),
    "condicion": (
        "¿Cómo se encuentra?\n"
        "• *Estable*: se mueve bien, sin heridas visibles\n"
        "• *Herido*: sangra, cojea o tiene lesiones\n"
        "• *Grave*: no se levanta o está muy débil"
    ),
    "tamanio": "¿De qué tamaño es?",
    "sexo": "¿Cuál es su sexo? Si no puedes saberlo, elige *No sé*.",
    "edad": "¿Qué edad aproximada tiene?",
    "raza": (
        "¿Qué raza parece tener? Elige una opción de la lista.\n"
        "Si no la reconoces o es mestizo/criollo, elige *Otra / no la sé*."
    ),
    "tiene_collar": "¿Trae collar, correa o placa?",
    "comportamiento": (
        "¿Se comporta agresivo? (gruñe, intenta morder o no deja que nadie se acerque)"
    ),
    "es_domestico": (
        "¿Se ve como un animal de casa? (aseado, confiado, se deja acercar). "
        "Si se ve callejero o asustadizo, elige *No*."
    ),
    "esta_prenada": "¿Se ve preñada? (panza abultada)",
    "trae_crias": "¿Está acompañada de crías o cachorros?",
    "numero_crias": "¿Cuántas crías aproximadamente? Responde con un número o escribe OMITIR.",
    "descripcion_animal": (
        "Describe a este animal: señas particulares, color o algo que ayude a "
        "identificarlo. Máximo 300 caracteres. Si no deseas agregar detalles, "
        "escribe OMITIR."
    ),
    "descripcion": (
        "Cuéntame *la situación*: ¿qué está pasando?, ¿hace cuánto lo viste?, "
        "¿hay algún riesgo cerca (tráfico, otros animales, gente)? "
        "Máximo 300 caracteres."
    ),
    "ubicacion": (
        "📍 Comparte la *ubicación exacta* con el clip 📎 de WhatsApp "
        "(Ubicación → Enviar tu ubicación actual).\n"
        "Si no puedes, escribe la colonia o el municipio donde está el animal."
    ),
    "referencia": (
        "Para ubicar el lugar, escribe una *referencia del sitio*: calle y número, "
        "un negocio o punto conocido cerca, color de fachada, etc. "
        "Máximo 300 caracteres."
    ),
    "duplicado": (
        "Encontramos un reporte cercano que podría ser el mismo caso. "
        "Responde MISMO para vincularlo o NUEVO si es una situación distinta."
    ),
}

OPCIONES_INTERACTIVAS: dict[str, list[tuple[str, str]]] = {
    "cantidad": [
        ("1", "1"),
        ("2", "2"),
        ("3", "3"),
        ("4", "4"),
        ("5", "5"),
        ("6", "6"),
        ("otro", "Otro (son más)"),
    ],
    "modo_grupo": [
        ("mama_crias", "🐕 Mamá con crías"),
        ("grupo_parecido", "🐾 Grupo parecido"),
        ("distintos", "🔀 Son diferentes"),
    ],
    "tipo_animal": [("perro", "Perro"), ("gato", "Gato"), ("otro", "Otro")],
    "categoria_otro": [
        ("ave", "Ave"),
        ("reptil", "Reptil"),
        ("roedor", "Roedor"),
        ("fauna silvestre", "Fauna silvestre"),
        ("otro", "Otro"),
    ],
    "condicion": [("estable", "Estable"), ("herido", "Herido"), ("grave", "Grave")],
    "tamanio": [("pequeno", "Pequeño"), ("mediano", "Mediano"), ("grande", "Grande")],
    "sexo": [("macho", "Macho"), ("hembra", "Hembra"), ("desconocido", "No sé")],
    "edad": [
        ("cachorro", "Cachorro"),
        ("joven", "Joven"),
        ("adulto", "Adulto"),
        ("senior", "Senior"),
        ("desconocido", "No sé"),
    ],
    "tiene_collar": [("si", "Sí"), ("no", "No")],
    "comportamiento": [("si", "Sí"), ("no", "No")],
    "es_domestico": [("si", "Sí"), ("no", "No")],
    "esta_prenada": [("si", "Sí"), ("no", "No")],
    "trae_crias": [("si", "Sí"), ("no", "No")],
    "duplicado": [("mismo", "Es el mismo"), ("nuevo", "Es otro caso")],
}

# Máximo de animales distintos que se capturan uno por uno en WhatsApp.
MAX_ANIMALES_DISTINTOS = 4

# Campos de la ficha completa que se pregunta por cada animal en modo "distintos".
CAMPOS_FICHA_ANIMAL = (
    "foto",
    "tipo_animal",
    "categoria_otro",
    "especie_descripcion",
    "condicion",
    "tamanio",
    "sexo",
    "edad",
    "raza",
    "tiene_collar",
    "comportamiento",
    "es_domestico",
    "esta_prenada",
    "trae_crias",
    "numero_crias",
    "descripcion_animal",
)

RAZAS_SUGERIDAS: dict[str, list[tuple[str, str]]] = {
    "perro": [
        ("mestizo", "Mestizo / criollo"),
        ("labrador", "Labrador"),
        ("pitbull", "Pitbull"),
        ("pastor aleman", "Pastor alemán"),
        ("chihuahua", "Chihuahua"),
    ],
    "gato": [
        ("comun", "Común / criollo"),
        ("siames", "Siamés"),
        ("persa", "Persa"),
    ],
}

# Campos que se pueden corregir desde el resumen, agrupados para no rebasar
# el límite de 10 filas por lista de WhatsApp.
CAMPOS_CORRECCION_ANIMAL: list[tuple[str, str]] = [
    ("tipo_animal", "Tipo de animal"),
    ("cantidad", "Cantidad de animales"),
    ("condicion", "Condición"),
    ("tamanio", "Tamaño"),
    ("sexo", "Sexo"),
    ("edad", "Edad"),
    ("raza", "Raza"),
    ("tiene_collar", "¿Tiene collar?"),
    ("comportamiento", "¿Parece agresivo?"),
    ("es_domestico", "¿Parece de casa?"),
    ("esta_prenada", "¿Está preñada?"),
    ("trae_crias", "¿Trae crías?"),
]
CAMPOS_CORRECCION_LUGAR: list[tuple[str, str]] = [
    ("ubicacion", "Ubicación (mapa/texto)"),
    ("referencia", "Referencia del lugar"),
    ("descripcion", "Situación"),
]
ETIQUETAS_CORRECCION: dict[str, str] = {
    campo: etiqueta
    for campo, etiqueta in [
        *CAMPOS_CORRECCION_ANIMAL,
        *CAMPOS_CORRECCION_LUGAR,
        ("foto", "Fotografía"),
    ]
}


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto.strip().lower())
    return "".join(c for c in texto if not unicodedata.combining(c))


def _es_reinicio(texto: str) -> bool:
    """Detecta la orden de empezar un reporte nuevo desde cualquier paso."""
    return " ".join(_normalizar(texto).split()) in COMANDOS_REINICIO


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
        if (
            ubicacion.get("latitude") is not None
            and ubicacion.get("longitude") is not None
        ):
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
    if tipo == "interactive":
        interactivo = mensaje.get("interactive") or {}
        respuesta = (
            interactivo.get("button_reply") or interactivo.get("list_reply") or {}
        )
        if respuesta.get("id"):
            return "text", str(respuesta["id"]).strip()
    return None


def _booleano(texto: str) -> bool | None:
    valor = _normalizar(texto)
    if valor in {"si", "s", "yes", "1"}:
        return True
    if valor in {"no", "n", "0"}:
        return False
    return None


def _validar_respuesta(
    estado: str, tipo: str, valor: Any
) -> tuple[bool, Any, str | None]:
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
        return (
            False,
            None,
            "Por ahora necesito una respuesta escrita. " + PREGUNTAS[estado],
        )

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
        if normalizado == "otro":
            return False, None, PREGUNTAS["cantidad_detalle"]
        if not texto.isdigit() or not (1 <= int(texto) <= 99):
            return False, None, "Elige una opción o escribe un número entre 1 y 99."
        return True, int(texto), None
    if estado in {
        "tiene_collar",
        "comportamiento",
        "es_domestico",
        "esta_prenada",
        "trae_crias",
    }:
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
    if estado == "descripcion_animal":
        if normalizado == "omitir":
            return True, None, None
        if not (2 <= len(texto) <= 300):
            return False, None, "Escribe entre 2 y 300 caracteres o responde OMITIR."
        return True, texto, None
    if estado in {"descripcion", "referencia"} and not (2 <= len(texto) <= 300):
        return False, None, "Escribe una respuesta de entre 2 y 300 caracteres."
    if estado == "especie_descripcion" and not (2 <= len(texto) <= 100):
        return False, None, "Describe la especie usando entre 2 y 100 caracteres."
    if estado == "raza" and not (2 <= len(texto) <= 50):
        return False, None, "Escribe una raza válida o responde OTRO."
    return True, normalizado if estado in opciones else texto, None


def _siguiente_estado(estado: str, respuestas: dict[str, Any]) -> str:
    tipo = respuestas.get("tipo_animal")
    cantidad = int(respuestas.get("cantidad", 1) or 1)
    modo = respuestas.get("_modo")
    # En "mamá con crías" la ficha es de una sola hembra adulta: se salta la
    # pregunta de sexo y la de preñez/crías (ya sabemos que trae crías).
    ficha_individual = cantidad == 1 or modo in {"mama_crias", "distintos"}
    rutas_fijas = {
        "nombre": "cantidad",
        "cantidad": "modo_grupo" if cantidad > 1 else "foto",
        "modo_grupo": "foto",
        "foto": "tipo_animal",
        "categoria_otro": (
            "especie_descripcion"
            if respuestas.get("categoria_otro") == "otro"
            else "condicion"
        ),
        "especie_descripcion": "condicion",
        "condicion": "tamanio",
        "edad": (
            "raza"
            if ficha_individual and tipo != "otro"
            else "descripcion_animal" if modo == "distintos" else "descripcion"
        ),
        "descripcion_animal": "foto",
        "descripcion": "ubicacion",
        "ubicacion": "referencia",
        "referencia": "confirmacion",
    }
    if estado == "tipo_animal":
        return "categoria_otro" if tipo == "otro" else "condicion"
    if estado == "tamanio":
        return "sexo" if ficha_individual and modo != "mama_crias" else "edad"
    if estado == "sexo":
        return "edad"
    if estado == "raza":
        return "tiene_collar"
    if estado == "tiene_collar":
        return "comportamiento" if tipo == "perro" else "es_domestico"
    if estado in {"comportamiento", "es_domestico"}:
        if modo == "mama_crias":
            return "descripcion"
        if respuestas.get("sexo") == "hembra":
            return "esta_prenada"
        return "descripcion_animal" if modo == "distintos" else "descripcion"
    if estado == "esta_prenada":
        return "trae_crias"
    if estado == "trae_crias":
        if respuestas.get("trae_crias"):
            return "numero_crias"
        return "descripcion_animal" if modo == "distintos" else "descripcion"
    if estado == "numero_crias":
        return "descripcion_animal" if modo == "distintos" else "descripcion"
    return rutas_fijas[estado]


def _resumen(respuestas: dict[str, Any]) -> str:
    ubicacion = respuestas.get("ubicacion") or {}
    lugar = (
        ubicacion.get("municipio")
        or ubicacion.get("direccion")
        or "ubicación compartida"
    )
    lineas = ["Confirma tu reporte:"]
    fichas = respuestas.get("_animales")
    if fichas:
        for i, ficha in enumerate(fichas, start=1):
            partes = [
                ficha.get("tipo_animal"),
                ficha.get("condicion"),
                ficha.get("tamanio"),
                ficha.get("sexo"),
                ficha.get("edad"),
            ]
            lineas.append(
                f"• Animal {i}: "
                + ", ".join(p for p in partes if p)
                + f"; foto: {'sí' if ficha.get('foto') else 'no'}"
            )
    else:
        lineas.append(f"• Animal: {respuestas['tipo_animal']}")
        if respuestas.get("_modo") == "mama_crias":
            lineas.append(f"• Crías: {respuestas.get('numero_crias', '?')}")
        else:
            lineas.append(f"• Cantidad: {respuestas['cantidad']}")
        lineas.append(f"• Condición: {respuestas['condicion']}")
        lineas.append(f"• Tamaño: {respuestas['tamanio']}")
        lineas.append(f"• Edad: {respuestas['edad']}")
        lineas.append(f"• Foto: {'sí' if respuestas.get('foto') else 'no'}")
    lineas.append(f"• Lugar: {lugar}")
    lineas.append(f"• Referencia: {respuestas['referencia']}")
    lineas.append("")
    lineas.append("Responde SÍ para enviarlo o NO para cancelarlo.")
    return "\n".join(lineas)


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
    supabase_admin.table("whatsapp_reporte_sesiones").delete().eq(
        "wa_id", wa_id
    ).execute()


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


async def enviar_texto(wa_id: str, texto: str, *, preview_url: bool = False) -> None:
    await _enviar_payload(
        wa_id,
        {"type": "text", "text": {"preview_url": preview_url, "body": texto}},
    )


async def _enviar_payload(wa_id: str, contenido: dict[str, Any]) -> None:
    if (
        not settings.whatsapp_meta_access_token
        or not settings.whatsapp_meta_phone_number_id
    ):
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
                **contenido,
            },
        )
    respuesta.raise_for_status()


async def enviar_opciones(
    wa_id: str,
    texto: str,
    opciones: list[tuple[str, str]],
    *,
    titulo_boton: str = "Ver opciones",
) -> None:
    if len(opciones) <= 3:
        interactivo = {
            "type": "button",
            "body": {"text": texto},
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {"id": identificador, "title": titulo[:20]},
                    }
                    for identificador, titulo in opciones
                ]
            },
        }
    else:
        interactivo = {
            "type": "list",
            "body": {"text": texto},
            "action": {
                "button": titulo_boton[:20],
                "sections": [
                    {
                        "title": "Opciones",
                        "rows": [
                            {"id": identificador, "title": titulo[:24]}
                            for identificador, titulo in opciones[:10]
                        ],
                    }
                ],
            },
        }
    await _enviar_payload(wa_id, {"type": "interactive", "interactive": interactivo})


def _prefijo_animal(respuestas: dict[str, Any] | None, estado: str) -> str:
    """"Animal k de N:" mientras se captura una ficha en modo 'distintos'."""
    if not respuestas or respuestas.get("_modo") != "distintos":
        return ""
    if estado not in CAMPOS_FICHA_ANIMAL:
        return ""
    idx = respuestas.get("_animal_idx")
    total = respuestas.get("_animales_total")
    if not idx or not total:
        return ""
    return f"*Animal {idx} de {total}:*\n"


async def enviar_pregunta(
    wa_id: str, estado: str, respuestas: dict[str, Any] | None = None
) -> None:
    prefijo = _prefijo_animal(respuestas, estado)
    if estado == "raza" and respuestas:
        sugeridas = RAZAS_SUGERIDAS.get(respuestas.get("tipo_animal"))
        if sugeridas:
            await enviar_opciones(
                wa_id,
                prefijo + PREGUNTAS["raza"],
                [*sugeridas, ("otro", "Otra / no la sé")],
                titulo_boton="Ver razas",
            )
            return
    opciones = OPCIONES_INTERACTIVAS.get(estado)
    if opciones:
        await enviar_opciones(wa_id, prefijo + PREGUNTAS[estado], opciones)
    else:
        await enviar_texto(wa_id, prefijo + PREGUNTAS[estado])


async def enviar_confirmacion(wa_id: str, respuestas: dict[str, Any]) -> None:
    await enviar_opciones(
        wa_id,
        _resumen(respuestas).replace(
            "Responde SÍ para enviarlo o NO para cancelarlo.",
            "Elige una opción para continuar.",
        ),
        [
            ("confirmar", "Enviar reporte"),
            ("corregir", "Corregir datos"),
            ("cancelar", "Cancelar"),
        ],
    )


async def enviar_menu_correccion(wa_id: str, respuestas: dict[str, Any]) -> None:
    """Menú superior: agrupa los campos para no rebasar el límite de 10 filas."""
    opciones: list[tuple[str, str]] = []
    if respuestas.get("_animales"):
        opciones.append(("corregir:recapturar", "🐾 Recapturar animales"))
    elif any(campo in respuestas for campo, _ in CAMPOS_CORRECCION_ANIMAL):
        opciones.append(("correccion:animal", "🐾 Datos del animal"))
    if any(campo in respuestas for campo, _ in CAMPOS_CORRECCION_LUGAR):
        opciones.append(("correccion:lugar", "📍 Lugar y situación"))
    if respuestas.get("foto"):
        opciones.append(("corregir:foto", "📷 Fotografía"))
    opciones.append(("corregir:ninguno", "✅ Está todo bien"))
    await enviar_opciones(
        wa_id,
        "¿Qué quieres corregir?",
        opciones,
        titulo_boton="Ver campos",
    )


async def enviar_submenu_correccion(
    wa_id: str, respuestas: dict[str, Any], grupo: str
) -> None:
    campos = (
        CAMPOS_CORRECCION_ANIMAL if grupo == "animal" else CAMPOS_CORRECCION_LUGAR
    )
    opciones = [
        (f"corregir:{campo}", etiqueta)
        for campo, etiqueta in campos
        if campo in respuestas
    ][:9]
    opciones.append(("correccion:volver", "⬅️ Volver"))
    titulo = (
        "¿Qué dato del animal quieres corregir?"
        if grupo == "animal"
        else "¿Qué dato del lugar quieres corregir?"
    )
    await enviar_opciones(wa_id, titulo, opciones, titulo_boton="Ver campos")


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
        raise ValueError(
            "El formato no es compatible. Envía una imagen JPG, PNG o WEBP."
        )
    try:
        with Image.open(BytesIO(contenido)) as imagen:
            imagen.verify()
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ValueError(
            "El archivo no parece ser una fotografía válida. Toma o selecciona otra imagen."
        ) from error
    return UploadFile(
        file=BytesIO(contenido),
        filename=f"whatsapp.{extensiones[mime]}",
        headers=Headers({"content-type": mime}),
    )


async def _pedir_nueva_foto(
    wa_id: str,
    respuestas: dict[str, Any],
    detalle: str,
) -> None:
    """Conserva el formulario y devuelve al usuario únicamente al paso de foto."""
    respuestas.pop("foto", None)
    respuestas["_corrigiendo"] = "foto"
    _guardar_sesion(wa_id, "foto", respuestas)
    await enviar_texto(
        wa_id,
        "⚠️ *Necesito otra fotografía*\n\n"
        f"{detalle.strip()}\n\n"
        "No perdiste tus demás respuestas. Envía aquí una foto nueva y volveré a "
        "mostrarte el resumen.",
    )


async def _pedir_nueva_foto_animal(
    wa_id: str,
    respuestas: dict[str, Any],
    indice: int,
    detalle: str,
) -> None:
    """Conserva las fichas y reemplaza solamente la foto rechazada."""
    respuestas["_reemplazando_foto_idx"] = indice
    _guardar_sesion(wa_id, "foto", respuestas)
    await enviar_texto(
        wa_id,
        "⚠️ *Necesito otra fotografía para el animal "
        f"{indice + 1}*\n\n{detalle.strip()}\n\n"
        "No perdiste las demás fichas. Envía aquí una foto nueva y volveré "
        "a mostrarte el resumen.",
    )


async def _crear_reporte_con_recuperacion(
    wa_id: str,
    respuestas: dict[str, Any],
    **opciones: Any,
) -> dict[str, Any] | None:
    try:
        return await _crear_desde_respuestas(wa_id, respuestas, **opciones)
    except FotoAnimalInvalida as error:
        await _pedir_nueva_foto_animal(
            wa_id, respuestas, error.indice, str(error)
        )
        return None
    except ValueError as error:
        await _pedir_nueva_foto(wa_id, respuestas, str(error))
        return None
    except HTTPException as error:
        if isinstance(error, FotoAnimalRechazada) and respuestas.get("_animales"):
            detalle = (
                error.detail
                if isinstance(error.detail, str)
                else "La foto no pasó la validación."
            )
            await _pedir_nueva_foto_animal(
                wa_id, respuestas, error.animal_index, detalle
            )
            return None
        if error.status_code != 422 or not respuestas.get("foto"):
            raise
        detalle = (
            error.detail
            if isinstance(error.detail, str)
            else "La foto no pasó la validación."
        )
        await _pedir_nueva_foto(wa_id, respuestas, detalle)
        return None


async def _enviar_reporte_creado(wa_id: str, reporte_id: str) -> None:
    await enviar_texto(
        wa_id,
        "✅ *¡Reporte enviado correctamente!*\n\n"
        "Gracias por tomarte el tiempo de ayudar. Tu reporte ya está disponible "
        "para la comunidad de PawAlert.\n\n"
        f"🧾 *Folio:* {reporte_id}\n"
        f"🌐 *Consulta PawAlert:* {SITIO_PAWALERT}\n\n"
        "Si necesitas crear otro reporte, escribe *NUEVO REPORTE*.",
        preview_url=True,
    )


async def _crear_desde_respuestas(
    wa_id: str,
    respuestas: dict[str, Any],
    *,
    es_duplicado_confirmado: bool | None = None,
    reporte_original_id: str | None = None,
) -> dict[str, Any]:
    ubicacion = respuestas["ubicacion"]
    foto = (
        await _descargar_imagen(respuestas["foto"]) if respuestas.get("foto") else None
    )
    mapas_raza = {
        "perro": {"mestizo", "labrador", "pitbull", "pastor aleman", "chihuahua"},
        "gato": {"comun", "siames", "persa"},
    }

    def _raza_clave(tipo: str, valor: str | None) -> str | None:
        raza = _normalizar(valor or "") or None
        if raza is None:
            return None
        return raza if raza in mapas_raza.get(tipo, set()) else f"otro_{tipo}"

    def _descripcion_ficha(ficha: dict[str, Any]) -> str:
        propia = str(ficha.get("descripcion_animal") or "").strip()
        situacion = str(respuestas.get("descripcion") or "").strip()
        partes = [propia] if propia else []
        if situacion:
            partes.append(f"Situación general: {situacion}")
        return "\n".join(partes)[:300]

    fichas = respuestas.get("_animales")
    if fichas:
        fotos = []
        for indice, ficha in enumerate(fichas):
            try:
                fotos.append(await _descargar_imagen(ficha["foto"]))
            except ValueError as error:
                raise FotoAnimalInvalida(indice, str(error)) from error
        animales = [
            AnimalInput(
                tipo_animal=ficha["tipo_animal"],
                condicion=ficha["condicion"],
                tamanio=ficha["tamanio"],
                sexo=ficha.get("sexo", "desconocido"),
                edad_aproximada=ficha.get("edad"),
                tiene_collar=ficha.get("tiene_collar"),
                esta_prenada=ficha.get("esta_prenada"),
                es_agresivo=ficha.get("comportamiento"),
                es_domestico_probable=ficha.get("es_domestico"),
                raza_clave=_raza_clave(ficha["tipo_animal"], ficha.get("raza")),
                tipo_animal_otro_clave=ficha.get("categoria_otro"),
                especie_descripcion=ficha.get("especie_descripcion"),
                descripcion=_descripcion_ficha(ficha),
                orden=i,
                es_grupo=False,
                cantidad=1,
                trae_crias_nacidas=ficha.get("trae_crias"),
                numero_crias_nacidas=ficha.get("numero_crias"),
            )
            for i, ficha in enumerate(fichas, start=1)
        ]
    else:
        fotos = [foto] if foto else None
        cantidad = int(respuestas.get("cantidad", 1) or 1)
        animales = [
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
                raza_clave=_raza_clave(respuestas["tipo_animal"], respuestas.get("raza")),
                tipo_animal_otro_clave=respuestas.get("categoria_otro"),
                especie_descripcion=respuestas.get("especie_descripcion"),
                descripcion=respuestas["descripcion"],
                es_grupo=cantidad > 1,
                cantidad=cantidad,
                trae_crias_nacidas=respuestas.get("trae_crias"),
                numero_crias_nacidas=respuestas.get("numero_crias"),
            )
        ]
    return await crear_reporte(
        nombre=respuestas["nombre"],
        apellido_paterno=None,
        apellido_materno=None,
        telefono=_telefono_local(wa_id),
        email=None,
        usuario_id=None,
        fotos=fotos,
        fotos_ordenes=str(list(range(1, len(fotos) + 1))) if fotos else None,
        fotos_animal_index=(
            str(list(range(len(fotos)))) if fichas and fotos else "[0]" if fotos else None
        ),
        animales=animales,
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
        if contenido and contenido[0] == "text" and _es_reinicio(contenido[1]):
            _eliminar_sesion(wa_id)
            _guardar_sesion(wa_id, INICIO, {})
            await enviar_pregunta(wa_id, INICIO)
            return

        sesion = _sesion(wa_id)
        if sesion is None:
            _guardar_sesion(wa_id, INICIO, {})
            await enviar_pregunta(wa_id, INICIO)
            return

        estado = sesion["estado"]
        respuestas = dict(sesion.get("respuestas") or {})
        if estado == "duplicado":
            respuesta = (
                _normalizar(contenido[1])
                if contenido and contenido[0] == "text"
                else ""
            )
            if respuesta not in {"mismo", "nuevo"}:
                await enviar_pregunta(wa_id, "duplicado")
                return
            reporte = await _crear_reporte_con_recuperacion(
                wa_id,
                respuestas,
                es_duplicado_confirmado=True,
                reporte_original_id=(
                    respuestas.get("_duplicado_id") if respuesta == "mismo" else None
                ),
            )
            if reporte is None:
                return
            _eliminar_sesion(wa_id)
            await _enviar_reporte_creado(wa_id, str(reporte["id"]))
            return
        if estado == "confirmacion":
            respuesta = (
                _normalizar(contenido[1])
                if contenido and contenido[0] == "text"
                else ""
            )
            if respuesta in {"no", "cancelar", "cancela"}:
                _eliminar_sesion(wa_id)
                await enviar_texto(
                    wa_id,
                    "🟠 *Reporte cancelado*\n\n"
                    "No se guardó ningún reporte. Cuando quieras intentarlo de nuevo, "
                    "escribe *Quiero hacer un reporte*.",
                )
                return
            if respuesta in {"corregir", "corregir datos"}:
                _guardar_sesion(wa_id, "correccion", respuestas)
                await enviar_menu_correccion(wa_id, respuestas)
                return
            if respuesta not in {"si", "s", "confirmar", "confirmo"}:
                await enviar_confirmacion(wa_id, respuestas)
                return
            reporte = await _crear_reporte_con_recuperacion(wa_id, respuestas)
            if reporte is None:
                return
            if reporte.get("posible_duplicado"):
                respuestas["_duplicado_id"] = reporte["reporte_existente"]["id"]
                _guardar_sesion(wa_id, "duplicado", respuestas)
                await enviar_pregunta(wa_id, "duplicado")
                return
            _eliminar_sesion(wa_id)
            await _enviar_reporte_creado(wa_id, str(reporte["id"]))
            return
        if estado == "correccion":
            respuesta = (
                _normalizar(contenido[1])
                if contenido and contenido[0] == "text"
                else ""
            )
            nivel = respuestas.get("_correccion_nivel")
            if respuesta == "correccion:volver":
                respuestas.pop("_correccion_nivel", None)
                _guardar_sesion(wa_id, "correccion", respuestas)
                await enviar_menu_correccion(wa_id, respuestas)
                return
            if respuesta in {"correccion:animal", "correccion:lugar"}:
                grupo = respuesta.split(":", 1)[1]
                respuestas["_correccion_nivel"] = grupo
                _guardar_sesion(wa_id, "correccion", respuestas)
                await enviar_submenu_correccion(wa_id, respuestas, grupo)
                return
            if respuesta == "corregir:ninguno":
                respuestas.pop("_correccion_nivel", None)
                _guardar_sesion(wa_id, "confirmacion", respuestas)
                await enviar_confirmacion(wa_id, respuestas)
                return
            campo = (
                respuesta.removeprefix("corregir:")
                if respuesta.startswith("corregir:")
                else ""
            )
            if campo == "recapturar" and respuestas.get("_animales_total"):
                respuestas.pop("_correccion_nivel", None)
                respuestas["_animales"] = []
                respuestas["_animal_idx"] = 1
                respuestas["_modo"] = "distintos"
                respuestas["_recapturando"] = True
                for clave in CAMPOS_FICHA_ANIMAL:
                    respuestas.pop(clave, None)
                _guardar_sesion(wa_id, "foto", respuestas)
                await enviar_pregunta(wa_id, "foto", respuestas)
                return
            if campo not in ETIQUETAS_CORRECCION or campo not in respuestas:
                if nivel in {"animal", "lugar"}:
                    await enviar_submenu_correccion(wa_id, respuestas, nivel)
                else:
                    await enviar_menu_correccion(wa_id, respuestas)
                return
            respuestas.pop("_correccion_nivel", None)
            respuestas["_corrigiendo"] = campo
            _guardar_sesion(wa_id, campo, respuestas)
            await enviar_pregunta(wa_id, campo, respuestas)
            return
        if estado == "modo_grupo":
            respuesta = (
                _normalizar(contenido[1])
                if contenido and contenido[0] == "text"
                else ""
            )
            total = int(respuestas.get("cantidad", 2) or 2)
            if respuesta == "mama_crias":
                respuestas["_modo"] = "mama_crias"
                respuestas["cantidad"] = 1
                respuestas["sexo"] = "hembra"
                respuestas["trae_crias"] = True
                respuestas["numero_crias"] = max(total - 1, 1)
            elif respuesta == "grupo_parecido":
                respuestas["_modo"] = "grupo"
            elif respuesta == "distintos":
                if total > MAX_ANIMALES_DISTINTOS:
                    respuestas["_modo"] = "grupo"
                    await enviar_texto(
                        wa_id,
                        "Para más de "
                        f"{MAX_ANIMALES_DISTINTOS} animales distintos con detalle "
                        "conviene la app web. Aquí lo registraré como un grupo; "
                        "cuéntame lo más importante de cada uno en la descripción.",
                    )
                else:
                    respuestas["_modo"] = "distintos"
                    respuestas["_animales"] = []
                    respuestas["_animal_idx"] = 1
                    respuestas["_animales_total"] = total
            else:
                await enviar_pregunta(wa_id, "modo_grupo", respuestas)
                return
            _guardar_sesion(wa_id, "foto", respuestas)
            await enviar_pregunta(wa_id, "foto", respuestas)
            return

        if contenido is None:
            await enviar_texto(
                wa_id,
                "Todavía no puedo procesar ese tipo de mensaje. " + PREGUNTAS[estado],
            )
            return
        valido, valor, error = _validar_respuesta(estado, *contenido)
        if not valido:
            if error and error != PREGUNTAS[estado]:
                await enviar_texto(wa_id, error)
            else:
                await enviar_pregunta(wa_id, estado, respuestas)
            return
        if estado == "foto" and valor is None and (
            respuestas.get("cantidad", 1) == 1
            or respuestas.get("_modo") == "distintos"
        ):
            await enviar_texto(
                wa_id,
                "La foto es obligatoria para cada animal individual. "
                + PREGUNTAS[estado],
            )
            return
        respuestas[estado] = valor

        indice_foto = respuestas.pop("_reemplazando_foto_idx", None)
        if estado == "foto" and indice_foto is not None:
            respuestas["_animales"][indice_foto]["foto"] = valor
            respuestas.pop("foto", None)
            _guardar_sesion(wa_id, "confirmacion", respuestas)
            await enviar_confirmacion(wa_id, respuestas)
            return

        # Bucle de captura para "animales distintos": al cerrar la ficha completa
        # se guarda el animal y se pasa al siguiente.
        if respuestas.get("_modo") == "distintos" and estado == "descripcion_animal":
            respuestas.setdefault("_animales", []).append(
                {
                    campo: respuestas[campo]
                    for campo in CAMPOS_FICHA_ANIMAL
                    if campo in respuestas and respuestas[campo] is not None
                }
            )
            for clave in CAMPOS_FICHA_ANIMAL:
                respuestas.pop(clave, None)
            idx = respuestas.get("_animal_idx", 1)
            total = respuestas.get("_animales_total", 1)
            if idx < total:
                respuestas["_animal_idx"] = idx + 1
                _guardar_sesion(wa_id, "foto", respuestas)
                await enviar_pregunta(wa_id, "foto", respuestas)
                return
            if respuestas.pop("_recapturando", None):
                siguiente = "confirmacion"
            else:
                siguiente = "descripcion"
        else:
            siguiente = (
                "confirmacion"
                if respuestas.pop("_corrigiendo", None) == estado
                else _siguiente_estado(estado, respuestas)
            )
        _guardar_sesion(wa_id, siguiente, respuestas)
        if siguiente == "confirmacion":
            await enviar_confirmacion(wa_id, respuestas)
        else:
            await enviar_pregunta(wa_id, siguiente, respuestas)
    except Exception:
        _olvidar_mensaje(message_id)
        raise


async def procesar_webhook_meta(payload: dict[str, Any]) -> None:
    if payload.get("object") != "whatsapp_business_account":
        return
    for mensaje in _extraer_mensajes(payload):
        await _procesar_mensaje(mensaje)
