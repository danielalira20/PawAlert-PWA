import math
from io import BytesIO

from PIL import Image, ImageOps

LIMITE_DISCREPANCIA_EXIF_METROS = 200

MENSAJE_UBICACION_GALERIA = (
    "Notamos que esta foto parece haberse tomado en un lugar distinto al que "
    "marcaste — puedes revisar tu ubicación o continuar de todas formas."
)
MENSAJE_UBICACION_CAMARA = (
    "La ubicación de esta foto no coincide con la que marcaste. Verifica que "
    "el pin esté en el lugar correcto antes de enviar tu reporte."
)


def _distancia_metros(
    latitud_origen: float, longitud_origen: float,
    latitud_destino: float, longitud_destino: float,
) -> float:
    radio_tierra = 6371000
    lat1 = math.radians(float(latitud_origen))
    lon1 = math.radians(float(longitud_origen))
    lat2 = math.radians(float(latitud_destino))
    lon2 = math.radians(float(longitud_destino))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    haversine = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return radio_tierra * 2 * math.asin(math.sqrt(haversine))


def verificar_ubicacion_exif(
    exif_latitud: float | None,
    exif_longitud: float | None,
    latitud_declarada: float | None,
    longitud_declarada: float | None,
) -> dict:
    """Compara GPS EXIF contra la ubicación declarada. Nunca lanza —
    ausencia de cualquiera de los 4 valores es 'sin_gps_exif', no error."""
    if None in (exif_latitud, exif_longitud, latitud_declarada, longitud_declarada):
        return {"distancia_m": None, "estado": "sin_gps_exif"}
    distancia = _distancia_metros(exif_latitud, exif_longitud, latitud_declarada, longitud_declarada)
    estado = "discrepancia" if distancia > LIMITE_DISCREPANCIA_EXIF_METROS else "coincidente"
    return {"distancia_m": distancia, "estado": estado}


def mensaje_advertencia_ubicacion(from_camera: bool) -> str:
    return MENSAJE_UBICACION_CAMARA if from_camera else MENSAJE_UBICACION_GALERIA


def sanear_sin_exif_de_emergencia(contenido: bytes) -> bytes:
    """Reencodea sin preservar EXIF y sin los límites de tamaño/resolución
    de procesar_imagen_evidencia. Último recurso cuando esa función
    rechaza la imagen: garantiza que nunca se publique una foto con GPS
    embebido, aunque se pierda el dato de comparación de ubicación para
    esa foto puntual."""
    with Image.open(BytesIO(contenido)) as imagen:
        sanitizada = ImageOps.exif_transpose(imagen)
        if getattr(sanitizada, "is_animated", False):
            sanitizada.seek(0)
        if sanitizada.mode not in ("RGB", "L"):
            fondo = Image.new("RGB", sanitizada.size, "white")
            if "A" in sanitizada.getbands():
                fondo.paste(sanitizada, mask=sanitizada.getchannel("A"))
            else:
                fondo.paste(sanitizada)
            sanitizada = fondo
        elif sanitizada.mode == "L":
            sanitizada = sanitizada.convert("RGB")
        salida = BytesIO()
        sanitizada.save(salida, format="JPEG", quality=90, optimize=True)
        return salida.getvalue()
