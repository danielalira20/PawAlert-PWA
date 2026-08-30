import asyncio
import hashlib
import hmac
import json

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import whatsapp_report_service as service


def test_verificacion_webhook_meta(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_meta_verify_token", "token-prueba")
    cliente = TestClient(app)

    respuesta = cliente.get(
        "/webhooks/meta/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "token-prueba",
            "hub.challenge": "12345",
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.text == "12345"


def test_webhook_rechaza_firma_invalida(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_meta_app_secret", "app-secret")
    cliente = TestClient(app)

    respuesta = cliente.post(
        "/webhooks/meta/whatsapp",
        json={"object": "whatsapp_business_account", "entry": []},
        headers={"X-Hub-Signature-256": "sha256=incorrecta"},
    )

    assert respuesta.status_code == 403


def test_webhook_acepta_firma_y_delega(monkeypatch):
    secreto = "app-secret"
    payload = {"object": "whatsapp_business_account", "entry": []}
    cuerpo = json.dumps(payload, separators=(",", ":")).encode()
    firma = "sha256=" + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    recibidos = []

    async def procesar(payload_recibido):
        recibidos.append(payload_recibido)

    monkeypatch.setattr(settings, "whatsapp_meta_app_secret", secreto)
    monkeypatch.setattr("app.api.webhooks.procesar_webhook_meta", procesar)
    cliente = TestClient(app)

    respuesta = cliente.post(
        "/webhooks/meta/whatsapp",
        content=cuerpo,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": firma},
    )

    assert respuesta.status_code == 200
    assert recibidos == [payload]


def test_extrae_texto_y_ubicacion_del_payload():
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "uno",
                                    "from": "5211111111111",
                                    "type": "text",
                                    "text": {"body": "Hola"},
                                },
                                {
                                    "id": "dos",
                                    "from": "5211111111111",
                                    "type": "location",
                                    "location": {"latitude": 19.4, "longitude": -99.1},
                                },
                            ]
                        }
                    }
                ]
            }
        ]
    }

    mensajes = service._extraer_mensajes(payload)

    assert service._contenido(mensajes[0]) == ("text", "Hola")
    assert service._contenido(mensajes[1]) == (
        "location",
        {"latitud": 19.4, "longitud": -99.1, "nombre": None, "direccion": None},
    )


def test_extrae_imagen_de_meta():
    assert service._contenido(
        {
            "type": "image",
            "image": {"id": "media-1", "mime_type": "image/jpeg", "sha256": "hash"},
        }
    ) == (
        "image",
        {"media_id": "media-1", "mime_type": "image/jpeg", "sha256": "hash"},
    )


def test_extrae_respuestas_interactivas_de_meta():
    assert service._contenido(
        {
            "type": "interactive",
            "interactive": {
                "type": "button_reply",
                "button_reply": {"id": "estable", "title": "Estable"},
            },
        }
    ) == ("text", "estable")
    assert service._contenido(
        {
            "type": "interactive",
            "interactive": {
                "type": "list_reply",
                "list_reply": {"id": "corregir:ubicacion", "title": "Ubicación"},
            },
        }
    ) == ("text", "corregir:ubicacion")


def test_valida_opciones_con_acentos():
    assert service._validar_respuesta("tamanio", "text", "Pequeño") == (
        True,
        "pequeno",
        None,
    )
    valido, _, mensaje = service._validar_respuesta("condicion", "text", "no sé")
    assert valido is False
    assert "estable" in mensaje.lower()


def test_normaliza_telefono_mexicano():
    assert service._telefono_local("5212212848351") == "2212848351"
    assert service._telefono_local("522212848351") == "2212848351"


def test_ruta_individual_incluye_campos_condicionales():
    respuestas = {"cantidad": 1, "tipo_animal": "perro", "sexo": "hembra"}
    assert service._siguiente_estado("tamanio", respuestas) == "sexo"
    assert service._siguiente_estado("edad", respuestas) == "raza"
    assert service._siguiente_estado("comportamiento", respuestas) == "esta_prenada"


def test_ruta_grupo_omite_ficha_individual():
    respuestas = {"cantidad": 4, "tipo_animal": "gato"}
    assert service._siguiente_estado("tamanio", respuestas) == "edad"
    assert service._siguiente_estado("edad", respuestas) == "descripcion"


