import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import whatsapp_report_service as service
from app.services.report_service import FotoAnimalRechazada


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


def test_ruta_individual_pide_descripcion_propia_y_cachorro_no_pide_prenez():
    respuestas = {
        "cantidad": 1,
        "tipo_animal": "gato",
        "sexo": "hembra",
        "edad": "cachorro",
    }
    assert service._siguiente_estado("es_domestico", respuestas) == "descripcion_animal"
    assert service._siguiente_estado("descripcion_animal", respuestas) == "descripcion"
    assert service._siguiente_tras_correccion("sexo", respuestas) == "confirmacion"


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


def test_foto_rechazada_en_distintos_reemplaza_solo_la_ficha(monkeypatch):
    guardado = {}
    enviados = []
    respuestas = {
        "nombre": "Diana López",
        "_modo": "distintos",
        "_animales": [
            {"foto": {"media_id": "buena"}, "tipo_animal": "perro"},
            {"foto": {"media_id": "mala"}, "tipo_animal": "perro"},
        ],
    }

    async def crear(*_args, **_kwargs):
        raise FotoAnimalRechazada(1, "No se ve un animal real.")

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
    assert guardado["respuestas"]["_reemplazando_foto_idx"] == 1
    assert len(guardado["respuestas"]["_animales"]) == 2
    assert "animal 2" in enviados[0]


def test_foto_se_valida_inmediatamente_y_rechazo_no_avanza(monkeypatch):
    enviados = []
    guardados = []

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {
            "estado": "foto",
            "respuestas": {
                "cantidad": 2,
                "_modo": "distintos",
                "_animal_idx": 1,
                "_animales_total": 2,
                "_animales": [],
            },
        },
    )

    async def validar(_media):
        return {"es_animal_real": False, "categoria_rechazo": "peluche_o_figura"}

    async def enviar(_wa_id, texto, **_kwargs):
        enviados.append(texto)

    monkeypatch.setattr(service, "_validar_foto_inmediatamente", validar)
    monkeypatch.setattr(service, "enviar_texto", enviar)
    monkeypatch.setattr(service, "_guardar_sesion", lambda *args: guardados.append(args))

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": "foto-peluche",
                "from": "5212210000000",
                "type": "image",
                "image": {"id": "media-1", "mime_type": "image/jpeg"},
            }
        )
    )

    assert not guardados
    assert "peluche" in enviados[0].lower()
    assert "envía otra foto" in enviados[0].lower()


def test_foto_valida_avanza_y_conserva_resultado_vision(monkeypatch):
    guardado = {}

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {
            "estado": "foto",
            "respuestas": {"cantidad": 1},
        },
    )

    resultado_vision = {
        "estado": "completado",
        "es_animal_real": True,
        "confianza": 0.98,
    }

    async def validar(_media):
        return resultado_vision

    async def noop(*_args, **_kwargs):
        return None

    def guardar(_wa_id, estado, respuestas):
        guardado.update(estado=estado, respuestas=dict(respuestas))

    monkeypatch.setattr(service, "_validar_foto_inmediatamente", validar)
    monkeypatch.setattr(service, "_guardar_sesion", guardar)
    monkeypatch.setattr(service, "enviar_pregunta", noop)

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": "foto-real",
                "from": "5212210000000",
                "type": "image",
                "image": {"id": "media-2", "mime_type": "image/jpeg"},
            }
        )
    )

    assert guardado["estado"] == "tipo_animal"
    assert guardado["respuestas"]["foto"]["media_id"] == "media-2"
    assert guardado["respuestas"]["_validacion_foto"] == resultado_vision


def test_continuar_reactiva_sesion_y_repite_confirmacion(monkeypatch):
    guardado = {}
    confirmaciones = []

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {
            "estado": "confirmacion",
            "respuestas": {service.MARCA_AVISO_INACTIVIDAD: True},
        },
    )
    monkeypatch.setattr(
        service,
        "_guardar_sesion",
        lambda _wa_id, estado, respuestas: guardado.update(
            estado=estado, respuestas=dict(respuestas)
        ),
    )

    async def confirmar(_wa_id, respuestas):
        confirmaciones.append(dict(respuestas))

    monkeypatch.setattr(service, "enviar_confirmacion", confirmar)

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": "continuar-1",
                "from": "5212210000000",
                "type": "text",
                "text": {"body": "CONTINUAR"},
            }
        )
    )

    assert guardado["estado"] == "confirmacion"
    assert service.MARCA_AVISO_INACTIVIDAD not in guardado["respuestas"]
    assert len(confirmaciones) == 1


