import uuid
from fastapi import UploadFile, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
from datetime import datetime, timezone, timedelta
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

def verificar_duplicados(municipio: str | None, colonia: str | None, tipo_animal: str | None) -> list:
    if not municipio:
        return []

    hace_dos_horas = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

    # Resolver el ID del tipo de animal para filtrar
    tipo_animal_id = None
    if tipo_animal:
        tipo_animal_id = obtener_id_catalogo("tipo_animal_catalogo", tipo_animal)

    query = supabase.table("reportes").select(
        "id, estado_reporte, municipio, colonia, created_at, "
        "animal(id, tipo_animal_id, tipo_animal_catalogo(clave), condicion_catalogo(clave))"
    ).neq("estado_reporte", "cerrado").gte("created_at", hace_dos_horas).eq("municipio", municipio)

    if colonia:
        query = query.eq("colonia", colonia)

    resultado = query.execute()
    duplicados = resultado.data if resultado.data else []

    # Filtrar por tipo de animal en Python ya que el join anidado no permite WHERE en subrelación
    if tipo_animal_id:
        duplicados = [
            d for d in duplicados
            if d.get("animal", {}).get("tipo_animal_id") == tipo_animal_id
        ]

    # Query separada para la foto
    for duplicado in duplicados:
        animal = duplicado.get("animal")
        if animal and animal.get("id"):
            fotos_result = supabase.table("animal_fotos").select(
                "foto_url, orden"
            ).eq("animal_id", animal["id"]).order("orden").limit(1).execute()
            duplicado["foto_url"] = fotos_result.data[0]["foto_url"] if fotos_result.data else None
        else:
            duplicado["foto_url"] = None

    return duplicados

async def crear_reporte(
    nombre: str | None,
    apellido_paterno: str | None,
    apellido_materno: str | None,
    telefono: str | None,
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
    estado_ubicacion: str | None = None,
    sexo: str | None = None,
    edad_aproximada: str | None = None,
    tiene_collar: bool | None = None,
    esta_prenada: bool | None = None,
    es_agresivo: bool | None = None,
    es_domestico_probable: bool | None = None,
    raza_clave: str | None = None,
    tipo_animal_otro_clave: str | None = None,
    especie_descripcion: str | None = None,
    usuario_id: str | None = None,
    es_duplicado_confirmado: bool | None = None,
    reporte_original_id: str | None = None,
) -> dict:
    
    print("=== DEBUG DUPLICADOS ===")
    print("municipio:", municipio)
    print("colonia:", colonia)
    print("tipo_animal:", tipo_animal)
    print("========================")

    # 0 — Verificar duplicados (solo si no viene confirmación del usuario)
    if es_duplicado_confirmado is None:
        posibles_duplicados = verificar_duplicados(municipio, colonia, tipo_animal)
        
        if posibles_duplicados:
            duplicado = posibles_duplicados[0]

            return {
                "posible_duplicado": True,
                "reporte_existente": {
                    "id": duplicado["id"],
                    "municipio": duplicado["municipio"],
                    "colonia": duplicado["colonia"],
                    "created_at": str(duplicado["created_at"]),
                    "tipo_animal": duplicado.get("animal", {}).get("tipo_animal_catalogo", {}).get("clave"),
                    "condicion": duplicado.get("animal", {}).get("condicion_catalogo", {}).get("clave"),
                    "foto_url": duplicado.get("foto_url"),  # ← viene de verificar_duplicados
                },
                "total_duplicados": len(posibles_duplicados)
            }
    # 1 — Resolver usuario: con sesión usa usuario_id directo, invitado queda None
    # (los datos del invitado se guardan en el reporte)

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
        "reportante_nombre": nombre if not usuario_id else None,
        "reportante_apellido_paterno": apellido_paterno if not usuario_id else None,
        "reportante_apellido_materno": apellido_materno if not usuario_id else None,
        "reportante_telefono": telefono if not usuario_id else None,
        "estado_id": estado_asignado_id if asociacion_id else estado_id,
        "estado_reporte": "asignado" if asociacion_id else "pendiente",
        "asociacion_asignada_id": asociacion_id,
        "latitud": latitud,
        "longitud": longitud,
        "ubicacion_fuente": "gps" if latitud and longitud else "manual",
        "calle": calle,
        "colonia": colonia,
        "municipio": municipio,
        "estado_ubicacion": estado_ubicacion,
        "referencia": referencia,
        "reporte_original_id": reporte_original_id, 
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
            "estado": "notificada",
        }).execute()

        tipo_notif_id = obtener_id_catalogo("notificacion_tipos", "nuevo_reporte")
        supabase.table("notificaciones").insert({
            "reporte_id": reporte_id,
            "asociacion_id": asociacion_id,
            "tipo_id": tipo_notif_id,
            "tipo": "nuevo_reporte",
        }).execute()

        #Email si condicion es grave
        condicion_str = condicion.value if hasattr(condicion, 'value') else str(condicion)
        if condicion_str == "grave":
            try:
                asociacion_data = supabase.table("asociaciones").select(
                    "nombre, contacto_email"
                ).eq("id", asociacion_id).execute()
                if asociacion_data.data:
                    from app.services.email_service import email_reporte_grave
                    email_reporte_grave(
                        nombre_asociacion=asociacion_data.data[0]["nombre"],
                        email=asociacion_data.data[0]["contacto_email"],
                        municipio=municipio,
                        tipo_animal=condicion_str
                    )
            except Exception as e:
                print(f"[WARN] No se pudo enviar email de reporte grave: {e}")

    # 8 — Registrar en historial
    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=usuario_id,
        tipo_evento="reporte_creado",
        descripcion=f"Reporte creado por {nombre or 'usuario'} {apellido_paterno or ''}".strip(),
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
        contactos = obtener_contactos_emergencia(
            tipo_animal=tipo_animal,
            municipio=municipio,
            estado=estado_ubicacion
        )
    return {
        "id": reporte_id,
        "estado": "asignado" if asociacion_id else "pendiente",
        "asociacion_asignada": asociacion["nombre"] if asociacion else None,
        "contactos_emergencia": contactos if contactos else None,
        "created_at": str(created_at)
    }