def test_foto_es_aceptada_y_omitir_se_distingue():
    foto = {"media_id": "media-1", "mime_type": "image/jpeg"}
    assert service._validar_respuesta("foto", "image", foto) == (True, foto, None)
    assert service._validar_respuesta("foto", "text", "OMITIR") == (True, None, None)


def test_opciones_interactivas_respetan_limites_de_meta():
    assert all(
        len(opciones) <= 10 for opciones in service.OPCIONES_INTERACTIVAS.values()
    )
    assert all(
        len(titulo) <= 24
        for opciones in service.OPCIONES_INTERACTIVAS.values()
        for _, titulo in opciones
    )
    # El menú superior de corrección y cada submenú deben caber en 10 filas.
    assert len(service.CAMPOS_CORRECCION_LUGAR) + 2 <= 10
    assert 9 + 1 <= 10  # submenú animal se recorta a 9 campos + "Volver"
    assert all(
        len(etiqueta) <= 24
        for etiqueta in service.ETIQUETAS_CORRECCION.values()
    )


def test_foto_rechazada_conserva_respuestas_y_regresa_a_foto(monkeypatch):
    guardado = {}
    enviados = []
    respuestas = {
        "nombre": "Miguel",
        "cantidad": 1,
        "foto": {"media_id": "mala"},
        "tipo_animal": "perro",
    }

    async def crear(*_args, **_kwargs):
        raise HTTPException(status_code=422, detail="No se ve un animal real.")

    async def enviar(_wa_id, texto, **_kwargs):
        enviados.append(texto)

    def guardar(_wa_id, estado, datos):
        guardado.update(estado=estado, respuestas=dict(datos))

    monkeypatch.setattr(service, "_crear_desde_respuestas", crear)
    monkeypatch.setattr(service, "enviar_texto", enviar)
    monkeypatch.setattr(service, "_guardar_sesion", guardar)

    resultado = asyncio.run(
        service._crear_reporte_con_recuperacion("5212210000000", respuestas)
    )

    assert resultado is None
    assert guardado["estado"] == "foto"
    assert "foto" not in guardado["respuestas"]
    assert guardado["respuestas"]["nombre"] == "Miguel"
    assert guardado["respuestas"]["_corrigiendo"] == "foto"
    assert "No perdiste tus demás respuestas" in enviados[0]


def test_despedida_incluye_folio_sitio_y_vista_previa(monkeypatch):
    enviado = {}

    async def enviar(_wa_id, texto, *, preview_url=False):
        enviado.update(texto=texto, preview_url=preview_url)

    monkeypatch.setattr(service, "enviar_texto", enviar)
    asyncio.run(service._enviar_reporte_creado("5212210000000", "folio-123"))

    assert "folio-123" in enviado["texto"]
    assert service.SITIO_PAWALERT in enviado["texto"]
    assert enviado["preview_url"] is True


def test_es_reinicio_reconoce_ordenes_de_nuevo_reporte():
    assert service._es_reinicio("Quiero hacer un reporte")
    assert service._es_reinicio("  NUEVO   REPORTE ")
    assert service._es_reinicio("Quiero hacer otro reporte")
    assert not service._es_reinicio("Miguel")
    assert not service._es_reinicio("estable")


def test_comando_de_reinicio_borra_sesion_atorada_y_reinicia(monkeypatch):
    eliminadas = []
    guardado = {}
    preguntas = []

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {"estado": "cantidad", "respuestas": {"nombre": "Miguel"}},
    )
    monkeypatch.setattr(service, "_eliminar_sesion", lambda wa_id: eliminadas.append(wa_id))

    def guardar(_wa_id, estado, datos):
        guardado.update(estado=estado, respuestas=dict(datos))

    async def enviar_pregunta(_wa_id, estado):
        preguntas.append(estado)

    monkeypatch.setattr(service, "_guardar_sesion", guardar)
    monkeypatch.setattr(service, "enviar_pregunta", enviar_pregunta)

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": "msg-1",
                "from": "5212210000000",
                "type": "text",
                "text": {"body": "Quiero hacer un reporte"},
            }
        )
    )

    assert eliminadas == ["5212210000000"]
    assert guardado == {"estado": service.INICIO, "respuestas": {}}
    assert preguntas == [service.INICIO]


