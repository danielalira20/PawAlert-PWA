import json
import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from unittest.mock import AsyncMock, MagicMock, patch
from app.main import app
from app.models.report import AnimalInput
from app.services import report_service
from app.services.report_service import _clasificar_escenario
from app.services.image_evidence_service import ImagenEvidenciaInvalida, ImagenEvidenciaProcesada

client = TestClient(app)


def _jpeg_real() -> bytes:
    """JPEG mínimo pero real — procesar_imagen_evidencia (no mockeado en
    algunos tests) necesita poder decodificarlo de verdad."""
    salida = BytesIO()
    Image.new("RGB", (10, 10), "orange").save(salida, format="JPEG")
    return salida.getvalue()


class FakeUploadFile:
    """Sustituto mínimo de UploadFile para probar crear_reporte sin FastAPI:
    solo expone lo que el loop de fotos realmente usa."""

    def __init__(self, filename="foto.jpg", content_type="image/jpeg", contenido=None):
        self.filename = filename
        self.content_type = content_type
        self._contenido = contenido if contenido is not None else _jpeg_real()

    async def read(self):
        return self._contenido


def _tablas_mock(make_query, configuracion):
    tablas = {nombre: make_query(**datos) for nombre, datos in configuracion.items()}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    return supabase, tablas


def _config_catalogos_basica():
    return {
        "reporte_estados": {"data": [{"id": "estado-pendiente"}]},
        "tipo_animal_catalogo": {"data": [{"id": "tipo-perro"}]},
        "condicion_catalogo": {"data": [{"id": "condicion-estable"}]},
        "tamanio_catalogo": {"data": [{"id": "tamanio-mediano"}]},
        "reportes": {"data": [{"id": "reporte-test-1", "created_at": "2026-08-01T00:00:00+00:00"}]},
        "animal": {"data": [{"id": "animal-test-1"}]},
        "animal_fotos": {"data": [{"id": "foto-test-1"}]},
        "historial_reporte": {"data": []},
    }


def _crear_reporte_con_fotos(supabase, fotos, fotos_animal_index, *, latitud=None, longitud=None):
    with (
        patch.object(report_service, "supabase", supabase),
        patch.object(report_service, "obtener_contactos_emergencia", return_value=[]),
        patch.object(report_service, "asignar_asociacion", return_value=None),
        patch(
            "app.services.report_moderation_service.calcular_phash",
            return_value="0" * 16,
        ),
        patch(
            "app.services.report_moderation_service.registrar_phash_reporte",
            return_value={"id": "hash-1", "alerta": False},
        ),
    ):
        return asyncio.run(report_service.crear_reporte(
            nombre="Juan", apellido_paterno="Pérez", apellido_materno=None,
            telefono="5512345678", email=None, usuario_id=None,
            animales=[AnimalInput(condicion="estable", tipo_animal="perro", tamanio="mediano")],
            latitud=latitud, longitud=longitud, calle=None, colonia="Centro", municipio="Puebla",
            referencia=None,
            fotos=fotos,
            fotos_ordenes=json.dumps(list(range(1, len(fotos) + 1))),
            fotos_animal_index=json.dumps(fotos_animal_index),
            estado_ubicacion=None,
            es_duplicado_confirmado=True,
            reporte_original_id=None,
        ))


def _procesada(*, exif_latitud=None, exif_longitud=None) -> ImagenEvidenciaProcesada:
    return ImagenEvidenciaProcesada(
        contenido_publico=b"saneada",
        content_type_publico="image/jpeg",
        extension_publica="jpg",
        formato_original="JPEG",
        ancho=800,
        alto=600,
        size_bytes_original=12345,
        exif_latitud=exif_latitud,
        exif_longitud=exif_longitud,
        exif_captured_at=None,
    )


def test_crear_reporte_rechaza_foto_y_limpia_storage_de_fotos_previas(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile(filename="ok.jpg"), FakeUploadFile(filename="rechazada.jpg")]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            side_effect=[
                {"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9, "condicion_estimada": "estable", "modelo": "gemini-3.5-flash-lite"},
                {"estado": "completado", "es_animal_real": False, "categoria_rechazo": "peluche_o_figura", "confianza": 0.87},
            ],
        ),
        patch.object(
            report_service,
            "subir_bytes",
            new=AsyncMock(side_effect=["https://x.supabase.co/storage/v1/object/public/bucket/foto1.jpg", "https://x.supabase.co/storage/v1/object/public/bucket/foto2.jpg"]),
        ),
        patch.object(report_service, "eliminar_por_url") as eliminar_mock,
    ):
        with pytest.raises(HTTPException) as exc_info:
            _crear_reporte_con_fotos(supabase, fotos, [0, 0])

    assert exc_info.value.status_code == 422
    assert "animal real" in exc_info.value.detail.lower()
    # La foto 1 sí se había subido a Storage antes de que la 2 fuera
    # rechazada — el rollback debe limpiarla, no solo borrar las filas de BD.
    eliminar_mock.assert_called_once_with("https://x.supabase.co/storage/v1/object/public/bucket/foto1.jpg")
    assert tablas["reportes"].delete.called
    assert tablas["animal"].delete.called


