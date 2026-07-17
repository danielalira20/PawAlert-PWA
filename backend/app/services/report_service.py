import uuid
from fastapi import UploadFile, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
from datetime import datetime, timezone, timedelta
from app.services import matching
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

    if tipo_animal_id:
        duplicados = [
            d for d in duplicados
            if d.get("animal", {}).get("tipo_animal_id") == tipo_animal_id
        ]

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
                    "foto_url": duplicado.get("foto_url"),
                },
                "total_duplicados": len(posibles_duplicados)
            }

    tipo_animal_id = obtener_id_catalogo("tipo_animal_catalogo", tipo_animal)
    condicion_id = obtener_id_catalogo("condicion_catalogo", condicion)
    tamanio_id = obtener_id_catalogo("tamanio_catalogo", tamanio)
    estado_id = obtener_id_catalogo("reporte_estados", "pendiente")

    if not tipo_animal_id or not condicion_id or not tamanio_id or not estado_id:
        raise HTTPException(status_code=500, detail="Error al resolver catálogos de la BD")

    asociacion = None
    asociacion_id = None
    if latitud and longitud:
        asociacion = asignar_asociacion(latitud, longitud)
        if asociacion:
            asociacion_id = asociacion["id"]

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

        # Sellar candidatos_presentados_at desde la creación del reporte, no
        # cuando alguien abra el modal de asignación — de lo contrario el
        # modo "automático" nunca dispara (el timer nunca arranca sin que un
        # humano mire candidatos primero, lo cual contradice "automático").
        # Se hace para los 3 modos por igual: en manual/semi no cambia nada
        # observable (el timeout de escalamiento solo lo usa el cron en
        # semi_automatico/automatico); en automatico es lo que hace que el
        # cron pueda escalar en su primera pasada sin intervención humana.
        try:
            candidatos_iniciales = matching.obtener_candidatos(reporte_id)
            if candidatos_iniciales.get("candidatos"):
                supabase.table("reportes").update({
                    "candidatos_presentados_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", reporte_id).execute()
                registrar_historial(
                    reporte_id=reporte_id,
                    usuario_id=None,
                    tipo_evento="candidatos_presentados",
                    descripcion=f"{len(candidatos_iniciales['candidatos'])} candidatos calculados al crear el reporte",
                    datos_extra={"candidatos": [c["voluntario_id"] for c in candidatos_iniciales["candidatos"]]},
                )
        except Exception as e:
            # No debe tronar la creación del reporte si el matching falla —
            # el sellado de respaldo en GET /candidatos sigue como red de
            # seguridad si esto no corrió por cualquier razón.
            print(f"[WARN] No se pudo calcular candidatos iniciales al crear el reporte: {e}")

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


ESTADOS_VALIDOS = [
    "pendiente", "asignado", "en_camino", "en_atencion", "cerrado",
    "sin_cobertura", "duplicado_vinculable", "duplicado_informativo",
    "cancelado_por_reportante",
]

TRANSICIONES_PERMITIDAS = {
    "asignado":   ["en_camino", "pendiente"],       # confirmación salida / rechazado / timeout
    "en_camino":  ["en_atencion", "pendiente", "cerrado"],  # llegada / no_se_pudo_llegar / falsa_alarma
    "en_atencion": ["rescatado", "cerrado"], 
    "rescatado":  ["cerrado"],                     # rescatado / muerto / no_localizado -> razones, no estados
    "pendiente":  ["sin_cobertura"],
    "sin_cobertura": ["pendiente"],
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

async def cambiar_estado_reporte(reporte_id: str, nuevo_estado: str, razon: str | None = None) -> dict:
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, usuario_id"
    ).eq("id", reporte_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    estado_actual = resultado.data[0]["estado_reporte"]

    if nuevo_estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado no válido")

    destinos_permitidos = TRANSICIONES_PERMITIDAS.get(estado_actual, [])
    if nuevo_estado not in destinos_permitidos:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de '{estado_actual}' a '{nuevo_estado}'"
        )

    nuevo_estado_id = obtener_id_catalogo("reporte_estados", nuevo_estado)

    actualizado = supabase.table("reportes").update({
        "estado_reporte": nuevo_estado,
        "estado_id": nuevo_estado_id,
    }).eq("id", reporte_id).execute()

    # Cuando el caso se cierra, también hay que reflejarlo en
    # reporte_asignaciones — es lo que usa el frontend (estado_asignacion_clave)
    # para el sub-filtro "Completados" dentro de la pestaña "Aceptadas".
    if nuevo_estado == "cerrado":
        estado_completada = supabase.table("asignacion_estados").select("id").eq("clave", "completada").execute()
        if estado_completada.data:
            supabase.table("reporte_asignaciones").update({
                "estado_id": estado_completada.data[0]["id"],
                "estado": "completada",
            }).eq("reporte_id", reporte_id).execute()

    registrar_historial(
        reporte_id=reporte_id,
        usuario_id=None,
        tipo_evento="estado_cambiado",
        descripcion=f"Estado cambiado de {estado_actual} a {nuevo_estado}"
                    + (f" (razón: {razon})" if razon else ""),
        datos_extra={"estado_anterior": estado_actual, "estado_nuevo": nuevo_estado, "razon": razon}
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
        fotos_urls = []

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
                # Mismo patrón que obtener_reportes_usuario: devolvemos el
                # arreglo completo ordenado, no solo la primera foto,
                # para soportar carrusel en el detalle del mapa.
                fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
                fotos_urls = [f["foto_url"] for f in fotos_ordenadas]
                foto_url = fotos_urls[0]

        reportes.append({
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "fotos": fotos_urls,
            "animal": animal_data,
        })

    return reportes