def test_cantidad_otro_pide_numero_libre():
    valido, _, mensaje = service._validar_respuesta("cantidad", "text", "otro")
    assert valido is False
    assert "número" in mensaje
    assert service._validar_respuesta("cantidad", "text", "8") == (True, 8, None)
    valido, _, mensaje = service._validar_respuesta("cantidad", "text", "abc")
    assert valido is False


def test_cantidad_y_razas_respetan_limites_de_meta():
    assert len(service.OPCIONES_INTERACTIVAS["cantidad"]) <= 10
    for opciones in service.RAZAS_SUGERIDAS.values():
        assert len(opciones) + 1 <= 10
        assert all(len(titulo) <= 24 for _, titulo in opciones)


def test_enviar_pregunta_raza_manda_lista_segun_tipo(monkeypatch):
    capturado = {}

    async def enviar_opciones(_wa_id, texto, opciones, **_kwargs):
        capturado.update(texto=texto, opciones=list(opciones))

    monkeypatch.setattr(service, "enviar_opciones", enviar_opciones)

    asyncio.run(
        service.enviar_pregunta("5212210000000", "raza", {"tipo_animal": "gato"})
    )

    ids = [identificador for identificador, _ in capturado["opciones"]]
    assert ids == ["comun", "siames", "persa", "otro"]


def _correr_correccion(monkeypatch, estado, respuestas, body):
    guardado = {}
    opciones_enviadas = []

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {"estado": estado, "respuestas": dict(respuestas)},
    )

    def guardar(_wa_id, nuevo_estado, datos):
        guardado.update(estado=nuevo_estado, respuestas=dict(datos))

    async def enviar_opciones(_wa_id, texto, opciones, **_kwargs):
        opciones_enviadas.append((texto, [i for i, _ in opciones]))

    async def noop(*_a, **_k):
        return None

    monkeypatch.setattr(service, "_guardar_sesion", guardar)
    monkeypatch.setattr(service, "enviar_opciones", enviar_opciones)
    monkeypatch.setattr(service, "enviar_texto", noop)
    monkeypatch.setattr(service, "enviar_pregunta", noop)

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": f"m-{body}",
                "from": "5212210000000",
                "type": "text",
                "text": {"body": body},
            }
        )
    )
    return guardado, opciones_enviadas


def test_correccion_dos_niveles_llega_a_collar_y_agresivo(monkeypatch):
    base = {
        "nombre": "Miguel",
        "cantidad": 1,
        "tipo_animal": "perro",
        "condicion": "estable",
        "tamanio": "mediano",
        "sexo": "macho",
        "edad": "adulto",
        "raza": "mestizo",
        "tiene_collar": False,
        "comportamiento": False,
        "descripcion": "x",
        "ubicacion": {"municipio": "Puebla"},
        "referencia": "y",
        "foto": {"media_id": "1"},
    }

    guardado, enviadas = _correr_correccion(
        monkeypatch, "correccion", base, "correccion:animal"
    )
    assert guardado["estado"] == "correccion"
    assert guardado["respuestas"]["_correccion_nivel"] == "animal"
    ids_submenu = enviadas[-1][1]
    assert "corregir:tiene_collar" in ids_submenu
    assert "corregir:comportamiento" in ids_submenu
    assert ids_submenu[-1] == "correccion:volver"

    guardado, _ = _correr_correccion(
        monkeypatch,
        "correccion",
        {**base, "_correccion_nivel": "animal"},
        "corregir:comportamiento",
    )
    assert guardado["estado"] == "comportamiento"
    assert guardado["respuestas"]["_corrigiendo"] == "comportamiento"
    assert "_correccion_nivel" not in guardado["respuestas"]


def test_siguiente_estado_varios_animales_pregunta_modo_grupo():
    assert service._siguiente_estado("cantidad", {"cantidad": 1}) == "foto"
    assert service._siguiente_estado("cantidad", {"cantidad": 4}) == "modo_grupo"
    assert service._siguiente_estado("modo_grupo", {"cantidad": 4}) == "foto"


def test_siguiente_estado_mama_crias_salta_sexo_y_prenez():
    resp = {"cantidad": 1, "tipo_animal": "perro", "sexo": "hembra", "_modo": "mama_crias"}
    assert service._siguiente_estado("tamanio", resp) == "edad"
    assert service._siguiente_estado("edad", resp) == "raza"
    assert service._siguiente_estado("comportamiento", resp) == "descripcion"


