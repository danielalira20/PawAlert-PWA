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

async def subir_foto(foto: UploadFile, carpeta: str = "reportes") -> str:
    contenido = await foto.read()
    extension = foto.filename.split(".")[-1]
    return await subir_bytes(
        contenido,
        carpeta=carpeta,
        content_type=foto.content_type or "application/octet-stream",
        extension=extension,
    )
