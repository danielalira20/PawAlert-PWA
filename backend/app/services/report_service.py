import uuid
from fastapi import UploadFile
from fastapi import HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia

async def crear_reporte(
    nombre: str,
    apellido_paterno: str,
    apellido_materno: str | None,
    telefono: str,
    email: str | None,
    foto: UploadFile,
    condicion: str,
    tipo_animal: str,
    tamanio: str,
    latitud: float | None,
    longitud: float | None,
    calle: str | None,
    colonia: str | None,
    municipio: str | None,
    referencia: str | None,
    descripcion: str | None
) -> dict:

    # 1 — Crear o reutilizar usuario
    
    resultado = supabase.table("usuarios").select("id").eq("telefono", telefono).execute()

    if resultado.data and len(resultado.data) > 0:
        usuario_id = resultado.data[0]["id"]
    else:
        usuario_nuevo = supabase.table("usuarios").insert({
            "nombre": nombre,
            "apellido_paterno": apellido_paterno,
            "apellido_materno": apellido_materno,
            "telefono": telefono,
            "email": email,
        }).execute()
        usuario_id = usuario_nuevo.data[0]["id"]

    # 2 — Subir foto a Supabase Storage
    foto_url = await subir_foto(foto)

    # 3 — Asignar asociación por radio
    asociacion = None
    asociacion_id = None
    if latitud and longitud:
        asociacion = asignar_asociacion(latitud, longitud)
        if asociacion:
            asociacion_id = asociacion["id"]

    # 4 — Crear reporte
    reporte_data = {
        "usuario_id": usuario_id,
        "foto_url": foto_url,
        "tipo_animal": tipo_animal,
        "condicion": condicion,
        "tamanio": tamanio,
        "descripcion": descripcion,
        "latitud": latitud,
        "longitud": longitud,
        "ubicacion_fuente": "gps" if latitud and longitud else "manual",
        "calle": calle,
        "colonia": colonia,
        "municipio": municipio,
        "referencia": referencia,
        "estado_reporte": "pendiente",
        "asociacion_asignada_id": asociacion_id,
    }

    reporte = supabase.table("reportes").insert(reporte_data).execute()
    print("REPORTE INSERTADO:", reporte.data)
    reporte_id = reporte.data[0]["id"]
    created_at = reporte.data[0]["created_at"]

    # 5 — Registrar en historial de asignaciones si hay asociación
    if asociacion_id:
        supabase.table("reporte_asignaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": asociacion_id,
            "estado": "aceptado",
        }).execute()

        supabase.table("notificaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": asociacion_id,
            "tipo": "nuevo_reporte",
        }).execute()

    contactos = []
    if not asociacion_id:
        contactos = obtener_contactos_emergencia(tipo_animal, municipio)

    return {
        "id": reporte_id,
        "estado": "pendiente",
        "asociacion_asignada": asociacion["nombre"] if asociacion else None,
        "contactos_emergencia": contactos if contactos else None,
        "created_at": str(created_at)
    }


ESTADOS_VALIDOS = ["pendiente", "asignado", "en_atencion", "cerrado"]

async def obtener_reportes() -> list:
    resultado = supabase.table("reportes").select(
        "id, foto_url, tipo_animal, condicion, estado_reporte, "
        "latitud, longitud, municipio, colonia, created_at"
    ).neq("estado_reporte", "cerrado").execute()
    
    return resultado.data

async def cambiar_estado_reporte(reporte_id: str, nuevo_estado: str) -> dict:
    # Buscar reporte
    resultado = supabase.table("reportes").select(
        "id, estado_reporte"
    ).eq("id", reporte_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    estado_actual = resultado.data[0]["estado_reporte"]

    # Validar que el cambio sea hacia adelante
    if estado_actual not in ESTADOS_VALIDOS or nuevo_estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado no válido")

    indice_actual = ESTADOS_VALIDOS.index(estado_actual)
    indice_nuevo = ESTADOS_VALIDOS.index(nuevo_estado)

    if indice_nuevo != indice_actual + 1:
        raise HTTPException(status_code=400, detail="Cambio de estado no permitido")

    # Actualizar
    actualizado = supabase.table("reportes").update({
        "estado_reporte": nuevo_estado,
        "updated_at": "now()"
    }).eq("id", reporte_id).execute()

    return {
        "id": reporte_id,
        "estado": nuevo_estado,
        "updated_at": str(actualizado.data[0]["updated_at"])
    }