ESTADOS_VALIDOS = ["pendiente", "asignado", "en_camino", "en_atencion", "rescatado", "cerrado", "sin_cobertura", "duplicado", "muerto"]

TRANSICIONES_PERMITIDAS = {
    "rescatado": "cerrado",  # representante cierra el caso
}

async def obtener_reportes() -> list:
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, estado_id, latitud, longitud, municipio, colonia, created_at, "
        "animal(tipo_animal_id, condicion_id, tamanio_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden))"
    ).neq("estado_reporte", "cerrado").execute()

    reportes = []
    for r in resultado.data:
        animal = r.get("animal")
        animal_data = None
        foto_url = None

        if animal:
            animal_data = {
                "tipo_animal": animal.get("tipo_animal_catalogo", {}).get("clave"),
                "condicion": animal.get("condicion_catalogo", {}).get("clave"),
                "tamanio": animal.get("tamanio_catalogo", {}).get("clave"),
                "sexo": animal.get("sexo"),
                "edad_aproximada": animal.get("edad_aproximada"),
                "descripcion": animal.get("descripcion"),
            }

            fotos = animal.get("animal_fotos") or []
            if fotos:
                fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
                foto_url = fotos_ordenadas[0]["foto_url"]

        reportes.append({
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
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

    if nuevo_estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado no válido")

    # Validar que la transición está permitida
    transicion_permitida = TRANSICIONES_PERMITIDAS.get(estado_actual)
    if transicion_permitida != nuevo_estado:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de '{estado_actual}' a '{nuevo_estado}'"
        )

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

async def obtener_reportes_usuario(usuario_id: str) -> list:
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, latitud, longitud, municipio, colonia, calle, created_at, "
        "asociacion_asignada_id, "
        "animal(id, tipo_animal_id, condicion_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden)), "
        "asociaciones!reportes_asociacion_asignada_id_fkey(nombre)"
    ).eq("usuario_id", usuario_id).order("created_at", desc=True).execute()

    reportes = []
    for r in resultado.data:
        animal = r.get("animal")
        animal_data = None
        foto_url = None

        if animal:
            animal_data = {
                "tipo_animal": animal.get("tipo_animal_catalogo", {}).get("clave") if animal.get("tipo_animal_catalogo") else None,
                "condicion": animal.get("condicion_catalogo", {}).get("clave") if animal.get("condicion_catalogo") else None,
                "tamanio": animal.get("tamanio_catalogo", {}).get("clave") if animal.get("tamanio_catalogo") else None,
                "sexo": animal.get("sexo"),
                "edad_aproximada": animal.get("edad_aproximada"),
                "descripcion": animal.get("descripcion"),
            }
            fotos = animal.get("animal_fotos") or []
            if fotos:
                fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
                foto_url = fotos_ordenadas[0]["foto_url"]

        asociacion = r.get("asociaciones")
        asociacion_nombre = asociacion.get("nombre") if asociacion else None

        reportes.append({
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "calle": r.get("calle"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "animal": animal_data,
            "asociacion_nombre": asociacion_nombre,
        })

    return reportes