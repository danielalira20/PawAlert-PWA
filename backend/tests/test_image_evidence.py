from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.api import reports
from app.services.image_evidence_service import (
    ImagenEvidenciaInvalida,
    extraer_gps_exif,
    procesar_imagen_evidencia,
)


class ExifFalso(dict):
    def get_ifd(self, _tag):
        return self[34853]


def _jpeg_simple() -> bytes:
    salida = BytesIO()
    Image.new("RGB", (80, 60), "orange").save(salida, format="JPEG")
    return salida.getvalue()


def _evidencia(*, latitud=19.4326, longitud=-99.1332):
    return {
        "id": "evidencia-1",
        "reporte_id": "reporte-1",
        "usuario_id": "usuario-1",
        "foto_url": "https://pawalert.test/evidencia.jpg",
        "tipo_hito": None,
        "vinculada_at": None,
        "exif_latitud": latitud,
        "exif_longitud": longitud,
    }


def test_extraer_gps_exif_convierte_grados_minutos_segundos():
    exif = ExifFalso(
        {
            34853: {
                1: "N",
                2: (19, 25, 57.36),
                3: "W",
                4: (99, 7, 59.52),
            }
        }
    )

    latitud, longitud = extraer_gps_exif(exif)

    assert latitud == pytest.approx(19.4326, abs=0.00001)
    assert longitud == pytest.approx(-99.1332, abs=0.00001)


def test_procesar_imagen_sin_exif_genera_jpeg_sanitizado():
    procesada = procesar_imagen_evidencia(_jpeg_simple())

    assert procesada.formato_original == "JPEG"
    assert procesada.tiene_gps_exif is False
    assert procesada.content_type_publico == "image/jpeg"
    with Image.open(BytesIO(procesada.contenido_publico)) as publica:
        assert publica.format == "JPEG"
        assert not publica.getexif()


def test_procesar_imagen_rechaza_archivo_que_no_es_imagen():
    with pytest.raises(ImagenEvidenciaInvalida, match="fotografía válida"):
        procesar_imagen_evidencia(b"esto no es una imagen")


def test_verificacion_exif_coincidente_no_requiere_revision(make_query):
    tabla = make_query(data=[_evidencia()])
    admin = MagicMock()
    admin.table.return_value = tabla

    with patch.object(reports, "supabase_admin", admin):
        resultado = reports._vincular_y_verificar_evidencia(
            evidencia_id="evidencia-1",
            reporte_id="reporte-1",
            usuario_id="usuario-1",
            tipo_hito="animal_encontrado",
            foto_url="https://pawalert.test/evidencia.jpg",
            latitud_declarada=19.4327,
            longitud_declarada=-99.1333,
        )

    assert resultado["estado"] == "coincidente"
    assert resultado["requiere_revision"] is False
    actualizacion = tabla.update.call_args.args[0]
    assert actualizacion["estado_verificacion"] == "coincidente"
    assert actualizacion["distancia_exif_declarada_m"] < 20


def test_verificacion_exif_distante_marca_revision(make_query):
    tabla = make_query(data=[_evidencia()])
    admin = MagicMock()
    admin.table.return_value = tabla

    with patch.object(reports, "supabase_admin", admin):
        resultado = reports._vincular_y_verificar_evidencia(
            evidencia_id="evidencia-1",
            reporte_id="reporte-1",
            usuario_id="usuario-1",
            tipo_hito="animal_encontrado",
            foto_url="https://pawalert.test/evidencia.jpg",
            latitud_declarada=19.4426,
            longitud_declarada=-99.1332,
        )

    assert resultado["estado"] == "discrepancia"
    assert resultado["requiere_revision"] is True
    assert resultado["distancia_metros"] > 1000
    actualizacion = tabla.update.call_args.args[0]
    assert actualizacion["estado_verificacion"] == "discrepancia"
    assert actualizacion["requiere_revision"] is True


def test_verificacion_sin_gps_exif_no_marca_revision(make_query):
    tabla = make_query(data=[_evidencia(latitud=None, longitud=None)])
    admin = MagicMock()
    admin.table.return_value = tabla

    with patch.object(reports, "supabase_admin", admin):
        resultado = reports._vincular_y_verificar_evidencia(
            evidencia_id="evidencia-1",
            reporte_id="reporte-1",
            usuario_id="usuario-1",
            tipo_hito="animal_encontrado",
            foto_url="https://pawalert.test/evidencia.jpg",
            latitud_declarada=19.4327,
            longitud_declarada=-99.1333,
        )

    assert resultado == {
        "evidencia_id": "evidencia-1",
        "estado": "sin_gps_exif",
        "distancia_metros": None,
        "requiere_revision": False,
    }
