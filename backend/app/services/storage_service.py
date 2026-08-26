import uuid
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
