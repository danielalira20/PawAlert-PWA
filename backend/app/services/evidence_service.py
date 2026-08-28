"""Subida de evidencia fotografica compartida por hitos y avistamientos.

Sube una copia sanitizada (sin EXIF) al bucket y registra la fila "suelta"
en `reporte_evidencias` -- sin vincularla todavia a ningun evento. La
vinculacion y la verificacion EXIF contra el GPS del evento las hace cada
flujo por separado despues:

- hitos: `reports._vincular_y_verificar_evidencia` (al llamar POST /hitos).
- avistamientos: `avistamiento_service` (al llamar POST /avistamientos con
  `evidencia_id`).

Extraido de `reports.subir_foto_hito` para poder reusarlo desde el endpoint
de foto de avistamientos sin duplicar el procesamiento de imagen.
"""

from __future__ import annotations

from fastapi import HTTPException, UploadFile

from app.db.supabase import supabase_admin
from app.services import image_evidence_service, storage_service

CONTENT_TYPES_PERMITIDOS = (
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
)


async def subir_evidencia_suelta(
    foto: UploadFile,
    *,
    reporte_id: str,
    usuario_id: str,
    carpeta: str,
    sensible: bool = False,
) -> dict:
    """Valida+sanitiza la imagen, sube la copia publica y crea la fila suelta
    en `reporte_evidencias`. Devuelve
    `{foto_url, evidencia_id, exif_gps_disponible}` -- mismo contrato que
    devolvia `subir_foto_hito` antes del refactor.
    """
    if foto.content_type not in CONTENT_TYPES_PERMITIDOS:
        raise HTTPException(
            status_code=422, detail="La foto debe ser JPG, PNG o WEBP"
        )

    contenido = await foto.read()
    try:
        procesada = image_evidence_service.procesar_imagen_evidencia(contenido)
    except image_evidence_service.ImagenEvidenciaInvalida as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if sensible:
        foto_url = await storage_service.subir_bytes_privados(
            procesada.contenido_publico,
            carpeta=carpeta,
            content_type=procesada.content_type_publico,
            extension=procesada.extension_publica,
        )
    else:
        foto_url = await storage_service.subir_bytes(
            procesada.contenido_publico,
            carpeta=carpeta,
            content_type=procesada.content_type_publico,
            extension=procesada.extension_publica,
        )

    evidencia = supabase_admin.table("reporte_evidencias").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": usuario_id,
            "foto_url": foto_url,
            "formato_original": procesada.formato_original,
            "ancho": procesada.ancho,
            "alto": procesada.alto,
            "size_bytes_original": procesada.size_bytes_original,
            "exif_latitud": procesada.exif_latitud,
            "exif_longitud": procesada.exif_longitud,
            "exif_captured_at": procesada.exif_captured_at,
        }
    ).execute()
    if not evidencia.data:
        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar la evidencia fotográfica",
        )

    return {
        "foto_url": foto_url,
        "evidencia_id": evidencia.data[0]["id"],
        "exif_gps_disponible": procesada.tiene_gps_exif,
    }
