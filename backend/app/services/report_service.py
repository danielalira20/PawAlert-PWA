import uuid
from fastapi import UploadFile, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
import json

def obtener_id_catalogo(tabla: str, clave: str) -> str | None:
    clave_str = clave.value if hasattr(clave, 'value') else str(clave)
    resultado = supabase.table(tabla).select("id").eq("clave", clave_str).eq("activo", True).execute()
    if resultado.data and len(resultado.data) > 0:
        return resultado.data[0]["id"]
    return None

def obtener_clave_catalogo(tabla: str, id: str) -> str | None:
    resultado = supabase.table(tabla).select("clave").eq("id", id).execute()
    if resultado.data and len(resultado.data) > 0:
        return resultado.data[0]["clave"]
    return None

def registrar_historial(reporte_id: str, tipo_evento: str, descripcion: str, usuario_id: str | None = None, datos_extra: dict | None = None):
    supabase.table("historial_reporte").insert({
        "reporte_id": reporte_id,
        "usuario_id": usuario_id,
        "tipo_evento": tipo_evento,
        "descripcion": descripcion,
        "datos_extra": datos_extra,
    }).execute()

async def crear_reporte(
    nombre: str,
    apellido_paterno: str,
    apellido_materno: str | None,
    telefono: str,
    email: str | None,
    condicion: str,
    tipo_animal: str,
    tamanio: str,
    latitud: float | None,
    longitud: float | None,
    calle: str | None,
    colonia: str | None,
    municipio: str | None,
    referencia: str | None,
    descripcion: str | None,
    fotos: list | None = None,
    fotos_ordenes: str | None = None,
    sexo: str | None = None,
    edad_aproximada: str | None = None,
    tiene_collar: bool | None = None,
    esta_prenada: bool | None = None,
    es_agresivo: bool | None = None,
    es_domestico_probable: bool | None = None,
    raza_clave: str | None = None,
    tipo_animal_otro_clave: str | None = None,
    especie_descripcion: str | None = None,
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

    # 2 — Resolver IDs de catálogos
    tipo_animal_id = obtener_id_catalogo("tipo_animal_catalogo", tipo_animal)
    condicion_id = obtener_id_catalogo("condicion_catalogo", condicion)
    tamanio_id = obtener_id_catalogo("tamanio_catalogo", tamanio)
    estado_id = obtener_id_catalogo("reporte_estados", "pendiente")

    if not tipo_animal_id or not condicion_id or not tamanio_id or not estado_id:
        raise HTTPException(status_code=500, detail="Error al resolver catálogos de la BD")

    # 3 — Asignar asociación por radio
    asociacion = None
    asociacion_id = None
    if latitud and longitud:
        asociacion = asignar_asociacion(latitud, longitud)
        if asociacion:
            asociacion_id = asociacion["id"]

    # 4 — Crear reporte
    estado_asignado_id = obtener_id_catalogo("reporte_estados", "asignado") if asociacion_id else None

    reporte_data = {
        "usuario_id": usuario_id,
        "estado_id": estado_asignado_id if asociacion_id else estado_id,
        "estado_reporte": "asignado" if asociacion_id else "pendiente",
        "asociacion_asignada_id": asociacion_id,
        "latitud": latitud,
        "longitud": longitud,
        "ubicacion_fuente": "gps" if latitud and longitud else "manual",
        "calle": calle,
        "colonia": colonia,
        "municipio": municipio,
        "referencia": referencia,
    }

    reporte = supabase.table("reportes").insert(reporte_data).execute()
    reporte_id = reporte.data[0]["id"]
    created_at = reporte.data[0]["created_at"]

    # 5 — Crear registro en ANIMAL
    raza_id = None
    if raza_clave:
        raza_id = obtener_id_catalogo("raza_catalogo", raza_clave)

    tipo_animal_otro_id = None
    if tipo_animal_otro_clave:
        tipo_animal_otro_id = obtener_id_catalogo("tipo_animal_otro", tipo_animal_otro_clave)

    animal_data = {
        "reporte_id": reporte_id,
        "tipo_animal_id": tipo_animal_id,
        "condicion_id": condicion_id,
        "tamanio_id": tamanio_id,
        "sexo": sexo or "desconocido",
        "edad_aproximada": edad_aproximada or "desconocido",
        "tiene_collar": tiene_collar,
        "esta_prenada": esta_prenada,
        "es_agresivo": es_agresivo,
        "es_domestico_probable": es_domestico_probable,
        "raza_id": raza_id,
        "tipo_animal_otro_id": tipo_animal_otro_id,
        "especie_descripcion": especie_descripcion,
        "descripcion": descripcion,
    }

    animal_result = supabase.table("animal").insert(animal_data).execute()
    animal_id = animal_result.data[0]["id"]

    # 6 — Subir fotos del animal
    if fotos:
        ordenes = json.loads(fotos_ordenes) if fotos_ordenes and fotos_ordenes.strip() else []
        for i, foto in enumerate(fotos):
            if foto and foto.filename:
                foto_url = await subir_foto(foto, carpeta="animales/fotos")
                supabase.table("animal_fotos").insert({
                    "animal_id": animal_id,
                    "foto_url": foto_url,
                    "orden": ordenes[i] if i < len(ordenes) else i + 1,
                }).execute()

    # 7 — Registrar asignación y notificación si hay asociación
    if asociacion_id:
        estado_asignacion_id = obtener_id_catalogo("asignacion_estados", "notificada")
        supabase.table("reporte_asignaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": asociacion_id,
            "estado_id": estado_asignacion_id,
            "estado": "aceptado",
        }).execute()

        tipo_notif_id = obtener_id_catalogo("notificacion_tipos", "nuevo_reporte")
        supabase.table("notificaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": asociacion_id,
            "tipo_id": tipo_notif_id,
            "tipo": "nuevo_reporte",
        }).execute()

    # 8 — Registrar en historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario_id,
        tipo_evento="reporte_creado",
        descripcion=f"Reporte creado por {nombre} {apellido_paterno}",
        datos_extra={"tipo_animal": tipo_animal, "condicion": condicion, "municipio": municipio}
    )

    if asociacion_id:
        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=None,
            tipo_evento="asociacion_asignada",
            descripcion=f"Asignado automáticamente a {asociacion['nombre']}",
            datos_extra={"asociacion_id": asociacion_id, "asociacion_nombre": asociacion["nombre"]}
        )

    # 9 — Obtener contactos de emergencia si no hay asociación
    contactos = []
    if not asociacion_id:
        contactos = obtener_contactos_emergencia(tipo_animal, municipio)

    return {
        "id": reporte_id,
        "estado": "asignado" if asociacion_id else "pendiente",
        "asociacion_asignada": asociacion["nombre"] if asociacion else None,
        "contactos_emergencia": contactos if contactos else None,
        "created_at": str(created_at)
    }


