import uuid
from fastapi import UploadFile, HTTPException
from app.db.supabase import supabase, supabase_admin
from app.services.storage_service import subir_bytes, eliminar_por_url
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

def _tipo_animal_mas_grave_de(animales: list[AnimalInput]) -> str:
    """Igual que `_condicion_mas_grave_de`, pero regresa la especie del
    animal más grave en vez de su condición."""
    peor = max(animales, key=lambda a: CONDICION_SEVERIDAD.get(_condicion_str(a.condicion), 0))
    return _condicion_str(peor.tipo_animal)

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

MARGEN_CANTIDAD_DUPLICADO = 1.3  # >130% de la cantidad existente -> no es el mismo caso


def _clasificar_escenario(animal_existente: dict, tipo_animal_ids_nuevo: list[str], cantidad_nueva: int) -> int | None:
    """None = no dispara el modal. 1 = coincidencia simple. 2 = el existente
    ya es un grupo que cubre la(s) especie(s) nueva(s)."""
    especies_existente_ids = {a.get("tipo_animal_id") for a in animal_existente["animales"]}
    especies_nuevo_ids = set(tipo_animal_ids_nuevo)
    if not especies_nuevo_ids or not especies_nuevo_ids <= especies_existente_ids:
        # Un conjunto vacío es matemáticamente subconjunto de cualquier cosa,
        # pero "ninguna especie nueva resolvió catálogo" no debe tratarse
        # como "cubre todo" — sin especies válidas no hay match posible.
        return None

    cantidad_existente = sum(a.get("cantidad") or 1 for a in animal_existente["animales"])
    if cantidad_nueva > cantidad_existente * MARGEN_CANTIDAD_DUPLICADO:
        return None  # cantidad claramente mayor -> situación distinta, no duplicado

    existente_es_grupo = cantidad_existente > 1 or any(a.get("es_grupo") for a in animal_existente["animales"])
    return 2 if existente_es_grupo else 1