def test_cron_avisa_y_expira_sesiones_sin_duplicar(monkeypatch):
    ahora = datetime(2026, 8, 29, 20, 30, tzinfo=timezone.utc)
    sesiones = [
        {
            "wa_id": "aviso",
            "estado": "edad",
            "respuestas": {},
            "actualizado_at": (ahora - timedelta(minutes=16)).isoformat(),
        },
        {
            "wa_id": "expira",
            "estado": "foto",
            "respuestas": {service.MARCA_AVISO_INACTIVIDAD: True},
            "actualizado_at": (ahora - timedelta(minutes=11)).isoformat(),
        },
    ]
    operaciones = []

    class Resultado:
        def __init__(self, data):
            self.data = data

    class Consulta:
        def __init__(self):
            self.operacion = "select"
            self.datos = None

        def select(self, *_args):
            return self

        def lte(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def update(self, datos):
            self.operacion = "update"
            self.datos = datos
            return self

        def delete(self):
            self.operacion = "delete"
            return self

        def execute(self):
            operaciones.append((self.operacion, self.datos))
            return Resultado(sesiones if self.operacion == "select" else [{}])

    class SupabaseFalso:
        def table(self, _nombre):
            return Consulta()

    enviados = []

    async def enviar(wa_id, texto, **_kwargs):
        enviados.append((wa_id, texto))

    monkeypatch.setattr(service, "supabase_admin", SupabaseFalso())
    monkeypatch.setattr(service, "enviar_texto", enviar)
    monkeypatch.setattr(service.settings, "whatsapp_meta_access_token", "token")
    monkeypatch.setattr(service.settings, "whatsapp_meta_phone_number_id", "phone")
    monkeypatch.setattr(service.settings, "whatsapp_session_warning_minutes", 15)
    monkeypatch.setattr(service.settings, "whatsapp_session_expiration_minutes", 25)

    resultado = asyncio.run(service.procesar_inactividad_sesiones(ahora))

    assert resultado == {"avisadas": 1, "expiradas": 1}
    assert [operacion for operacion, _ in operaciones] == ["select", "update", "delete"]
    assert "10 minutos" in enviados[0][1]
    assert "sesión expiró" in enviados[1][1]


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


def test_comando_de_reinicio_atrasado_no_borra_sesion_actual(monkeypatch):
    eliminadas = []
    guardadas = []
    preguntas = []
    ultima_actividad = datetime(2026, 8, 29, 20, 16, tzinfo=timezone.utc)
    mensaje_antiguo = datetime(2026, 8, 29, 20, 12, tzinfo=timezone.utc)

    monkeypatch.setattr(service, "_registrar_mensaje", lambda *_a: True)
    monkeypatch.setattr(
        service,
        "_sesion",
        lambda _wa_id: {
            "estado": "edad",
            "respuestas": {"nombre": "Diana"},
            "actualizado_at": ultima_actividad.isoformat(),
        },
    )
    monkeypatch.setattr(service, "_eliminar_sesion", lambda wa_id: eliminadas.append(wa_id))
    monkeypatch.setattr(service, "_guardar_sesion", lambda *args: guardadas.append(args))

    async def preguntar(*args):
        preguntas.append(args)

    monkeypatch.setattr(service, "enviar_pregunta", preguntar)

    asyncio.run(
        service._procesar_mensaje(
            {
                "id": "reinicio-atrasado",
                "from": "5212210000000",
                "timestamp": str(int(mensaje_antiguo.timestamp())),
                "type": "text",
                "text": {"body": "Quiero hacer un reporte"},
            }
        )
    )

    assert eliminadas == []
    assert guardadas == []
    assert preguntas == []


def test_mensaje_sin_sesion_demasiado_antiguo_se_ignora():
    ahora = datetime(2026, 8, 29, 20, 30, tzinfo=timezone.utc)
    mensaje = {
        "timestamp": str(int((ahora - timedelta(minutes=6)).timestamp()))
    }
    assert service._mensaje_llego_atrasado(mensaje, None, ahora) is True
    mensaje["timestamp"] = str(int((ahora - timedelta(minutes=4)).timestamp()))
    assert service._mensaje_llego_atrasado(mensaje, None, ahora) is False


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


def test_siguiente_estado_distintos_repite_ficha_completa():
    perro = {
        "cantidad": 2,
        "tipo_animal": "perro",
        "sexo": "hembra",
        "_modo": "distintos",
    }
    assert service._siguiente_estado("tamanio", perro) == "sexo"
    assert service._siguiente_estado("edad", perro) == "raza"
    assert service._siguiente_estado("comportamiento", perro) == "esta_prenada"
    assert service._siguiente_estado("numero_crias", perro) == "descripcion_animal"

    gato = {**perro, "tipo_animal": "gato", "sexo": "macho"}
    assert service._siguiente_estado("tiene_collar", gato) == "es_domestico"
    assert service._siguiente_estado("es_domestico", gato) == "descripcion_animal"


def test_correccion_sexo_limpia_datos_dependientes():
    respuestas = {
        "sexo": "macho",
        "esta_prenada": True,
        "trae_crias": True,
        "numero_crias": 3,
    }
    assert service._siguiente_tras_correccion("sexo", respuestas) == "confirmacion"
    assert "esta_prenada" not in respuestas
    assert "trae_crias" not in respuestas
    assert "numero_crias" not in respuestas

    respuestas["sexo"] = "hembra"
    assert service._siguiente_tras_correccion("sexo", respuestas) == "esta_prenada"


def test_correccion_tipo_limpia_campos_incompatibles():
    respuestas = {
        "tipo_animal": "gato",
        "raza": "mestizo",
        "tiene_collar": False,
        "comportamiento": True,
        "esta_prenada": False,
    }
    assert service._siguiente_tras_correccion("tipo_animal", respuestas) == "raza"
    assert "raza" not in respuestas
    assert "comportamiento" not in respuestas
    assert "esta_prenada" not in respuestas


def test_correccion_cantidad_recaptura_animales_y_conserva_lugar():
    respuestas = {
        "cantidad": 3,
        "tipo_animal": "perro",
        "foto": {"media_id": "anterior"},
        "_modo": "grupo",
        "descripcion": "Situación ya capturada",
        "ubicacion": {"municipio": "Puebla"},
        "referencia": "Frente al parque",
    }
    assert service._siguiente_tras_correccion("cantidad", respuestas) == "modo_grupo"
    assert "tipo_animal" not in respuestas
    assert "foto" not in respuestas
    assert "_modo" not in respuestas
    assert respuestas["descripcion"] == "Situación ya capturada"
    assert respuestas["ubicacion"] == {"municipio": "Puebla"}
    assert respuestas["_correccion_cantidad"] is True


def test_correccion_a_hembra_pregunta_prenez_y_crias(monkeypatch):
    base = {
        "cantidad": 1,
        "tipo_animal": "perro",
        "condicion": "estable",
        "tamanio": "mediano",
        "sexo": "macho",
        "edad": "adulto",
        "foto": {"media_id": "foto"},
        "descripcion": "Está cerca del tránsito",
        "ubicacion": {"municipio": "Puebla"},
        "referencia": "Frente al parque",
        "_corrigiendo": "sexo",
    }
    guardado, _ = _correr_correccion(monkeypatch, "sexo", base, "hembra")
    assert guardado["estado"] == "esta_prenada"
    assert guardado["respuestas"]["_correccion_dependiente"] == "sexo"

    guardado, _ = _correr_correccion(
        monkeypatch, "esta_prenada", guardado["respuestas"], "no"
    )
    assert guardado["estado"] == "trae_crias"

    guardado, _ = _correr_correccion(
        monkeypatch, "trae_crias", guardado["respuestas"], "no"
    )
    assert guardado["estado"] == "confirmacion"
    assert "_correccion_dependiente" not in guardado["respuestas"]


def test_ubicacion_primero_pide_metodo_y_luego_direccion(monkeypatch):
    guardado, opciones = _correr_correccion(
        monkeypatch,
        "ubicacion",
        {"descripcion": "Dos perros en riesgo"},
        "ubicacion:escribir",
    )

    assert guardado["estado"] == "ubicacion"
    assert guardado["respuestas"]["_esperando_ubicacion_texto"] is True

    guardado, _ = _correr_correccion(
        monkeypatch,
        "ubicacion",
        guardado["respuestas"],
        "Avenida Juárez 2318, La Paz, Puebla",
    )
    assert guardado["estado"] == "referencia"
    assert guardado["respuestas"]["ubicacion"] == {
        "direccion": "Avenida Juárez 2318, La Paz, Puebla"
    }
    assert "_esperando_ubicacion_texto" not in guardado["respuestas"]


def test_referencia_puede_omitirse():
    assert service._validar_respuesta("referencia", "text", "OMITIR") == (
        True,
        None,
        None,
    )


def test_descripcion_animal_es_opcional():
    assert service._validar_respuesta(
        "descripcion_animal", "text", "OMITIR"
    ) == (True, None, None)
    assert service._validar_respuesta(
        "descripcion_animal", "text", "Mancha blanca en el pecho"
    ) == (True, "Mancha blanca en el pecho", None)


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


def test_bucle_distintos_cierra_ficha_completa_y_pasa_a_foto(monkeypatch):
    foto = {"media_id": "foto-1", "mime_type": "image/jpeg"}
    base = {
        "nombre": "Ana",
        "cantidad": 2,
        "_modo": "distintos",
        "_animal_idx": 1,
        "_animales_total": 2,
        "_animales": [],
        "foto": foto,
        "tipo_animal": "perro",
        "condicion": "herido",
        "tamanio": "mediano",
        "sexo": "macho",
        "edad": "adulto",
        "raza": "mestizo",
        "tiene_collar": False,
        "comportamiento": False,
    }
    guardado, _ = _correr_correccion(
        monkeypatch, "descripcion_animal", base, "Mancha blanca"
    )
    r = guardado["respuestas"]
    assert guardado["estado"] == "foto"
    assert r["_animal_idx"] == 2
    assert len(r["_animales"]) == 1
    assert r["_animales"][0]["tipo_animal"] == "perro"
    assert r["_animales"][0]["foto"] == foto
    assert r["_animales"][0]["sexo"] == "macho"
    assert r["_animales"][0]["tiene_collar"] is False
    assert r["_animales"][0]["comportamiento"] is False
    assert r["_animales"][0]["descripcion_animal"] == "Mancha blanca"
    assert "tipo_animal" not in r  # limpió la ficha para el siguiente animal
    assert "foto" not in r


def test_bucle_distintos_ultimo_animal_va_a_descripcion(monkeypatch):
    foto_1 = {"media_id": "foto-1", "mime_type": "image/jpeg"}
    foto_2 = {"media_id": "foto-2", "mime_type": "image/jpeg"}
    base = {
        "nombre": "Ana",
        "cantidad": 2,
        "_modo": "distintos",
        "_animal_idx": 2,
        "_animales_total": 2,
        "_animales": [{"foto": foto_1, "tipo_animal": "perro",
                       "condicion": "herido", "tamanio": "mediano",
                       "sexo": "macho", "edad": "adulto", "raza": "mestizo",
                       "tiene_collar": False, "comportamiento": False}],
        "foto": foto_2,
        "tipo_animal": "gato",
        "condicion": "estable",
        "tamanio": "pequeno",
        "sexo": "macho",
        "edad": "cachorro",
        "raza": "comun",
        "tiene_collar": True,
        "es_domestico": True,
    }
    guardado, _ = _correr_correccion(
        monkeypatch, "descripcion_animal", base, "OMITIR"
    )
    assert guardado["estado"] == "descripcion"
    assert len(guardado["respuestas"]["_animales"]) == 2


def test_crear_desde_respuestas_con_varios_animales(monkeypatch):
    capturado = {}

    async def fake_crear_reporte(**kwargs):
        capturado.update(kwargs)
        return {"id": "rep-1"}

    monkeypatch.setattr(service, "crear_reporte", fake_crear_reporte)

    async def fake_descargar(media):
        return f"archivo-{media['media_id']}"

    monkeypatch.setattr(service, "_descargar_imagen", fake_descargar)

    respuestas = {
        "nombre": "Ana",
        "_animales": [
            {"foto": {"media_id": "1"}, "tipo_animal": "perro",
             "condicion": "herido", "tamanio": "grande", "sexo": "hembra",
             "edad": "adulto", "raza": "mestizo", "tiene_collar": True,
             "comportamiento": False, "esta_prenada": True, "trae_crias": True,
             "numero_crias": 2, "descripcion_animal": "Café con pecho blanco"},
            {"foto": {"media_id": "2"}, "tipo_animal": "gato",
             "condicion": "estable", "tamanio": "pequeno", "sexo": "macho",
             "edad": "cachorro", "raza": "comun", "tiene_collar": False,
             "es_domestico": True},
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
    assert animales[0].sexo.value == "hembra"
    assert animales[0].raza_clave == "mestizo"
    assert animales[0].esta_prenada is True
    assert animales[0].numero_crias_nacidas == 2
    assert animales[0].descripcion == (
        "Café con pecho blanco\n"
        "Situación general: Dos animales juntos en el mismo predio."
    )
    assert animales[1].descripcion == (
        "Situación general: Dos animales juntos en el mismo predio."
    )
    assert animales[1].es_domestico_probable is True
    assert capturado["fotos"] == ["archivo-1", "archivo-2"]
    assert capturado["fotos_animal_index"] == "[0, 1]"
