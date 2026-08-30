import logging
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool
from app.db.supabase import supabase_admin

from app.config import settings


logger = logging.getLogger(__name__)


class ObjetoPrivadoYaExiste(RuntimeError):
    pass


async def subir_bytes(
    contenido: bytes,
    *,
    carpeta: str,
    content_type: str,
    extension: str,
) -> str:
    """Sube bytes ya validados/procesados y devuelve su URL pública."""
    extension_limpia = extension.lower().lstrip(".") or "bin"
    nombre_archivo = f"{uuid.uuid4()}.{extension_limpia}"
    ruta = f"{carpeta}/{nombre_archivo}"

    await run_in_threadpool(
        supabase_admin.storage.from_(settings.supabase_bucket).upload,
        path=ruta,
        file=contenido,
        file_options={"content-type": content_type},
    )

    return supabase_admin.storage.from_(settings.supabase_bucket).get_public_url(ruta)


async def subir_bytes_privados(
    contenido: bytes,
    *,
    carpeta: str,
    content_type: str,
    extension: str,
) -> str:
    """Guarda evidencia sensible sin generar una URL pública."""
    extension_limpia = extension.lower().lstrip(".") or "bin"
    nombre_archivo = f"{uuid.uuid4()}.{extension_limpia}"
    ruta = f"{carpeta}/{nombre_archivo}"
    bucket = settings.supabase_sensitive_bucket

    await run_in_threadpool(
        supabase_admin.storage.from_(bucket).upload,
        path=ruta,
        file=contenido,
        file_options={"content-type": content_type},
    )

    return f"storage://{bucket}/{ruta}"


async def subir_bytes_adopcion(
    contenido: bytes,
    *,
    carpeta: str,
    content_type: str,
    extension: str,
    nombre_archivo: str | None = None,
) -> str:
    """Guarda una imagen en el bucket privado de adopciones y devuelve su path."""
    extension_limpia = extension.lower().lstrip(".") or "bin"
    nombre = nombre_archivo or f"{uuid.uuid4()}.{extension_limpia}"
    if "/" in nombre or nombre in (".", ".."):
        raise ValueError("nombre_archivo_adopcion_invalido")
    ruta = f"{carpeta.rstrip('/')}/{nombre}"

    try:
        await run_in_threadpool(
            supabase_admin.storage.from_(
                settings.supabase_adoptions_bucket
            ).upload,
            path=ruta,
            file=contenido,
            file_options={"content-type": content_type},
        )
    except Exception as error:
        detalle = str(error).lower()
        if (
            "duplicate" in detalle
            or "already exists" in detalle
            or "409" in detalle
        ):
            raise ObjetoPrivadoYaExiste(ruta) from error
        raise

    return ruta


def _validar_path_evento(path: str) -> str:
    ruta = path.strip()
    if (
        not ruta.startswith("eventos/")
        or ruta.startswith("/")
        or ".." in ruta.split("/")
    ):
        raise ValueError("storage_path_evento_invalido")
    return ruta


async def subir_bytes_evento(
    contenido: bytes,
    *,
    carpeta: str,
    content_type: str,
    extension: str,
    nombre_archivo: str | None = None,
) -> str:
    """Guarda la imagen en el bucket privado de eventos y devuelve su path."""
    extension_limpia = extension.lower().lstrip(".") or "bin"
    nombre = nombre_archivo or f"{uuid.uuid4()}.{extension_limpia}"
    if "/" in nombre or nombre in (".", ".."):
        raise ValueError("nombre_archivo_evento_invalido")
    ruta = _validar_path_evento(f"{carpeta.rstrip('/')}/{nombre}")

    try:
        await run_in_threadpool(
            supabase_admin.storage.from_(
                settings.supabase_events_bucket
            ).upload,
            path=ruta,
            file=contenido,
            file_options={"content-type": content_type},
        )
    except Exception as error:
        detalle = str(error).lower()
        if (
            "duplicate" in detalle
            or "already exists" in detalle
            or "409" in detalle
        ):
            raise ObjetoPrivadoYaExiste(ruta) from error
        raise
    return ruta


async def subir_foto(foto: UploadFile, carpeta: str = "reportes") -> str:
    contenido = await foto.read()
    extension = foto.filename.split(".")[-1]
    return await subir_bytes(
        contenido,
        carpeta=carpeta,
        content_type=foto.content_type or "application/octet-stream",
        extension=extension,
    )