def test_crear_reporte_error_tecnico_no_bloquea_y_marca_revision(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "error_tecnico", "detalle": "timeout de Gemini"},
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")),
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0])

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["analisis_ia_estado"] == "error_tecnico"
    assert foto_insert["analisis_ia_error"] == "timeout de Gemini"
    assert foto_insert["requiere_revision"] is True

    eventos = [c.args[0]["tipo_evento"] for c in tablas["historial_reporte"].insert.call_args_list]
    assert "foto_revision_pendiente" in eventos
    # Sin condición estimada (falló el análisis), no debe tocar animal.condicion_estimada_ia.
    tablas["animal"].update.assert_not_called()


def test_crear_reporte_exito_guarda_analisis_y_condicion_estimada(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={
                "estado": "completado", "es_animal_real": True, "categoria_rechazo": None,
                "confianza": 0.95, "condicion_estimada": "herido", "modelo": "gemini-3.5-flash-lite",
            },
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")),
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0])

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["analisis_ia_estado"] == "completado"
    assert foto_insert["analisis_ia_condicion"] == "herido"
    assert foto_insert["analisis_ia_confianza"] == 0.95
    assert foto_insert["analisis_ia_modelo"] == "gemini-3.5-flash-lite"

    tablas["animal"].update.assert_called_once_with({"condicion_estimada_ia": "herido"})

    eventos = [c.args[0]["tipo_evento"] for c in tablas["historial_reporte"].insert.call_args_list]
    assert "foto_revision_pendiente" not in eventos


def test_crear_reporte_exif_discrepancia_no_bloquea(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9, "condicion_estimada": None},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=20.5, exif_longitud=-99.5),
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")) as subir_mock,
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0], latitud=19.0414, longitud=-98.2063)

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["exif_estado_verificacion"] == "discrepancia"
    assert foto_insert["exif_distancia_declarada_m"] > 200
    assert foto_insert["exif_latitud"] == 20.5
    assert foto_insert["exif_longitud"] == -99.5
    # Se sube la copia saneada (sin EXIF), nunca los bytes crudos.
    assert subir_mock.call_args.args[0] == b"saneada"


def test_crear_reporte_exif_coincidente(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9, "condicion_estimada": None},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=19.0415, exif_longitud=-98.2064),
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")),
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0], latitud=19.0414, longitud=-98.2063)

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["exif_estado_verificacion"] == "coincidente"
    assert foto_insert["exif_distancia_declarada_m"] < 200


def test_crear_reporte_exif_sin_gps(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9, "condicion_estimada": None},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=None, exif_longitud=None),
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")),
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0], latitud=19.0414, longitud=-98.2063)

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["exif_estado_verificacion"] == "sin_gps_exif"
    assert foto_insert["exif_distancia_declarada_m"] is None


def test_crear_reporte_procesar_imagen_evidencia_invalida_usa_saneo_de_emergencia(make_query):
    supabase, tablas = _tablas_mock(make_query, _config_catalogos_basica())
    fotos = [FakeUploadFile()]

    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9, "condicion_estimada": None},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            side_effect=ImagenEvidenciaInvalida("La fotografía supera el límite de 15 MB"),
        ),
        patch(
            "app.services.report_photo_location_service.sanear_sin_exif_de_emergencia",
            return_value=b"saneada-de-emergencia",
        ),
        patch.object(report_service, "subir_bytes", new=AsyncMock(return_value="https://x.supabase.co/storage/v1/object/public/bucket/foto.jpg")) as subir_mock,
    ):
        resultado = _crear_reporte_con_fotos(supabase, fotos, [0], latitud=19.0414, longitud=-98.2063)

    assert resultado["estado"] == "pendiente"
    foto_insert = tablas["animal_fotos"].insert.call_args.args[0]
    assert foto_insert["exif_latitud"] is None
    assert foto_insert["exif_longitud"] is None
    assert foto_insert["exif_estado_verificacion"] == "sin_gps_exif"
    # Nunca se suben los bytes crudos — ni siquiera en el camino de emergencia.
    assert subir_mock.call_args.args[0] == b"saneada-de-emergencia"
    assert subir_mock.call_args.args[0] != fotos[0]._contenido


