from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
FORMATOS_PERMITIDOS = {"JPEG", "PNG", "WEBP"}


class ImagenEvidenciaInvalida(ValueError):
    pass


@dataclass(frozen=True)
class ImagenEvidenciaProcesada:
    contenido_publico: bytes
    content_type_publico: str
    extension_publica: str
    formato_original: str
    ancho: int
    alto: int
    size_bytes_original: int
    exif_latitud: float | None
    exif_longitud: float | None
    exif_captured_at: str | None

    @property
    def tiene_gps_exif(self) -> bool:
        return self.exif_latitud is not None and self.exif_longitud is not None


def _numero(valor) -> float:
    if hasattr(valor, "numerator") and hasattr(valor, "denominator"):
        return float(valor.numerator) / float(valor.denominator)
    if isinstance(valor, tuple) and len(valor) == 2:
        return float(valor[0]) / float(valor[1])
    return float(valor)


def _coordenada_decimal(grados_minutos_segundos, referencia: str) -> float:
    grados, minutos, segundos = (_numero(v) for v in grados_minutos_segundos)
    coordenada = grados + minutos / 60 + segundos / 3600
    if referencia.upper() in ("S", "W"):
        coordenada *= -1
    return coordenada


def extraer_gps_exif(exif) -> tuple[float | None, float | None]:
    """Extrae GPS de un objeto EXIF de Pillow sin confiar en metadata cliente."""
    if not exif:
        return None, None

    gps_tag = getattr(getattr(ExifTags, "IFD", object()), "GPSInfo", 34853)
    try:
        gps = exif.get_ifd(gps_tag) if hasattr(exif, "get_ifd") else exif.get(gps_tag)
    except (KeyError, TypeError, ValueError):
        gps = exif.get(gps_tag) if hasattr(exif, "get") else None

    if not gps:
        return None, None

    try:
        latitud = _coordenada_decimal(gps[2], str(gps[1]))
        longitud = _coordenada_decimal(gps[4], str(gps[3]))
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None, None

    if not (-90 <= latitud <= 90 and -180 <= longitud <= 180):
        return None, None
    return latitud, longitud


def _extraer_fecha_exif(exif) -> str | None:
    if not exif:
        return None
    valor = exif.get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
    if not valor:
        return None
    try:
        return datetime.strptime(str(valor), "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        return None


def procesar_imagen_evidencia(contenido: bytes) -> ImagenEvidenciaProcesada:
    """Valida la imagen, extrae EXIF y genera una copia JPEG sin metadata."""
    if not contenido:
        raise ImagenEvidenciaInvalida("La fotografía está vacía")
    if len(contenido) > MAX_IMAGE_BYTES:
        raise ImagenEvidenciaInvalida("La fotografía supera el límite de 15 MB")

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with Image.open(BytesIO(contenido)) as imagen_validacion:
            formato = (imagen_validacion.format or "").upper()
            if formato not in FORMATOS_PERMITIDOS:
                raise ImagenEvidenciaInvalida("El formato real de la fotografía no está permitido")
            imagen_validacion.verify()

        with Image.open(BytesIO(contenido)) as imagen:
            formato = (imagen.format or "").upper()
            exif = imagen.getexif()
            exif_latitud, exif_longitud = extraer_gps_exif(exif)
            exif_captured_at = _extraer_fecha_exif(exif)
            ancho, alto = imagen.size
            if ancho * alto > MAX_IMAGE_PIXELS:
                raise ImagenEvidenciaInvalida(
                    "La fotografía supera el límite de 40 megapíxeles"
                )

            # La copia pública queda orientada correctamente y sin EXIF/GPS.
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
    except ImagenEvidenciaInvalida:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ImagenEvidenciaInvalida("El archivo no es una fotografía válida") from exc

    return ImagenEvidenciaProcesada(
        contenido_publico=salida.getvalue(),
        content_type_publico="image/jpeg",
        extension_publica="jpg",
        formato_original=formato,
        ancho=ancho,
        alto=alto,
        size_bytes_original=len(contenido),
        exif_latitud=exif_latitud,
        exif_longitud=exif_longitud,
        exif_captured_at=exif_captured_at,
    )