def verificar_duplicados(municipio: str | None, colonia: str | None, especies_nuevo: list[str], cantidad_nueva: int) -> list:
    if not municipio:
        return []

    hace_dos_horas = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

    tipo_animal_ids_nuevo = [
        tid for tid in (obtener_id_catalogo("tipo_animal_catalogo", e) for e in especies_nuevo) if tid
    ]

    query = supabase.table("reportes").select(
        "id, estado_reporte, municipio, colonia, created_at, "
        "animal(id, orden, tipo_animal_id, cantidad, es_grupo, tipo_animal_catalogo(clave), condicion_catalogo(clave))"
    ).neq("estado_reporte", "cerrado").gte("created_at", hace_dos_horas).eq("municipio", municipio)

    if colonia:
        query = query.eq("colonia", colonia)

    resultado = query.execute()
    duplicados = resultado.data if resultado.data else []

    for d in duplicados:
        animales_existente, animal_legado = shape_animal_embed(d.get("animal"))
        d["animal"] = animal_legado
        d["animales"] = animales_existente

    if tipo_animal_ids_nuevo:
        # Red amplia: cualquier animal del caso existente comparte especie con
        # CUALQUIERA de las especies nuevas — el escenario exacto se decide
        # después, con el subconjunto completo.
        duplicados = [
            d for d in duplicados
            if any(a.get("tipo_animal_id") in tipo_animal_ids_nuevo for a in d.get("animales", []))
        ]

    duplicados_clasificados = []
    for d in duplicados:
        escenario = _clasificar_escenario(d, tipo_animal_ids_nuevo, cantidad_nueva)
        if escenario is not None:
            d["escenario"] = escenario
            duplicados_clasificados.append(d)
    duplicados = duplicados_clasificados

    for duplicado in duplicados:
        animal = duplicado.get("animal")
        duplicado["foto_url"] = None
        if animal and animal.get("id"):
            fotos_result = supabase.table("animal_fotos").select(
                "foto_url, orden"
            ).eq("animal_id", animal["id"]).order("orden").limit(1).execute()
            duplicado["foto_url"] = fotos_result.data[0]["foto_url"] if fotos_result.data else None

        animal_ids = [a["id"] for a in duplicado["animales"] if a.get("id")]
        fotos_por_animal: dict[str, str] = {}
        if animal_ids:
            fotos_result = supabase.table("animal_fotos").select(
                "animal_id, foto_url, orden"
            ).in_("animal_id", animal_ids).order("orden").execute()
            for f in (fotos_result.data or []):
                fotos_por_animal.setdefault(f["animal_id"], f["foto_url"])
        duplicado["animales_resumen"] = [
            {
                "tipo_animal": (a.get("tipo_animal_catalogo") or {}).get("clave"),
                "condicion": (a.get("condicion_catalogo") or {}).get("clave"),
                "cantidad": a.get("cantidad"),
                "foto_url": fotos_por_animal.get(a.get("id")),
            }
            for a in duplicado["animales"]
        ]

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

    # La verificación de duplicados considera el caso completo (todas las
    # especies + cantidad total), no solo el primer animal; la asignación
    # automática de asociación también considera todas las especies del caso
    # (ver especies_del_caso abajo).
    animal_principal = animales[0]

    if es_duplicado_confirmado is None:
        especies_nuevo = list(dict.fromkeys(_condicion_str(a.tipo_animal) for a in animales))
        cantidad_nueva = sum(a.cantidad for a in animales)
        posibles_duplicados = verificar_duplicados(municipio, colonia, especies_nuevo, cantidad_nueva)

        if posibles_duplicados:
            duplicado = posibles_duplicados[0]

            return {
                "posible_duplicado": True,
                "escenario": duplicado["escenario"],
                "reporte_existente": {
                    "id": duplicado["id"],
                    "municipio": duplicado["municipio"],
                    "colonia": duplicado["colonia"],
                    "created_at": str(duplicado["created_at"]),
                    "tipo_animal": duplicado.get("animal", {}).get("tipo_animal_catalogo", {}).get("clave"),
                    "condicion": duplicado.get("animal", {}).get("condicion_catalogo", {}).get("clave"),
                    "foto_url": duplicado.get("foto_url"),
                    "animales": duplicado["animales_resumen"],
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
        especies_del_caso = list(dict.fromkeys(_condicion_str(a.tipo_animal) for a in animales))
        asociacion = asignar_asociacion(latitud, longitud, tipos_animales=especies_del_caso)
        if asociacion:
            asociacion_id = asociacion["id"]

    estado_asignado_id = obtener_id_catalogo("reporte_estados", "asignado") if asociacion_id else None
    estado_sin_cobertura_id = obtener_id_catalogo("reporte_estados", "sin_cobertura") # Obtenemos el ID correcto

    reporte_data = {
        "usuario_id": usuario_id,
        "reportante_nombre": nombre if not usuario_id else None,
        "reportante_apellido_paterno": apellido_paterno if not usuario_id else None,
        "reportante_apellido_materno": apellido_materno if not usuario_id else None,
        "reportante_telefono": telefono if not usuario_id else None,
        "estado_id": estado_asignado_id if asociacion_id else estado_sin_cobertura_id, 
        "estado_reporte": "asignado" if asociacion_id else "sin_cobertura", 
        "estado_cobertura": "abierto" if asociacion_id else None,
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
    if not asociacion_id:
        estado_sin_cobertura_id = obtener_id_catalogo("reporte_estados", "sin_cobertura")
        
        # 1. Aseguramos de raíz que el reporte nazca con estado sin_cobertura
        supabase.table("reportes").update({
            "estado_reporte": "sin_cobertura",
            "estado_id": estado_sin_cobertura_id
        }).eq("id", reporte_id).execute()

        # 2. Creamos de forma explícita el caso administrativo para la bandeja
        try:
            supabase_admin.table("casos_administrativos").insert({
                "reporte_id": reporte_id,
                "tipo": "reporte_sin_coordinadora",
                "prioridad": "alta",
                "estado": "pendiente",
                "detalle": "No se encontró una asociación compatible y cercana al crear el reporte.",
            }).execute()
        except Exception as e:
            print(f"[ERROR] No se pudo crear el caso administrativo para el reporte {reporte_id}: {e}")

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

        condiciones_ia_por_animal: dict[str, list[str]] = {}
        fotos_urls_subidas: list[str] = []
        if fotos:
            ordenes = json.loads(fotos_ordenes) if fotos_ordenes and fotos_ordenes.strip() else []
            indices = json.loads(fotos_animal_index) if fotos_animal_index and fotos_animal_index.strip() else []
            for i, foto in enumerate(fotos):
                if foto and foto.filename:
                    from app.services.report_moderation_service import calcular_phash, registrar_phash_reporte
                    from app.services.report_photo_vision_service import mensaje_rechazo, verificar_foto_animal

                    animal_idx = indices[i] if i < len(indices) else 0
                    animal_id_actual = animal_ids[animal_idx]
                    contenido_foto = await foto.read()

                    resultado_vision = verificar_foto_animal(contenido_foto, foto.content_type)

                    if resultado_vision.get("es_animal_real") is False:
                        raise HTTPException(
                            status_code=422,
                            detail=mensaje_rechazo(resultado_vision.get("categoria_rechazo")),
                        )

                    from app.services.image_evidence_service import ImagenEvidenciaInvalida, procesar_imagen_evidencia
                    from app.services.report_photo_location_service import sanear_sin_exif_de_emergencia, verificar_ubicacion_exif

                    # phash primero: además de su propósito de moderación, ya
                    # prueba que Pillow puede abrir la imagen — si no pudiera,
                    # esta línea ya habría abortado el reporte (comportamiento
                    # preexistente, sin cambios), así que el saneo de abajo
                    # nunca se enfrenta a un archivo realmente corrupto.
                    phash = calcular_phash(contenido_foto)

                    try:
                        procesada = procesar_imagen_evidencia(contenido_foto)
                        contenido_a_subir = procesada.contenido_publico
                        content_type_subida = procesada.content_type_publico
                        extension_subida = procesada.extension_publica
                        exif_latitud = procesada.exif_latitud
                        exif_longitud = procesada.exif_longitud
                    except ImagenEvidenciaInvalida:
                        # procesar_imagen_evidencia rechazó por tamaño/resolución
                        # (nunca por formato ni corrupción, ver nota arriba).
                        # Nunca se sube contenido_foto crudo — reabriría el GPS
                        # embebido públicamente. Se pierde el dato EXIF de esta
                        # foto puntual, no la garantía de privacidad.
                        contenido_a_subir = sanear_sin_exif_de_emergencia(contenido_foto)
                        content_type_subida = "image/jpeg"
                        extension_subida = "jpg"
                        exif_latitud = None
                        exif_longitud = None

                    resultado_ubicacion = verificar_ubicacion_exif(
                        exif_latitud, exif_longitud, latitud, longitud,
                    )

                    foto_url = await subir_bytes(
                        contenido_a_subir,
                        carpeta="animales/fotos",
                        content_type=content_type_subida,
                        extension=extension_subida,
                    )
                    fotos_urls_subidas.append(foto_url)

                    foto_data = {
                        "animal_id": animal_id_actual,
                        "foto_url": foto_url,
                        "orden": ordenes[i] if i < len(ordenes) else i + 1,
                        "exif_latitud": exif_latitud,
                        "exif_longitud": exif_longitud,
                        "exif_distancia_declarada_m": resultado_ubicacion["distancia_m"],
                        "exif_estado_verificacion": resultado_ubicacion["estado"],
                    }
                    es_error_tecnico = resultado_vision.get("estado") == "error_tecnico"
                    if es_error_tecnico:
                        foto_data.update({
                            "analisis_ia_estado": "error_tecnico",
                            "analisis_ia_error": resultado_vision.get("detalle"),
                            "requiere_revision": True,
                        })
                    else:
                        condicion_ia = resultado_vision.get("condicion_estimada")
                        foto_data.update({
                            "analisis_ia_modelo": resultado_vision.get("modelo"),
                            "analisis_ia_confianza": resultado_vision.get("confianza"),
                            "analisis_ia_condicion": condicion_ia,
                            "analisis_ia_procesado_at": datetime.now(timezone.utc).isoformat(),
                            "analisis_ia_estado": "completado",
                            "analisis_ia_raw": resultado_vision,
                        })
                        if condicion_ia:
                            condiciones_ia_por_animal.setdefault(animal_id_actual, []).append(condicion_ia)

                    foto_insertada = supabase.table("animal_fotos").insert(foto_data).execute()

                    if es_error_tecnico:
                        registrar_historial(
                            reporte_id=reporte_id,
                            usuario_id=usuario_id,
                            tipo_evento="foto_revision_pendiente",
                            descripcion="El análisis automático de una fotografía falló técnicamente; requiere revisión manual.",
                        )

                    registrar_phash_reporte(
                        reporte_id=reporte_id,
                        animal_foto_id=(foto_insertada.data or [{}])[0].get("id"),
                        phash=phash,
                    )

            for animal_id, condiciones in condiciones_ia_por_animal.items():
                peor = max(condiciones, key=lambda c: CONDICION_SEVERIDAD.get(c, 0))
                supabase.table("animal").update({"condicion_estimada_ia": peor}).eq("id", animal_id).execute()
    except HTTPException:
        for url in fotos_urls_subidas:
            eliminar_por_url(url)
        for animal_id in animal_ids:
            supabase.table("animal_fotos").delete().eq("animal_id", animal_id).execute()
        supabase.table("animal").delete().eq("reporte_id", reporte_id).execute()
        supabase.table("reportes").delete().eq("id", reporte_id).execute()
        raise
    except Exception as e:
        print(f"[ERROR] Falló la creación de animales/fotos, limpiando reporte {reporte_id}: {e}")
        for url in fotos_urls_subidas:
            eliminar_por_url(url)
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
                        tipo_animal=_tipo_animal_mas_grave_de(animales)
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
    ).neq("estado_reporte", "cerrado").in_(
        "estado_moderacion", ["visible", "aprobado"]
    ).execute()

    reportes = []
    for r in resultado.data:
        animales_crudos, animal_legado = shape_animal_embed(r.get("animal"))
        animales = [shape_animal_response(a) for a in animales_crudos]

        foto_url = None
        if animal_legado:
            fotos = animal_legado.get("animal_fotos") or []
            if fotos:
                fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
                foto_url = fotos_ordenadas[0]["foto_url"]

        # Endpoint público sin auth — se redondea a ~100m de precisión para no
        # exponer la ubicación exacta (posible domicilio) del reportante.
        lat = r.get("latitud")
        lng = r.get("longitud")
        reportes.append({
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "latitud": round(lat, 3) if lat is not None else None,
            "longitud": round(lng, 3) if lng is not None else None,
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "animales": animales,
        })

    return reportes

async def cambiar_estado_reporte(
    reporte_id: str,
    nuevo_estado: str,
    razon: str | None = None,
    conclusion: str | None = None,
    notas: str | None = None,
    usuario_id: str | None = None,
    foto_url: str | None = None,
) -> dict:
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

    if nuevo_estado == "cerrado":
        # Cierre de caso: registro específico con la conclusión elegida por
        # quien cierra (dropdown "¿Cómo concluyó el rescate?") + nota libre,
        # y el usuario_id real — a diferencia del resto de transiciones,
        # aquí sí importa saber quién cerró el caso.
        descripcion_cierre = f"Caso cerrado: {conclusion}" if conclusion else "Caso cerrado"
        if notas:
            descripcion_cierre += f" — {notas}"
        registrar_historial(
            reporte_id=reporte_id,
            usuario_id=usuario_id,
            tipo_evento="caso_cerrado",
            descripcion=descripcion_cierre,
            datos_extra={
                "estado_anterior": estado_actual,
                "estado_nuevo": nuevo_estado,
                "conclusion": conclusion,
                "notas": notas,
                "foto_url": foto_url,
            }
        )
        try:
            from app.services.reputacion_service import procesar_cierre_reporte
            procesar_cierre_reporte(reporte_id, usuario_id, conclusion)
        except Exception as e:
            print(f"[WARN] reputacion fallo en cambiar_estado_reporte (reporte={reporte_id}): {e}")
    else:
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
        "id, estado_reporte, estado_cobertura, estado_moderacion, moderacion_origen, "
        "latitud, longitud, municipio, colonia, calle, created_at, "
        "asociacion_asignada_id, staff_asignado_id, "
        "animal(id, orden, es_grupo, cantidad, trae_crias_nacidas, numero_crias_nacidas, "
        "tipo_animal_id, condicion_id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden)), "
        "asociaciones!reportes_asociacion_asignada_id_fkey(nombre)"
    ).eq("usuario_id", usuario_id).order("created_at", desc=True).execute()

    reporte_ids = [r["id"] for r in resultado.data or []]
    eventos_por_reporte: dict[str, set[str]] = {rid: set() for rid in reporte_ids}
    if reporte_ids:
        historial = (
            supabase.table("historial_reporte")
            .select("reporte_id, tipo_evento")
            .in_("reporte_id", reporte_ids)
            .in_(
                "tipo_evento",
                [
                    "animal_encontrado",
                    "animal_bajo_resguardo",
                    "llegada_hogar_temporal",
                    "seguimiento_inicial",
                    "seguimiento_resguardo",
                    "entrega_confirmada",
                ],
            )
            .execute()
        )
        for evento in historial.data or []:
            eventos_por_reporte.setdefault(evento["reporte_id"], set()).add(
                evento["tipo_evento"]
            )

    reportes = []
    for r in resultado.data:
        animales_crudos, animal_legado = shape_animal_embed(r.get("animal"))
        animales = [shape_animal_response(a) for a in animales_crudos]

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

        eventos = eventos_por_reporte.get(r["id"], set())
        estado = r.get("estado_reporte")
        cobertura = r.get("estado_cobertura")
        if estado == "cancelado_por_reportante":
            estado_publico = "Reporte cancelado"
        elif estado == "cerrado":
            estado_publico = "Resolución final"
        elif estado == "rescatado" or eventos.intersection(
            {"llegada_hogar_temporal", "seguimiento_inicial", "seguimiento_resguardo"}
        ):
            estado_publico = "En seguimiento"
        elif "animal_bajo_resguardo" in eventos:
            estado_publico = "Animal bajo resguardo"
        elif "animal_encontrado" in eventos or estado == "en_atencion":
            estado_publico = "Animal localizado"
        elif cobertura in ("confirmado", "en_atencion") or estado == "en_camino":
            estado_publico = "Voluntario confirmado"
        elif cobertura in ("abierto", "propuesta_enviada"):
            estado_publico = "Buscando voluntario"
        elif r.get("asociacion_asignada_id"):
            estado_publico = "Asociación coordinando"
        else:
            estado_publico = "Reporte recibido"

        reportes.append({
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "estado_moderacion": r.get("estado_moderacion"),
            "moderacion_origen": r.get("moderacion_origen"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "calle": r.get("calle"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "fotos": fotos_urls,
            "animales": animales,
            "asociacion_nombre": (r.get("asociaciones") or {}).get("nombre"),
            "estado_publico": estado_publico,
            "puede_cancelar": estado not in (
                "cerrado",
                "cancelado_por_reportante",
                "rescatado",
            ),
        })

    return reportes