def test_validar_foto_endpoint_valido():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9},
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    assert response.json() == {"valido": True, "mensaje": "", "advertencia": None, "advertencia_ubicacion": None}


def test_validar_foto_endpoint_rechazo_imagen_no_clara():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={"estado": "completado", "es_animal_real": False, "categoria_rechazo": "imagen_no_clara", "confianza": 0.4},
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is False
    assert "no se ve clara" in data["mensaje"]
    assert data["advertencia"] is None


def test_validar_foto_endpoint_error_tecnico_deja_pasar():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={"estado": "error_tecnico", "detalle": "timeout"},
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    assert response.json() == {"valido": True, "mensaje": "", "advertencia": None, "advertencia_ubicacion": None}


def test_validar_foto_endpoint_advertencia_identificacion_limitada():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={
            "estado": "completado", "es_animal_real": True, "categoria_rechazo": None,
            "confianza": 0.9, "calidad_identificacion": "limitada",
        },
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is True
    assert "otro ángulo" in data["advertencia"]


def test_validar_foto_endpoint_sin_advertencia_cuando_calidad_adecuada():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={
            "estado": "completado", "es_animal_real": True, "categoria_rechazo": None,
            "confianza": 0.9, "calidad_identificacion": "adecuada",
        },
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is True
    assert data["advertencia"] is None


def test_validar_foto_endpoint_advertencia_ubicacion_camara():
    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=20.5, exif_longitud=-99.5),
        ),
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
            data={"latitud": "19.0414", "longitud": "-98.2063", "from_camera": "true"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is True
    assert "Verifica que el pin" in data["advertencia_ubicacion"]


def test_validar_foto_endpoint_advertencia_ubicacion_galeria():
    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=20.5, exif_longitud=-99.5),
        ),
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
            data={"latitud": "19.0414", "longitud": "-98.2063", "from_camera": "false"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is True
    assert "puedes revisar tu ubicación" in data["advertencia_ubicacion"]


def test_validar_foto_endpoint_sin_advertencia_ubicacion_cuando_coincide():
    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
            return_value=_procesada(exif_latitud=19.0415, exif_longitud=-98.2064),
        ),
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
            data={"latitud": "19.0414", "longitud": "-98.2063", "from_camera": "false"},
        )
    assert response.status_code == 200
    assert response.json()["advertencia_ubicacion"] is None


def test_validar_foto_endpoint_sin_lat_lng_no_evalua_ubicacion():
    with patch(
        "app.services.report_photo_vision_service.verificar_foto_animal",
        return_value={"estado": "completado", "es_animal_real": True, "categoria_rechazo": None, "confianza": 0.9},
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
        )
    assert response.status_code == 200
    assert response.json()["advertencia_ubicacion"] is None