def test_siguiente_estado_grupo_parecido_pregunta_una_vez():
    resp = {"cantidad": 5, "tipo_animal": "perro", "_modo": "grupo"}
    assert service._siguiente_estado("tamanio", resp) == "edad"
    assert service._siguiente_estado("edad", resp) == "descripcion"


def test_modo_grupo_mama_crias_precarga_datos(monkeypatch):
    guardado, _ = _correr_correccion(
        monkeypatch,
        "modo_grupo",
        {"nombre": "Ana", "cantidad": 5},
        "mama_crias",
    )
    r = guardado["respuestas"]
    assert guardado["estado"] == "foto"
    assert r["_modo"] == "mama_crias"
    assert r["cantidad"] == 1
    assert r["sexo"] == "hembra"
    assert r["trae_crias"] is True
    assert r["numero_crias"] == 4


def test_modo_grupo_distintos_inicializa_bucle(monkeypatch):
    guardado, _ = _correr_correccion(
        monkeypatch,
        "modo_grupo",
        {"nombre": "Ana", "cantidad": 3},
        "distintos",
    )
    r = guardado["respuestas"]
    assert guardado["estado"] == "foto"
    assert r["_modo"] == "distintos"
    assert r["_animal_idx"] == 1
    assert r["_animales_total"] == 3
    assert r["_animales"] == []


def test_modo_grupo_distintos_muchos_cae_a_grupo(monkeypatch):
    guardado, _ = _correr_correccion(
        monkeypatch,
        "modo_grupo",
        {"nombre": "Ana", "cantidad": 9},
        "distintos",
    )
    assert guardado["respuestas"]["_modo"] == "grupo"
    assert "_animales" not in guardado["respuestas"]


def test_bucle_distintos_cierra_ficha_y_pasa_al_siguiente(monkeypatch):
    base = {
        "nombre": "Ana",
        "cantidad": 2,
        "_modo": "distintos",
        "_animal_idx": 1,
        "_animales_total": 2,
        "_animales": [],
        "tipo_animal": "perro",
        "condicion": "herido",
        "tamanio": "mediano",
    }
    guardado, _ = _correr_correccion(monkeypatch, "edad", base, "adulto")
    r = guardado["respuestas"]
    assert guardado["estado"] == "tipo_animal"
    assert r["_animal_idx"] == 2
    assert len(r["_animales"]) == 1
    assert r["_animales"][0]["tipo_animal"] == "perro"
    assert "tipo_animal" not in r  # limpió la ficha para el siguiente animal


def test_bucle_distintos_ultimo_animal_va_a_descripcion(monkeypatch):
    base = {
        "nombre": "Ana",
        "cantidad": 2,
        "_modo": "distintos",
        "_animal_idx": 2,
        "_animales_total": 2,
        "_animales": [{"tipo_animal": "perro", "condicion": "herido",
                       "tamanio": "mediano", "edad": "adulto"}],
        "tipo_animal": "gato",
        "condicion": "estable",
        "tamanio": "pequeno",
    }
    guardado, _ = _correr_correccion(monkeypatch, "edad", base, "cachorro")
    assert guardado["estado"] == "descripcion"
    assert len(guardado["respuestas"]["_animales"]) == 2


def test_crear_desde_respuestas_con_varios_animales(monkeypatch):
    capturado = {}

    async def fake_crear_reporte(**kwargs):
        capturado.update(kwargs)
        return {"id": "rep-1"}

    monkeypatch.setattr(service, "crear_reporte", fake_crear_reporte)

    respuestas = {
        "nombre": "Ana",
        "_animales": [
            {"tipo_animal": "perro", "condicion": "herido", "tamanio": "grande",
             "edad": "adulto"},
            {"tipo_animal": "gato", "condicion": "estable", "tamanio": "pequeno",
             "edad": "cachorro"},
        ],
        "descripcion": "Dos animales juntos en el mismo predio.",
        "referencia": "Calle 5",
        "ubicacion": {"municipio": "Puebla"},
    }
    asyncio.run(service._crear_desde_respuestas("5212210000000", respuestas))

    animales = capturado["animales"]
    assert [a.tipo_animal for a in animales] == ["perro", "gato"]
    assert [a.orden for a in animales] == [1, 2]
    assert all(a.cantidad == 1 and a.es_grupo is False for a in animales)