ESTADOS_VALIDOS = ["pendiente", "asignado", "en_atencion", "rescatado", "cerrado"]

async def obtener_reportes() -> list:
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, estado_id, latitud, longitud, municipio, colonia, created_at, "
        "animal(tipo_animal_id, condicion_id, tamanio_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave))"
    ).neq("estado_reporte", "cerrado").execute()

    reportes = []
    for r in resultado.data:
        animal = r.get("animal")
        animal_data = None

        if animal:
            animal_data = {
                "tipo_animal": animal.get("tipo_animal_catalogo", {}).get("clave"),
                "condicion": animal.get("condicion_catalogo", {}).get("clave"),
                "tamanio": animal.get("tamanio_catalogo", {}).get("clave"),
                "sexo": animal.get("sexo"),
                "edad_aproximada": animal.get("edad_aproximada"),
                "descripcion": animal.get("descripcion"),
            }

        reportes.append({
            "id": r["id"],
            "estado": r.get("estado_reporte"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "created_at": str(r["created_at"]),
            "animal": animal_data,
        })

    return reportes


async def cambiar_estado_reporte(reporte_id: str, nuevo_estado: str) -> dict:
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, usuario_id"
    ).eq("id", reporte_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    estado_actual = resultado.data[0]["estado_reporte"]
    usuario_id = resultado.data[0]["usuario_id"]

    if estado_actual not in ESTADOS_VALIDOS or nuevo_estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado no válido")

    indice_actual = ESTADOS_VALIDOS.index(estado_actual)
    indice_nuevo = ESTADOS_VALIDOS.index(nuevo_estado)

    if indice_nuevo != indice_actual + 1:
        raise HTTPException(status_code=400, detail="Cambio de estado no permitido")

    nuevo_estado_id = obtener_id_catalogo("reporte_estados", nuevo_estado)

    actualizado = supabase.table("reportes").update({
        "estado_reporte": nuevo_estado,
        "estado_id": nuevo_estado_id,
    }).eq("id", reporte_id).execute()

    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=None,
        tipo_evento="estado_cambiado",
        descripcion=f"Estado cambiado de {estado_actual} a {nuevo_estado}",
        datos_extra={"estado_anterior": estado_actual, "estado_nuevo": nuevo_estado}
    )

    return {
        "id": reporte_id,
        "estado": nuevo_estado,
        "updated_at": str(actualizado.data[0]["updated_at"])
    }