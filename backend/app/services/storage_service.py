import uuid
from datetime import datetime, timedelta, timezone
from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool
from app.db.supabase import supabase_admin

from app.config import settings


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