def test_validar_foto_endpoint_rechazo_gemini_no_evalua_exif():
    with (
        patch(
            "app.services.report_photo_vision_service.verificar_foto_animal",
            return_value={"estado": "completado", "es_animal_real": False, "categoria_rechazo": "no_hay_animal", "confianza": 0.2},
        ),
        patch(
            "app.services.image_evidence_service.procesar_imagen_evidencia",
        ) as procesar_mock,
    ):
        response = client.post(
            "/reports/validar-foto",
            files={"foto": ("foto.jpg", b"contenido-fake", "image/jpeg")},
            data={"latitud": "19.0414", "longitud": "-98.2063", "from_camera": "true"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["valido"] is False
    assert data["advertencia_ubicacion"] is None
    procesar_mock.assert_not_called()


def test_validar_foto_endpoint_content_type_invalido():
    response = client.post(
        "/reports/validar-foto",
        files={"foto": ("foto.gif", b"contenido-fake", "image/gif")},
    )
    assert response.status_code == 422


def test_report_sin_nombre_ni_usuario_id(animal_payload):
    response = client.post("/reports", data={
        "animales": json.dumps([animal_payload]),
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "nombre" in response.json()["detail"].lower()


def test_report_sin_telefono_ni_usuario_id(animal_payload):
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "animales": json.dumps([animal_payload]),
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "teléfono" in response.json()["detail"].lower()


def test_report_telefono_invalido(animal_payload):
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "telefono": "123",
        "animales": json.dumps([animal_payload]),
        "municipio": "Puebla",
    })
    assert response.status_code == 422
    assert "10 dígitos" in response.json()["detail"]


def test_report_sin_ubicacion(animal_payload):
    response = client.post("/reports", data={
        "nombre": "Juan",
        "apellido_paterno": "Pérez",
        "telefono": "5512345678",
        "animales": json.dumps([animal_payload]),
    })
    assert response.status_code == 422
    assert "coordenadas" in response.json()["detail"].lower() or "municipio" in response.json()["detail"].lower()


def test_report_detecta_duplicado():
    duplicado_mock = [{
        "id": "abc-123",
        "municipio": "Puebla",
        "colonia": "Centro",
        "created_at": "2026-01-01T00:00:00",
        "escenario": 1,
        "animal": {
            "id": "animal-123",
            "tipo_animal_catalogo": {"clave": "perro"},
            "condicion_catalogo": {"clave": "estable"},
        },
        "foto_url": None,
        "animales_resumen": [
            {"tipo_animal": "perro", "condicion": "estable", "cantidad": 1, "foto_url": None},
        ],
    }]

    with patch("app.services.report_service.verificar_duplicados", return_value=duplicado_mock):
        response = client.post("/reports", data={
            "nombre": "Juan",
            "apellido_paterno": "Pérez",
            "telefono": "5512345678",
            "municipio": "Puebla",
            "animales": json.dumps([
                {"condicion": "estable", "tipo_animal": "perro", "tamanio": "mediano"},
            ]),
        })

    assert response.status_code == 200
    data = response.json()
    assert data.get("posible_duplicado") is True
    assert data.get("escenario") == 1
    assert data["reporte_existente"]["id"] == "abc-123"
    assert data["reporte_existente"]["animales"] == duplicado_mock[0]["animales_resumen"]


def test_report_detecta_duplicado_escenario_2_grupo():
    duplicado_mock = [{
        "id": "abc-456",
        "municipio": "Puebla",
        "colonia": "Centro",
        "created_at": "2026-01-01T00:00:00",
        "escenario": 2,
        "animal": {
            "id": "animal-456",
            "tipo_animal_catalogo": {"clave": "gato"},
            "condicion_catalogo": {"clave": "grave"},
        },
        "foto_url": None,
        "animales_resumen": [
            {"tipo_animal": "gato", "condicion": "grave", "cantidad": 5, "foto_url": None},
        ],
    }]

    with patch("app.services.report_service.verificar_duplicados", return_value=duplicado_mock):
        response = client.post("/reports", data={
            "nombre": "Juan",
            "apellido_paterno": "Pérez",
            "telefono": "5512345678",
            "municipio": "Puebla",
            "animales": json.dumps([
                {"condicion": "estable", "tipo_animal": "gato", "tamanio": "pequeno"},
            ]),
        })

    assert response.status_code == 200
    data = response.json()
    assert data.get("posible_duplicado") is True
    assert data.get("escenario") == 2


def test_clasificar_escenario_1_coincidencia_simple():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 1, "es_grupo": False}]}
    assert _clasificar_escenario(existente, ["perro-id"], 1) == 1


def test_clasificar_escenario_2_existente_es_grupo():
    existente = {"animales": [{"tipo_animal_id": "gato-id", "cantidad": 5, "es_grupo": True}]}
    assert _clasificar_escenario(existente, ["gato-id"], 1) == 2


def test_clasificar_escenario_none_por_especie_no_cubierta():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 1, "es_grupo": False}]}
    assert _clasificar_escenario(existente, ["gato-id"], 1) is None


def test_clasificar_escenario_none_por_cantidad_mayor_130_por_ciento():
    existente = {"animales": [{"tipo_animal_id": "perro-id", "cantidad": 2, "es_grupo": True}]}
    assert _clasificar_escenario(existente, ["perro-id"], 10) is None


def test_crear_reporte_verifica_especies_unicas_y_cantidad_total():
    duplicado = {
        "id": "rep-existente", "municipio": "Puebla", "colonia": "Centro",
        "created_at": "2026-07-19T10:00:00+00:00", "escenario": 2,
        "animal": {}, "foto_url": None, "animales_resumen": [],
    }
    animales = [
        AnimalInput(condicion="estable", tipo_animal="perro", tamanio="mediano", cantidad=1),
        AnimalInput(condicion="grave", tipo_animal="gato", tamanio="pequeno", cantidad=3, es_grupo=True),
        AnimalInput(condicion="herido", tipo_animal="perro", tamanio="grande", cantidad=1),
    ]

    with patch.object(report_service, "verificar_duplicados", return_value=[duplicado]) as verificar:
        resultado = asyncio.run(report_service.crear_reporte(
            nombre="Juan", apellido_paterno="Pérez", apellido_materno=None,
            telefono="5512345678", email=None, usuario_id=None, animales=animales,
            latitud=None, longitud=None, calle=None, colonia="Centro", municipio="Puebla",
            estado_ubicacion=None, referencia=None,
        ))

    verificar.assert_called_once_with("Puebla", "Centro", ["perro", "gato"], 5)
    assert resultado["posible_duplicado"] is True
