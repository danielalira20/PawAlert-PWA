import uuid
from fastapi import UploadFile
from app.db.supabase import supabase
from app.config import settings

async def subir_foto(foto: UploadFile, carpeta: str = "reportes") -> str:
    contenido = await foto.read()
    extension = foto.filename.split(".")[-1]
    nombre_archivo = f"{uuid.uuid4()}.{extension}"
    ruta = f"{carpeta}/{nombre_archivo}"

    supabase.storage.from_(settings.supabase_bucket).upload(
        path=ruta,
        file=contenido,
        file_options={"content-type": foto.content_type}
    )

    url = supabase.storage.from_(settings.supabase_bucket).get_public_url(ruta)
    return url