def eliminar_por_url(url: str) -> None:
    """Borra un objeto de Storage a partir de su URL pública. Limpieza de
    mejor esfuerzo para rollback: si el objeto ya no existe o el borrado
    falla, no debe tumbar el flujo que la está llamando."""
    marcador = f"/{settings.supabase_bucket}/"
    if marcador not in url:
        return
    ruta = url.split(marcador, 1)[1]
    try:
        supabase_admin.storage.from_(settings.supabase_bucket).remove([ruta])
    except Exception:
        pass


def crear_url_firmada_sensible(
    localizador: str,
    *,
    vigencia_segundos: int = 300,
) -> dict:
    """Genera acceso temporal a una evidencia del bucket privado.

    El localizador persistido nunca se expone al cliente. Tampoco se permite
    firmar objetos de otros buckets aunque una fila haya sido manipulada.
    """
    prefijo = "storage://"
    if not localizador.startswith(prefijo):
        raise ValueError("localizador_sensible_invalido")

    bucket, separador, ruta = localizador[len(prefijo):].partition("/")
    if (
        not separador
        or bucket != settings.supabase_sensitive_bucket
        or not ruta
        or ruta.startswith("/")
    ):
        raise ValueError("localizador_sensible_invalido")

    respuesta = supabase_admin.storage.from_(bucket).create_signed_url(
        ruta,
        vigencia_segundos,
    )
    if isinstance(respuesta, dict):
        url = (
            respuesta.get("signedURL")
            or respuesta.get("signed_url")
            or respuesta.get("signedUrl")
        )
    else:
        url = getattr(respuesta, "signed_url", None)

    if not url:
        raise RuntimeError("url_firmada_no_disponible")

    expira_at = datetime.now(timezone.utc) + timedelta(
        seconds=vigencia_segundos
    )
    return {
        "url": url,
        "expira_at": expira_at.isoformat(),
    }


def _validar_path_adopcion(path: str) -> str:
    ruta = path.strip()
    if (
        not ruta.startswith("adopciones/")
        or ruta.startswith("/")
        or ".." in ruta.split("/")
    ):
        raise ValueError("storage_path_adopcion_invalido")
    return ruta


def crear_url_firmada_adopcion(
    storage_path: str,
    *,
    vigencia_segundos: int = 600,
) -> dict:
    """Crea acceso temporal sin credenciales ni hacer público el bucket."""
    ruta = _validar_path_adopcion(storage_path)
    respuesta = supabase_admin.storage.from_(
        settings.supabase_adoptions_bucket
    ).create_signed_url(ruta, vigencia_segundos)
    if isinstance(respuesta, dict):
        url = (
            respuesta.get("signedURL")
            or respuesta.get("signed_url")
            or respuesta.get("signedUrl")
        )
    else:
        url = getattr(respuesta, "signed_url", None)
    if not url:
        raise RuntimeError("url_firmada_adopcion_no_disponible")
    expira_at = datetime.now(timezone.utc) + timedelta(
        seconds=vigencia_segundos
    )
    return {"url": url, "expira_at": expira_at.isoformat()}


def eliminar_objeto_adopcion(storage_path: str) -> bool:
    """Elimina una foto; el historial permite recuperar limpiezas fallidas."""
    try:
        ruta = _validar_path_adopcion(storage_path)
        supabase_admin.storage.from_(settings.supabase_adoptions_bucket).remove(
            [ruta]
        )
        return True
    except Exception:
        logger.warning(
            "No se pudo retirar un objeto privado de adopción",
            exc_info=True,
        )
        return False


def crear_url_firmada_evento(
    storage_path: str,
    *,
    vigencia_segundos: int = 600,
) -> dict:
    """Crea acceso temporal a una imagen de evento sin exponer su path."""
    ruta = _validar_path_evento(storage_path)
    respuesta = supabase_admin.storage.from_(
        settings.supabase_events_bucket
    ).create_signed_url(ruta, vigencia_segundos)
    if isinstance(respuesta, dict):
        url = (
            respuesta.get("signedURL")
            or respuesta.get("signed_url")
            or respuesta.get("signedUrl")
        )
    else:
        url = getattr(respuesta, "signed_url", None)
    if not url:
        raise RuntimeError("url_firmada_evento_no_disponible")
    expira_at = datetime.now(timezone.utc) + timedelta(
        seconds=vigencia_segundos
    )
    return {"url": url, "expira_at": expira_at.isoformat()}


def eliminar_objeto_evento(storage_path: str) -> bool:
    """Elimina una imagen de evento con limpieza de mejor esfuerzo."""
    try:
        ruta = _validar_path_evento(storage_path)
        supabase_admin.storage.from_(settings.supabase_events_bucket).remove(
            [ruta]
        )
        return True
    except Exception:
        logger.warning(
            "No se pudo retirar un objeto privado de eventos",
            exc_info=True,
        )
        return False
