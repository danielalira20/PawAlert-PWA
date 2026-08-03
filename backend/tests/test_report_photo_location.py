from io import BytesIO

from PIL import Image

from app.services import report_photo_location_service as location


def test_verificar_ubicacion_exif_coincidente():
    resultado = location.verificar_ubicacion_exif(19.0414, -98.2063, 19.0415, -98.2064)
    assert resultado["estado"] == "coincidente"
    assert resultado["distancia_m"] < location.LIMITE_DISCREPANCIA_EXIF_METROS


def test_verificar_ubicacion_exif_discrepancia():
    resultado = location.verificar_ubicacion_exif(19.0414, -98.2063, 20.5, -99.5)
    assert resultado["estado"] == "discrepancia"
    assert resultado["distancia_m"] > location.LIMITE_DISCREPANCIA_EXIF_METROS


def test_verificar_ubicacion_exif_sin_gps_exif_por_falta_de_exif():
    resultado = location.verificar_ubicacion_exif(None, None, 19.0414, -98.2063)
    assert resultado == {"distancia_m": None, "estado": "sin_gps_exif"}


def test_verificar_ubicacion_exif_sin_gps_exif_por_falta_de_declarada():
    resultado = location.verificar_ubicacion_exif(19.0414, -98.2063, None, None)
    assert resultado == {"distancia_m": None, "estado": "sin_gps_exif"}


def test_verificar_ubicacion_exif_sin_gps_exif_sin_ningun_dato():
    resultado = location.verificar_ubicacion_exif(None, None, None, None)
    assert resultado == {"distancia_m": None, "estado": "sin_gps_exif"}


def test_mensaje_advertencia_ubicacion_camara():
    assert location.mensaje_advertencia_ubicacion(True) == location.MENSAJE_UBICACION_CAMARA


def test_mensaje_advertencia_ubicacion_galeria():
    assert location.mensaje_advertencia_ubicacion(False) == location.MENSAJE_UBICACION_GALERIA


def _jpeg_con_exif() -> bytes:
    salida = BytesIO()
    imagen = Image.new("RGB", (80, 60), "orange")
    exif = Image.Exif()
    exif[271] = "PawAlertTest"  # tag 271 = Make
    imagen.save(salida, format="JPEG", exif=exif)
    return salida.getvalue()


def test_sanear_sin_exif_de_emergencia_elimina_metadata():
    original = _jpeg_con_exif()
    with Image.open(BytesIO(original)) as verificacion:
        assert verificacion.getexif().get(271) == "PawAlertTest"

    saneada = location.sanear_sin_exif_de_emergencia(original)

    with Image.open(BytesIO(saneada)) as resultado:
        assert resultado.format == "JPEG"
        assert not resultado.getexif()
