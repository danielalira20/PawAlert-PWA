import uuid
from fastapi import UploadFile, HTTPException
from app.db.supabase import supabase
from app.services.storage_service import subir_foto
from app.services.assignment_service import asignar_asociacion, obtener_contactos_emergencia
from datetime import datetime, timezone, timedelta
from app.services import matching
from app.models.report import AnimalInput
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response, CONDICION_SEVERIDAD
import json

def _condicion_str(condicion) -> str:
    return condicion.value if hasattr(condicion, "value") else str(condicion)

def _condicion_mas_grave_de(animales: list[AnimalInput]) -> str:
    """Igual que `condicion_mas_grave` en animal_shaping, pero sobre los
    `AnimalInput` que llegan del formulario (antes de insertarse), no sobre
    filas ya leídas de la BD."""
    peor = max(animales, key=lambda a: CONDICION_SEVERIDAD.get(_condicion_str(a.condicion), 0))
    return _condicion_str(peor.condicion)

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
        "animal(id, orden, tipo_animal_id, tipo_animal_catalogo(clave), condicion_catalogo(clave))"
    ).neq("estado_reporte", "cerrado").gte("created_at", hace_dos_horas).eq("municipio", municipio)

    if colonia:
        query = query.eq("colonia", colonia)

    resultado = query.execute()
    duplicados = resultado.data if resultado.data else []

    for d in duplicados:
        animales_existente, animal_legado = shape_animal_embed(d.get("animal"))
        d["animal"] = animal_legado
        d["animales"] = animales_existente

    if tipo_animal_id:
        # Coincide si CUALQUIER animal del caso existente comparte especie con
        # el reporte entrante — no solo el legado (condición más grave).
        duplicados = [
            d for d in duplicados
            if any(a.get("tipo_animal_id") == tipo_animal_id for a in d.get("animales", []))
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
    animales: list[AnimalInput],
    latitud: float | None,
    longitud: float | None,
    calle: str | None,
    colonia: str | None,
    municipio: str | None,
    referencia: str | None,
    fotos: list | None = None,
    fotos_ordenes: str | None = None,
    fotos_animal_index: str | None = None,
    estado_ubicacion: str | None = None,
    usuario_id: str | None = None,
    es_duplicado_confirmado: bool | None = None,
    reporte_original_id: str | None = None,
) -> dict:

    # Shim temporal (Fase 3): mientras encontrar_asociacion_cercana y
    # candidatos_para_reporte no soporten varias especies (Fase 7), la
    # verificación de duplicados y la asignación automática de asociación
    # se guían por el primer animal del arreglo, no por el más grave.
    animal_principal = animales[0]

    print("=== DEBUG DUPLICADOS ===")
    print("municipio:", municipio)
    print("colonia:", colonia)
    print("tipo_animal:", animal_principal.tipo_animal)
    print("========================")

    if es_duplicado_confirmado is None:
        posibles_duplicados = verificar_duplicados(municipio, colonia, animal_principal.tipo_animal)

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

    estado_id = obtener_id_catalogo("reporte_estados", "pendiente")
    if not estado_id:
        raise HTTPException(status_code=500, detail="Error al resolver catálogos de la BD")

    # Catálogos por animal, resueltos ANTES de insertar el reporte — si algo
    # no resuelve, se corta aquí sin haber creado nada todavía.
    animales_resueltos = []
    for animal_in in animales:
        tipo_animal_id = obtener_id_catalogo("tipo_animal_catalogo", animal_in.tipo_animal)
        condicion_id = obtener_id_catalogo("condicion_catalogo", animal_in.condicion)
        tamanio_id = obtener_id_catalogo("tamanio_catalogo", animal_in.tamanio)
        if not tipo_animal_id or not condicion_id or not tamanio_id:
            raise HTTPException(status_code=500, detail="Error al resolver catálogos de la BD")

        raza_id = obtener_id_catalogo("raza_catalogo", animal_in.raza_clave) if animal_in.raza_clave else None
        tipo_animal_otro_id = (
            obtener_id_catalogo("tipo_animal_otro", animal_in.tipo_animal_otro_clave)
            if animal_in.tipo_animal_otro_clave else None
        )
        animales_resueltos.append({
            "animal_in": animal_in,
            "tipo_animal_id": tipo_animal_id,
            "condicion_id": condicion_id,
            "tamanio_id": tamanio_id,
            "raza_id": raza_id,
            "tipo_animal_otro_id": tipo_animal_otro_id,
        })

    asociacion = None
    asociacion_id = None
    if latitud and longitud:
        asociacion = asignar_asociacion(latitud, longitud, tipo_animal=animal_principal.tipo_animal)
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

    # Inserta cada animal y sus fotos. Sin transacción real (Supabase REST no
    # la soporta sin una función SQL dedicada, fuera de alcance de esta
    # fase) — si algo falla a medio loop, se limpia manualmente lo ya
    # insertado en vez de dejar un caso con animales incompletos, que es
    # peor que el huérfano de siempre porque parece un caso más chico de lo
    # que en realidad es.
    animal_ids = []
    try:
        for resuelto in animales_resueltos:
            animal_in = resuelto["animal_in"]
            animal_data = {
                "reporte_id": reporte_id,
                "tipo_animal_id": resuelto["tipo_animal_id"],
                "condicion_id": resuelto["condicion_id"],
                "tamanio_id": resuelto["tamanio_id"],
                "sexo": animal_in.sexo or "desconocido",
                "edad_aproximada": animal_in.edad_aproximada or "desconocido",
                "tiene_collar": animal_in.tiene_collar,
                "esta_prenada": animal_in.esta_prenada,
                "es_agresivo": animal_in.es_agresivo,
                "es_domestico_probable": animal_in.es_domestico_probable,
                "raza_id": resuelto["raza_id"],
                "tipo_animal_otro_id": resuelto["tipo_animal_otro_id"],
                "especie_descripcion": animal_in.especie_descripcion,
                "descripcion": animal_in.descripcion,
                "orden": animal_in.orden,
                "es_grupo": animal_in.es_grupo,
                "cantidad": animal_in.cantidad,
                "trae_crias_nacidas": animal_in.trae_crias_nacidas,
                "numero_crias_nacidas": animal_in.numero_crias_nacidas,
            }
            animal_result = supabase.table("animal").insert(animal_data).execute()
            animal_ids.append(animal_result.data[0]["id"])

        if fotos:
            ordenes = json.loads(fotos_ordenes) if fotos_ordenes and fotos_ordenes.strip() else []
            indices = json.loads(fotos_animal_index) if fotos_animal_index and fotos_animal_index.strip() else []
            for i, foto in enumerate(fotos):
                if foto and foto.filename:
                    animal_idx = indices[i] if i < len(indices) else 0
                    foto_url = await subir_foto(foto, carpeta="animales/fotos")
                    supabase.table("animal_fotos").insert({
                        "animal_id": animal_ids[animal_idx],
                        "foto_url": foto_url,
                        "orden": ordenes[i] if i < len(ordenes) else i + 1,
                    }).execute()
    except Exception as e:
        print(f"[ERROR] Falló la creación de animales/fotos, limpiando reporte {reporte_id}: {e}")
        for animal_id in animal_ids:
            supabase.table("animal_fotos").delete().eq("animal_id", animal_id).execute()
        supabase.table("animal").delete().eq("reporte_id", reporte_id).execute()
        supabase.table("reportes").delete().eq("id", reporte_id).execute()
        raise HTTPException(status_code=500, detail="No se pudo crear el reporte, intenta de nuevo.")

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

        # Condición más grave del caso, no de un animal en particular — un
        # solo email por caso, igual que hoy, pero ya no ignora al resto de
        # los animales si el primero llegó como "estable" y otro es "grave".
        condicion_str = _condicion_mas_grave_de(animales)
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
        datos_extra={
            "tipo_animal": _condicion_str(animal_principal.tipo_animal),
            "condicion": _condicion_mas_grave_de(animales),
            "municipio": municipio,
            "total_animales": len(animales),
        }
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
        # Un caso puede traer varias especies — se junta la lista de
        # contactos de cada especie distinta presente, sin duplicar.
        tipos_presentes = list(dict.fromkeys(_condicion_str(a.tipo_animal) for a in animales))
        contactos_vistos = set()
        for tipo in tipos_presentes:
            for c in obtener_contactos_emergencia(tipo_animal=tipo, municipio=municipio, estado=estado_ubicacion):
                if c.get("id") not in contactos_vistos:
                    contactos_vistos.add(c.get("id"))
                    contactos.append(c)
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
        "animal(orden, es_grupo, cantidad, trae_crias_nacidas, numero_crias_nacidas, "
        "tipo_animal_id, condicion_id, tamanio_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden))"
    ).neq("estado_reporte", "cerrado").execute()

    reportes = []
    for r in resultado.data:
        animales_crudos, animal_legado = shape_animal_embed(r.get("animal"))
        animales = [shape_animal_response(a) for a in animales_crudos]
        animal_data = shape_animal_response(animal_legado) if animal_legado else None

        foto_url = None
        if animal_legado:
            fotos = animal_legado.get("animal_fotos") or []
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
            "animales": animales,
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
        "animal(id, orden, es_grupo, cantidad, trae_crias_nacidas, numero_crias_nacidas, "
        "tipo_animal_id, condicion_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden)), "
        "asociaciones!reportes_asociacion_asignada_id_fkey(nombre)"
    ).eq("usuario_id", usuario_id).order("created_at", desc=True).execute()

    reportes = []
    for r in resultado.data:
        animales_crudos, animal_legado = shape_animal_embed(r.get("animal"))
        animales = [shape_animal_response(a) for a in animales_crudos]
        animal_data = shape_animal_response(animal_legado) if animal_legado else None

        foto_url = None
        fotos_urls = []
        if animal_legado:
            fotos = animal_legado.get("animal_fotos") or []
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
            "animales": animales,
        })

    return reportes
