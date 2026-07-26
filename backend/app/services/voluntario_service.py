from datetime import datetime, timezone
from math import radians, sin, cos, asin, sqrt
from fastapi import HTTPException
from app.db.supabase import supabase, supabase_admin
from app.services.report_service import obtener_id_catalogo, registrar_historial
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response
from app.services import storage_service

def _distancia_km(lat1, lon1, lat2, lon2) -> float | None:
    """Haversine simple, solo informativo (no participa en el ranking de matching)."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return round(2 * 6371 * asin(sqrt(a)), 1)


# ---------------------------------------------------------------------------
# Helpers de catálogo / rol
# ---------------------------------------------------------------------------

def validar_claves_catalogo(tabla: str, claves: list[str]) -> bool:
    """Verifica que todas las claves existan y estén activas en la tabla de
    catálogo dada. Lista vacía siempre es válida (campo opcional)."""
    if not claves:
        return True
    resultado = supabase.table(tabla).select("clave").eq("activo", True).in_(
        "clave", claves
    ).execute()
    claves_validas = {r["clave"] for r in (resultado.data or [])}
    return set(claves) == claves_validas


def _obtener_rol_id(nombre_rol: str) -> str | None:
    resultado = supabase.table("roles").select("id").eq("nombre", nombre_rol).execute()
    if resultado.data:
        return resultado.data[0]["id"]
    return None


# ---------------------------------------------------------------------------
# B1 — Postulaciones y ciclo del voluntario
# ---------------------------------------------------------------------------

async def crear_postulacion(usuario_id: str, tipo: str, asociacion_id: str) -> dict:
    # Verificar si ya existe un perfil de voluntario para este usuario
    existente = supabase.table("voluntarios").select(
        "id, estado"
    ).eq("usuario_id", usuario_id).execute()

    if existente.data:
        voluntario = existente.data[0]
        voluntario_id = voluntario["id"]

        # Si ya tiene una postulación pendiente, no se permite otra
        pendiente = supabase.table("postulaciones").select("id").eq(
            "voluntario_id", voluntario_id
        ).eq("estado", "pendiente").execute()

        if pendiente.data:
            raise HTTPException(
                status_code=409,
                detail="Ya tienes una postulación pendiente en revisión"
            )

        # Calcular numero_intento (última postulación + 1)
        ultima = supabase.table("postulaciones").select(
            "numero_intento"
        ).eq("voluntario_id", voluntario_id).order(
            "numero_intento", desc=True
        ).limit(1).execute()

        numero_intento = (ultima.data[0]["numero_intento"] + 1) if ultima.data else 1

        # Regresar el voluntario a postulacion_pendiente (re-postulación tras rechazo)
        supabase.table("voluntarios").update({
            "estado": "postulacion_pendiente",
        }).eq("id", voluntario_id).execute()

    else:
        # Primera vez: crear el perfil de voluntario
        nuevo = supabase.table("voluntarios").insert({
            "usuario_id": usuario_id,
            "estado": "postulacion_pendiente",
        }).execute()
        voluntario_id = nuevo.data[0]["id"]
        numero_intento = 1

    # Crear la fila de postulación (aquí sí se guarda el tipo elegido)
    postulacion = supabase.table("postulaciones").insert({
        "voluntario_id": voluntario_id,
        "asociacion_id": asociacion_id,
        "tipo": tipo,
        "estado": "pendiente",
        "numero_intento": numero_intento,
    }).execute()

    return {
        "postulacion_id": postulacion.data[0]["id"],
        "voluntario_id": voluntario_id,
        "numero_intento": numero_intento,
        "estado": "pendiente",
    }


async def asegurar_perfil_voluntario_interno(usuario_id: str) -> dict:
    """Prepara el perfil de voluntario interno SIN crear la postulación —
    esa se crea al final del flujo, en finalizar_postulacion_interno(), para
    no dejar una postulación huérfana si el usuario abandona el formulario de
    capacidades a medias.

    Necesaria de todas formas porque PUT /voluntarios/me/capacidades exige
    que ya exista la fila `voluntarios` (_obtener_voluntario_id_propio) con
    estado 'postulacion_pendiente' (guardar_capacidades la valida)."""
    existente = supabase.table("voluntarios").select(
        "id, estado"
    ).eq("usuario_id", usuario_id).execute()

    if existente.data:
        voluntario_id = existente.data[0]["id"]

        pendiente = supabase.table("postulaciones").select("id").eq(
            "voluntario_id", voluntario_id
        ).eq("estado", "pendiente").execute()

        if pendiente.data:
            raise HTTPException(
                status_code=409,
                detail="Ya tienes una postulación pendiente en revisión"
            )

        supabase.table("voluntarios").update({
            "estado": "postulacion_pendiente",
        }).eq("id", voluntario_id).execute()
    else:
        nuevo = supabase.table("voluntarios").insert({
            "usuario_id": usuario_id,
            "estado": "postulacion_pendiente",
        }).execute()
        voluntario_id = nuevo.data[0]["id"]

    return {"voluntario_id": voluntario_id}


async def finalizar_postulacion_interno(usuario_id: str, asociacion_id: str) -> dict:
    """Crea la postulación de voluntario interno — el paso que de verdad
    compromete, llamado al terminar (y guardar con éxito) el formulario de
    capacidades, nunca antes. Mismo criterio que finalizar_postulacion_externa()
    en home_verification_service.py: valida que las dependencias existan y es
    idempotente ante reintentos."""
    voluntario = supabase.table("voluntarios").select("id").eq(
        "usuario_id", usuario_id
    ).execute()
    if not voluntario.data:
        raise HTTPException(status_code=422, detail="Primero debes iniciar tu postulación")
    voluntario_id = voluntario.data[0]["id"]

    capacidades = supabase.table("capacidades").select("voluntario_id").eq(
        "voluntario_id", voluntario_id
    ).execute()
    if not capacidades.data:
        raise HTTPException(
            status_code=422,
            detail="Primero debes completar tu formulario de capacidades"
        )

    # Idempotencia: si un reintento llega después de que el INSERT anterior sí
    # se completó (pero la respuesta se perdió), regresamos la postulación ya
    # creada en vez de dejar que crear_postulacion() lance 409.
    pendiente = supabase.table("postulaciones").select(
        "id, numero_intento"
    ).eq("voluntario_id", voluntario_id).eq("estado", "pendiente").execute()
    if pendiente.data:
        return {
            "postulacion_id": pendiente.data[0]["id"],
            "voluntario_id": voluntario_id,
            "numero_intento": pendiente.data[0]["numero_intento"],
            "estado": "pendiente",
        }

    return await crear_postulacion(usuario_id, "interno", asociacion_id)


async def obtener_mi_voluntario(usuario_id: str) -> dict:
    resultado = supabase.table("voluntarios").select(
        "id, estado, asociacion_id, created_at, updated_at"
    ).eq("usuario_id", usuario_id).execute()

    if not resultado.data:
        return {"tiene_perfil_voluntario": False}

    voluntario = resultado.data[0]

    # Para decidir si mostrar "Termina de completar tu perfil" — si ya
    # existe una fila en capacidades, ya no debería aparecer esa opción.
    capacidades_existentes = supabase.table("capacidades").select(
        "voluntario_id"
    ).eq("voluntario_id", voluntario["id"]).execute()
    tiene_capacidades = bool(capacidades_existentes.data)


    # Traer la postulación más reciente para saber tipo / motivo de rechazo
    ultima_postulacion = supabase.table("postulaciones").select(
        "id, tipo, estado, motivo_rechazo, numero_intento, asociacion_id, "
        "asociaciones(nombre)"
    ).eq("voluntario_id", voluntario["id"]).order(
        "numero_intento", desc=True
    ).limit(1).execute()

    # voluntarios.estado se marca 'postulacion_pendiente' desde el paso 1 de
    # postular (asegurar_perfil_voluntario_interno), antes de que exista una
    # fila real en `postulaciones` — esa se crea hasta terminar el formulario
    # de capacidades (finalizar_postulacion_interno). Si el usuario abandona
    # el formulario (la primera vez, o al reintentar tras un rechazo), ese
    # estado queda pegado sin ninguna postulación real detrás. En ese caso
    # tratamos al usuario como si no tuviera perfil todavía — sin tocar la
    # fila en `voluntarios`, que guardar_capacidades() sigue necesitando ver
    # en 'postulacion_pendiente' si decide retomar el formulario.
    tiene_postulacion_pendiente_real = bool(
        ultima_postulacion.data and ultima_postulacion.data[0]["estado"] == "pendiente"
    )
    if voluntario["estado"] == "postulacion_pendiente" and not tiene_postulacion_pendiente_real:
        return {"tiene_perfil_voluntario": False}

    postulacion_data = None
    intentos_previos = []
    if ultima_postulacion.data:
        p = ultima_postulacion.data[0]
        postulacion_data = {
            "id": p["id"],
            "tipo": p.get("tipo"),
            "estado": p["estado"],
            "motivo_rechazo": p.get("motivo_rechazo"),
            "numero_intento": p["numero_intento"],
            "asociacion_nombre": p.get("asociaciones", {}).get("nombre") if p.get("asociaciones") else None,
            "resuelta_at": str(p["resuelta_at"]) if p.get("resuelta_at") else None,
        }

        if p.get("tipo") == "externo":
            verificacion = supabase_admin.table(
                "verificaciones_hogar"
            ).select(
                "estado, modalidad, motivo_resultado, analisis_video_estado, "
                "updated_at"
            ).eq("postulacion_id", p["id"]).limit(1).execute()
            if verificacion.data:
                postulacion_data["verificacion_hogar"] = verificacion.data[0]

        if p["numero_intento"] > 1:
            previos = supabase.table("postulaciones").select(
                "id, numero_intento, estado, motivo_rechazo, created_at, resuelta_at, "
                "asociaciones(nombre)"
            ).eq("voluntario_id", voluntario["id"]).lt(
                "numero_intento", p["numero_intento"]
            ).order("numero_intento").execute()

            intentos_previos = [
                {
                    "id": prev["id"],
                    "numero_intento": prev["numero_intento"],
                    "estado": prev["estado"],
                    "motivo_rechazo": prev.get("motivo_rechazo"),
                    "created_at": str(prev["created_at"]),
                    "resuelta_at": str(prev["resuelta_at"]) if prev.get("resuelta_at") else None,
                    "asociacion_nombre": prev.get("asociaciones", {}).get("nombre") if prev.get("asociaciones") else None,
                }
                for prev in (previos.data or [])
            ]

    return {
        "tiene_perfil_voluntario": True,
        "voluntario_id": voluntario["id"],
        "estado": voluntario["estado"],
        "asociacion_id": voluntario.get("asociacion_id"),
        "ultima_postulacion": postulacion_data,
        "intentos_previos": intentos_previos,
        "tiene_capacidades": tiene_capacidades,
    }


async def obtener_postulaciones_asociacion(asociacion_id: str, estado: str | None = None) -> list:
    query = supabase.table("postulaciones").select(
        "id, voluntario_id, tipo, estado, motivo_rechazo, numero_intento, "
        "created_at, resuelta_at, "
        "voluntarios(usuario_id, usuarios(nombre, apellido_paterno, telefono, email), "
        "capacidades(disponibilidad, ofrece_casa_hogar, capacidad_animales, especies, "
        "tamanios, tiene_vehiculo, motivo_voluntario, experiencia_previa, latitud, longitud))"
    ).eq("asociacion_id", asociacion_id).order("created_at", desc=True)

    if estado:
        query = query.eq("estado", estado)

    resultado = query.execute()
    postulaciones = []

    for p in resultado.data:
        voluntario = p.get("voluntarios") or {}
        usuario = voluntario.get("usuarios") or {}
        # Según si voluntario_id tiene UNIQUE en la tabla capacidades,
        # PostgREST lo embebe como objeto único o como lista — soportamos
        # ambos casos para no depender de esa configuración.
        capacidades_raw = voluntario.get("capacidades")
        if isinstance(capacidades_raw, list):
            capacidades = capacidades_raw[0] if capacidades_raw else None
        else:
            capacidades = capacidades_raw

        # Historial de intentos previos (si numero_intento > 1)
        historial_previo = []
        if p["numero_intento"] > 1:
            previos = supabase.table("postulaciones").select(
                "numero_intento, estado, motivo_rechazo"
            ).eq("voluntario_id", p["voluntario_id"]).lt(
                "numero_intento", p["numero_intento"]
            ).order("numero_intento").execute()
            historial_previo = previos.data or []

        postulaciones.append({
            "postulacion_id": p["id"],
            "voluntario_id": p["voluntario_id"],
            "tipo": p.get("tipo"),
            "estado": p["estado"],
            "motivo_rechazo": p.get("motivo_rechazo"),
            "numero_intento": p["numero_intento"],
            "created_at": str(p["created_at"]),
            "resuelta_at": str(p["resuelta_at"]) if p.get("resuelta_at") else None,
            "postulante": {
                "nombre": usuario.get("nombre"),
                "apellido_paterno": usuario.get("apellido_paterno"),
                "telefono": usuario.get("telefono"),
                "email": usuario.get("email"),
            },
            "capacidades": capacidades and {
                "disponibilidad": capacidades.get("disponibilidad"),
                "ofrece_casa_hogar": capacidades.get("ofrece_casa_hogar"),
                "capacidad_animales": capacidades.get("capacidad_animales"),
                "especies": capacidades.get("especies"),
                "tamanios": capacidades.get("tamanios"),
                "tiene_vehiculo": capacidades.get("tiene_vehiculo"),
                "motivo_voluntario": capacidades.get("motivo_voluntario"),
                "experiencia_previa": capacidades.get("experiencia_previa"),
                "latitud": capacidades.get("latitud"),
                "longitud": capacidades.get("longitud"),
            },
            "historial_intentos_previos": historial_previo,
        })

    return postulaciones


async def resolver_postulacion(
    postulacion_id: str,
    usuario_staff_id: str,
    asociacion_id: str,
    accion: str,
    motivo: str | None = None,
) -> dict:
    postulacion = supabase.table("postulaciones").select(
        "id, voluntario_id, asociacion_id, tipo, estado"
    ).eq("id", postulacion_id).execute()

    if not postulacion.data:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")

    postulacion = postulacion.data[0]

    if postulacion["asociacion_id"] != asociacion_id:
        raise HTTPException(status_code=403, detail="Esta postulación no pertenece a tu asociación")

    if postulacion["estado"] != "pendiente":
        raise HTTPException(status_code=400, detail="Esta postulación ya fue resuelta")

    voluntario_id = postulacion["voluntario_id"]
    tipo = postulacion["tipo"]

    if accion == "aceptar":
        if tipo == "externo":
            # Para una casa temporal, aceptar la revisión NO activa todavía
            # al voluntario. Primero se busca quién pueda verificar el hogar
            # o se habilita el fallback remoto.
            from app.services.home_verification_service import (
                preparar_verificacion_hogar,
            )

            return preparar_verificacion_hogar(
                postulacion_id=postulacion_id,
                asociacion_id=asociacion_id,
            )

        # 1. Voluntario pasa a activo_nivel_1 (se vincula a la asociación que lo aceptó,
        # sea interno o externo)
        supabase.table("voluntarios").update({
            "estado": "activo_nivel_1",
            "asociacion_id": asociacion_id,
        }).eq("id", voluntario_id).execute()

        # 2. Postulación resuelta
        supabase.table("postulaciones").update({
            "estado": "aceptada",
            "resuelta_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", postulacion_id).execute()

        # 3. Actualizar el rol del usuario a voluntario_interno / voluntario_externo
        voluntario_row = supabase.table("voluntarios").select(
            "usuario_id"
        ).eq("id", voluntario_id).execute()
        usuario_id_voluntario = voluntario_row.data[0]["usuario_id"]

        rol_nombre = "voluntario_interno" if tipo == "interno" else "voluntario_externo"
        rol_id = _obtener_rol_id(rol_nombre)
        update_usuario = {}
        if rol_id:
            update_usuario["rol_id"] = rol_id
        update_usuario["asociacion_id"] = asociacion_id
        supabase.table("usuarios").update(update_usuario).eq(
            "id", usuario_id_voluntario
        ).execute()

        return {"mensaje": "Postulación aceptada", "estado": "activo_nivel_1"}

    else:  # rechazar
        if not motivo or not motivo.strip():
            raise HTTPException(status_code=422, detail="El motivo de rechazo es obligatorio")

        supabase.table("postulaciones").update({
            "estado": "rechazada",
            "motivo_rechazo": motivo.strip(),
            "resuelta_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", postulacion_id).execute()

        supabase.table("voluntarios").update({
            "estado": "rechazado",
        }).eq("id", voluntario_id).execute()

        if tipo == "externo":
            supabase_admin.table("verificaciones_hogar").update({
                "estado": "rechazada",
                "motivo_resultado": motivo.strip(),
                "resuelta_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("postulacion_id", postulacion_id).execute()

        return {"mensaje": "Postulación rechazada", "estado": "rechazado"}


async def dar_de_baja_voluntario(voluntario_id: str, asociacion_id: str) -> dict:
    voluntario = supabase.table("voluntarios").select(
        "id, usuario_id, asociacion_id, estado"
    ).eq("id", voluntario_id).execute()

    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    voluntario = voluntario.data[0]

    if voluntario.get("asociacion_id") != asociacion_id:
        raise HTTPException(status_code=403, detail="Este voluntario no pertenece a tu asociación")

    if voluntario["estado"] not in ("activo_nivel_1", "activo_nivel_2"):
        raise HTTPException(status_code=400, detail="Solo se puede dar de baja a un voluntario activo")

    # Dar de baja, guardando el nivel que tenía para poder restaurarlo al reactivar
    supabase.table("voluntarios").update({
        "estado": "dado_de_baja",
        "estado_previo": voluntario["estado"],
    }).eq("id", voluntario_id).execute()

    # Limpiar también la referencia en usuarios (deja de pertenecer a esta asociación)
    supabase.table("usuarios").update({
        "asociacion_id": None,
    }).eq("id", voluntario["usuario_id"]).execute()

    reportes_activos = supabase.table("reportes").select(
        "id"
    ).eq("staff_asignado_id", voluntario["usuario_id"]).in_(
        "estado_reporte", ["asignado", "en_camino", "en_atencion"]
    ).execute()

    for reporte in (reportes_activos.data or []):
        supabase.table("reportes").update({
            "staff_asignado_id": None,
            "confirmacion_voluntario": None,
        }).eq("id", reporte["id"]).execute()

        registrar_historial(
            reporte_id=reporte["id"],
            usuario_id=None,
            tipo_evento="reasignado",
            descripcion="El voluntario asignado fue dado de baja; el caso vuelve a selección",
            datos_extra={"motivo": "baja_voluntario", "voluntario_id": voluntario_id},
        )

    return {"mensaje": "Voluntario dado de baja", "estado": "dado_de_baja"}


async def reactivar_voluntario(voluntario_id: str, asociacion_id: str) -> dict:
    """Reactiva a un voluntario previamente dado de baja, restaurando el nivel
    que tenía antes (activo_nivel_1 / activo_nivel_2) desde estado_previo.
    Nota: al dar de baja se limpió usuarios.asociacion_id, así que aquí hay
    que restaurarlo también, o el voluntario reactivado quedaría "flotando"
    sin asociación aunque voluntarios.asociacion_id sí la tenga."""
    voluntario = supabase.table("voluntarios").select(
        "id, usuario_id, asociacion_id, estado, estado_previo"
    ).eq("id", voluntario_id).execute()

    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    voluntario = voluntario.data[0]

    if voluntario.get("asociacion_id") != asociacion_id:
        raise HTTPException(status_code=403, detail="Este voluntario no pertenece a tu asociación")

    if voluntario["estado"] != "dado_de_baja":
        raise HTTPException(status_code=400, detail="Solo se puede reactivar a alguien dado de baja")

    nuevo_estado = voluntario.get("estado_previo") or "activo_nivel_1"

    supabase.table("voluntarios").update({
        "estado": nuevo_estado,
        "estado_previo": None,
    }).eq("id", voluntario_id).execute()

    supabase.table("usuarios").update({
        "asociacion_id": asociacion_id,
    }).eq("id", voluntario["usuario_id"]).execute()

    return {"mensaje": "Voluntario reactivado", "estado": nuevo_estado}


async def listar_voluntarios_asociacion(asociacion_id: str) -> list:
    """Lista los voluntarios vinculados a la asociación, para la vista de
    'Mis voluntarios' donde se puede dar de baja o reactivar. Incluye tanto
    activos como dados de baja (el frontend filtra con tabs); no incluye
    rechazados ni postulacion_pendiente — esos viven en /me/postulaciones."""
    resultado = supabase.table("voluntarios").select(
        "id, estado, created_at, "
        "usuarios(nombre, apellido_paterno, telefono, email), "
        "capacidades(especies, tamanios, ofrece_casa_hogar)"
    ).eq("asociacion_id", asociacion_id).in_(
        "estado", ["activo_nivel_1", "activo_nivel_2", "dado_de_baja"]
    ).order("created_at", desc=True).execute()

    voluntarios = []
    for v in resultado.data or []:
        usuario = v.get("usuarios") or {}
        capacidades = v.get("capacidades") or {}
        voluntarios.append({
            "voluntario_id": v["id"],
            "estado": v["estado"],
            "nombre": usuario.get("nombre"),
            "apellido_paterno": usuario.get("apellido_paterno"),
            "telefono": usuario.get("telefono"),
            "email": usuario.get("email"),
            "especies": capacidades.get("especies") or [],
            "tamanios": capacidades.get("tamanios") or [],
            "ofrece_casa_hogar": capacidades.get("ofrece_casa_hogar", False),
        })

    return voluntarios

# ---------------------------------------------------------------------------
# B2 — Formulario de capacidades
# ---------------------------------------------------------------------------

async def obtener_capacidades(voluntario_id: str) -> dict:
    perfil = supabase.table("voluntarios").select(
        "disponible_operativamente, pausa_operativa_hasta, "
        "contacto_emergencia_nombre, "
        "contacto_emergencia_telefono"
    ).eq("id", voluntario_id).execute()
    datos_perfil = perfil.data[0] if perfil.data else {}

    resultado = supabase.table("capacidades").select("*").eq(
        "voluntario_id", voluntario_id
    ).execute()

    if not resultado.data:
        return {"tiene_capacidades": False, **datos_perfil}

    return {"tiene_capacidades": True, **resultado.data[0], **datos_perfil}


async def guardar_capacidades(voluntario_id: str, datos: dict) -> dict:
    voluntario = supabase.table("voluntarios").select(
        "estado, disponible_operativamente"
    ).eq("id", voluntario_id).execute()

    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    estado_voluntario = voluntario.data[0]["estado"]
    if estado_voluntario not in (
        "postulacion_pendiente",
        "activo_nivel_1",
        "activo_nivel_2",
        "rechazado",
    ):
        raise HTTPException(
            status_code=403,
            detail="No puedes registrar capacidades en el estado actual de tu postulación"
        )

    # Validaciones de negocio
    if datos.get("capacidad_animales", 0) > 2:
        raise HTTPException(status_code=422, detail="La capacidad máxima es de 2 animales por voluntario")

    if not validar_claves_catalogo("tipo_animal_catalogo", datos.get("especies", [])):
        raise HTTPException(status_code=422, detail="Una o más especies no son válidas")

    if not validar_claves_catalogo("tamanio_catalogo", datos.get("tamanios", [])):
        raise HTTPException(status_code=422, detail="Uno o más tamaños no son válidos")

    if datos.get("latitud") is None or datos.get("longitud") is None:
        raise HTTPException(
            status_code=422,
            detail="Debes indicar tu zona de cobertura (puede ser aproximada)"
        )

    if not datos.get("acepto_terminos"):
        raise HTTPException(status_code=422, detail="Debes aceptar los términos y el aviso de privacidad")

    # Estos datos se capturan en el mismo formulario por seguridad y
    # conveniencia, pero pertenecen al perfil del voluntario, no a sus
    # capacidades operativas.
    datos_perfil = {}
    for campo in (
        "disponible_operativamente",
        "contacto_emergencia_nombre",
        "contacto_emergencia_telefono",
    ):
        valor = datos.pop(campo, None)
        if valor is not None:
            datos_perfil[campo] = valor

    if datos_perfil:
        datos_perfil["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("voluntarios").update(datos_perfil).eq(
            "id", voluntario_id
        ).execute()

    payload = {**datos, "voluntario_id": voluntario_id}

    # Upsert manual: intenta update, si no existe, insert
    existente = supabase.table("capacidades").select("voluntario_id").eq(
        "voluntario_id", voluntario_id
    ).execute()

    if existente.data:
        supabase.table("capacidades").update(payload).eq(
            "voluntario_id", voluntario_id
        ).execute()
    else:
        supabase.table("capacidades").insert(payload).execute()

    return {"mensaje": "Capacidades guardadas correctamente"}


def _fecha_utc(valor) -> datetime | None:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        fecha = valor
    else:
        fecha = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc)


async def obtener_disponibilidad_operativa(voluntario_id: str) -> dict:
    resultado = supabase.table("voluntarios").select(
        "id, estado, disponible_operativamente, pausa_operativa_hasta"
    ).eq("id", voluntario_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    voluntario = resultado.data[0]
    disponible = bool(voluntario.get("disponible_operativamente"))
    pausa_hasta = _fecha_utc(voluntario.get("pausa_operativa_hasta"))

    # Una pausa temporal vencida se normaliza al consultar el perfil. La
    # función SQL de matching también la considera disponible para no depender
    # de que la persona abra la aplicación.
    if not disponible and pausa_hasta and pausa_hasta <= datetime.now(timezone.utc):
        disponible = True
        pausa_hasta = None
        supabase.table("voluntarios").update({
            "disponible_operativamente": True,
            "pausa_operativa_hasta": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", voluntario_id).execute()

    return {
        "disponible_operativamente": disponible,
        "pausa_operativa_hasta": pausa_hasta.isoformat() if pausa_hasta else None,
        "pausa_indefinida": not disponible and pausa_hasta is None,
    }


async def actualizar_disponibilidad_operativa(
    voluntario_id: str,
    disponible: bool,
    pausa_hasta: datetime | None,
) -> dict:
    resultado = supabase.table("voluntarios").select(
        "id, estado"
    ).eq("id", voluntario_id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    if resultado.data[0]["estado"] not in ("activo_nivel_1", "activo_nivel_2"):
        raise HTTPException(
            status_code=403,
            detail="La disponibilidad operativa solo aplica a voluntarios activos",
        )

    pausa_utc = _fecha_utc(pausa_hasta)
    if disponible:
        pausa_utc = None
    elif pausa_utc and pausa_utc <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=422,
            detail="La fecha de reactivación debe estar en el futuro",
        )

    payload = {
        "disponible_operativamente": disponible,
        "pausa_operativa_hasta": pausa_utc.isoformat() if pausa_utc else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("voluntarios").update(payload).eq(
        "id", voluntario_id
    ).execute()

    return {
        "mensaje": (
            "Ya puedes recibir nuevas asignaciones"
            if disponible
            else "Tu disponibilidad quedó pausada"
        ),
        "disponible_operativamente": disponible,
        "pausa_operativa_hasta": payload["pausa_operativa_hasta"],
        "pausa_indefinida": not disponible and pausa_utc is None,
    }


# ---------------------------------------------------------------------------
# Migración staff -> voluntario_interno: reemplaza GET /staff/me/reportes.
# Misma lógica de 4 buckets que ya existía en staff.py, pero ya no exige
# rol 'staff' literal — solo que el usuario tenga un perfil de voluntario
# activo (interno o externo). Sigue leyendo reportes.staff_asignado_id,
# que es la columna real que usa todo el sistema (matching, escalamiento).
# ---------------------------------------------------------------------------
 
async def obtener_reportes_voluntario(usuario_id: str) -> dict:
    voluntario = supabase.table("voluntarios").select(
        "id, estado"
    ).eq("usuario_id", usuario_id).execute()

    if not voluntario.data or voluntario.data[0]["estado"] not in (
        "activo_nivel_1", "activo_nivel_2"
    ):
        raise HTTPException(
            status_code=403,
            detail="Solo un voluntario activo puede ver sus casos asignados"
        )

    capacidades = supabase.table("capacidades").select("latitud, longitud").eq(
        "voluntario_id", voluntario.data[0]["id"]
    ).execute()
    lat_voluntario = capacidades.data[0]["latitud"] if capacidades.data else None
    lon_voluntario = capacidades.data[0]["longitud"] if capacidades.data else None

    resultado = supabase.table("reportes").select(
        "id, estado_reporte, confirmacion_voluntario, municipio, colonia, calle, referencia, "
        "latitud, longitud, created_at, "
        "asociaciones(nombre, contacto_telefono), "
        "animal(id, orden, es_grupo, cantidad, trae_crias_nacidas, numero_crias_nacidas, "
        "sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden))"
    ).eq("staff_asignado_id", usuario_id).order("created_at", desc=True).execute()

    # Motor de sugerencias Ruta 1 (BACK01/BACK02): mismo patrón batch que
    # get_reportes_asignados() en associations.py — si ya existe una
    # contribución con reporte_id, la sugerencia de aliado veterinario fue
    # aceptada; si además hay un evento "hito_llego_veterinaria" en el
    # historial, la llegada ya se registró.
    reporte_ids_todos = [r["id"] for r in (resultado.data or [])]
    reportes_con_sugerencia_aceptada = set()
    reportes_con_llegada_registrada = set()
    if reporte_ids_todos:
        contribs = supabase.table("contribuciones").select("reporte_id").in_(
            "reporte_id", reporte_ids_todos
        ).execute()
        reportes_con_sugerencia_aceptada = {
            c["reporte_id"] for c in (contribs.data or []) if c.get("reporte_id")
        }

        llegadas = supabase.table("historial_reporte").select("reporte_id").in_(
            "reporte_id", reporte_ids_todos
        ).eq("tipo_evento", "hito_llego_veterinaria").execute()
        reportes_con_llegada_registrada = {
            e["reporte_id"] for e in (llegadas.data or []) if e.get("reporte_id")
        }

    esperando_confirmacion = []
    pendientes = []
    en_accion = []
    completados = []
    historial = []

    for r in resultado.data or []:
        animales_crudos, animal_legado = shape_animal_embed(r.get("animal"))
        fotos = (animal_legado or {}).get("animal_fotos") or []
        foto_url = None
        if fotos:
            fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
            foto_url = fotos_ordenadas[0]["foto_url"]

        reporte = {
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "calle": r.get("calle"),
            "referencia": r.get("referencia"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "asociacion": {
                "nombre": r.get("asociaciones", {}).get("nombre"),
                "telefono": r.get("asociaciones", {}).get("contacto_telefono"),
            },
            "animales": [shape_animal_response(a) for a in animales_crudos],
            "tiene_sugerencia_aceptada": r["id"] in reportes_con_sugerencia_aceptada,
            "tiene_llegada_veterinaria_registrada": r["id"] in reportes_con_llegada_registrada,
        }

        estado = r.get("estado_reporte")
        # Un caso "asignado" con confirmacion_voluntario='esperando' significa
        # que a ESTE voluntario se le propuso el caso y todavía no ha
        # respondido — necesita su propio grupo con acción Aceptar/Rechazar,
        # no mezclarse con "pendientes" (que ahí no puede hacer nada más que
        # esperar a que se le asigne alguien).
        if estado == "asignado" and r.get("confirmacion_voluntario") == "esperando":
            reporte["distancia_km"] = _distancia_km(
                lat_voluntario, lon_voluntario, r.get("latitud"), r.get("longitud")
            )
            esperando_confirmacion.append(reporte)
        elif estado in ("pendiente", "asignado"):
            pendientes.append(reporte)
        elif estado in ("en_camino", "en_atencion"):
            en_accion.append(reporte)
        elif estado in ("rescatado", "cerrado"):
            completados.append(reporte)
        elif estado in ("sin_cobertura", "duplicado_vinculable", "duplicado_informativo", "cancelado_por_reportante"):
            historial.append(reporte)

    return {
        "esperando_confirmacion": esperando_confirmacion,
        "pendientes": pendientes,
        "en_accion": en_accion,
        "completados": completados,
        "historial": historial,
    }
 
# ---------------------------------------------------------------------------
# Perfil Voluntario Externo (Casa Temporal)
# ---------------------------------------------------------------------------
async def obtener_perfil_externo(voluntario_id: str) -> dict:
    resultado = supabase_admin.table("perfil_casa_temporal").select("*").eq(
        "voluntario_id", voluntario_id
    ).limit(1).execute()

    if not resultado.data:
        return {"tiene_perfil": False, "perfil": None}

    return {"tiene_perfil": True, "perfil": resultado.data[0]}


async def crear_perfil_externo(
    voluntario_id: str,
    datos_json: dict,
    identificacion_file=None,
    video_file=None,
) -> dict:
    """Crea o actualiza el perfil externo sin borrar evidencia existente.

    En una re-postulación los archivos solo se reemplazan si la persona
    adjunta otros. El video sí puede retirarse explícitamente desde el
    formulario; la identificación siempre debe permanecer.
    """
    existente = supabase_admin.table("perfil_casa_temporal").select(
        "id, identificacion_url, video_recorrido_url"
    ).eq("voluntario_id", voluntario_id).limit(1).execute()
    perfil_existente = existente.data[0] if existente.data else None

    identificacion_url = (
        perfil_existente.get("identificacion_url")
        if perfil_existente
        else None
    )
    if identificacion_file:
        identificacion_url = await storage_service.subir_foto(
            identificacion_file,
            "identificaciones",
        )
    if not identificacion_url:
        raise HTTPException(
            status_code=422,
            detail="Debes subir una identificación",
        )

    video_url = (
        perfil_existente.get("video_recorrido_url")
        if perfil_existente
        else None
    )
    if datos_json.get("eliminarVideo"):
        video_url = None
    if video_file:
        video_url = await storage_service.subir_foto(
            video_file,
            "videos_recorridos",
        )

    # 2. Armar el diccionario con exactamente los nombres de las columnas que creaste en SQL
    payload = {
        "voluntario_id": voluntario_id,
        
        "latitud": datos_json.get("latitud"),
        "longitud": datos_json.get("longitud"),
        "calle": datos_json.get("calle"),
        "numero": datos_json.get("numero"),
        "colonia": datos_json.get("colonia"),
        "municipio": datos_json.get("municipio"),
        "estado_ubicacion": datos_json.get("estado"),
        "referencia": datos_json.get("referencia"),
        
        "tipo_vivienda": datos_json.get("tipoVivienda"),
        "subcategoria_vivienda": datos_json.get("subcategoriaVivienda"),
        "vivienda_otra_desc": datos_json.get("customViviendaInput"),
        "autorizacion_propietario": datos_json.get("autorizacion"),
        "ubicacion_animal": datos_json.get("ubicacionAnimal"),
        "acepta_visita": datos_json.get("aceptaVisita"),
        
        "adultos_hogar": int(datos_json.get("numAdultos", 0)),
        "horas_solo": int(datos_json.get("horasSolo", 0)),
        "ninos_hogar": datos_json.get("ninosEdades"),
        "otros_animales": datos_json.get("otrosAnimales"),
        "animales_vacunados": datos_json.get("vacunados"),
        "puede_aislar": datos_json.get("puedeSeparar"),
        
        "preferencia_especies": datos_json.get("preferenciaEspecie", []),
        "subcategoria_otra_especie": datos_json.get("subcategoriaOtroEspecie"),
        "especie_otra_desc": datos_json.get("customOtroEspecieInput"),
        "preferencia_tamanios": datos_json.get("preferenciaTamanio", []),
        
        "tiempo_resguardo": datos_json.get("tiempoResguardo"),
        "tiempo_resguardo_dias": int(datos_json.get("tiempoResguardoDias")) if datos_json.get("tiempoResguardoDias") else None,
        
        "chk_accesos_seguros": datos_json.get("checkAccesos", False),
        "chk_bardas": datos_json.get("checkBardas", False),
        "chk_balcones": datos_json.get("checkBalcones", False),
        "chk_espacio": datos_json.get("checkEspacio", False),
        "chk_aislamiento": datos_json.get("checkAislamiento", False),
        "chk_cuarentena": datos_json.get("checkCuarentena", False),
        "chk_no_entregar": datos_json.get("checkNoEntregar", False),
        
        "contacto_emergencia_nombre": datos_json.get("nombreEmergencia"),
        "contacto_emergencia_telefono": datos_json.get("telEmergencia"),
        
        "identificacion_url": identificacion_url,
        "video_recorrido_url": video_url,
        "horarios_visita": datos_json.get("horariosVisita", []),
        "consentimiento_evidencia": datos_json.get("consentimiento", False),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if perfil_existente:
        resultado = supabase_admin.table("perfil_casa_temporal").update(
            payload
        ).eq("id", perfil_existente["id"]).execute()
    else:
        resultado = supabase_admin.table("perfil_casa_temporal").insert(
            payload
        ).execute()

    # El contacto de emergencia es común a cualquier voluntario. Se conserva
    # también en perfil_casa_temporal por compatibilidad con el flujo actual,
    # pero voluntarios pasa a ser la fuente canónica para capacidades v2.
    supabase_admin.table("voluntarios").update({
        "contacto_emergencia_nombre": datos_json.get("nombreEmergencia"),
        "contacto_emergencia_telefono": datos_json.get("telEmergencia"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", voluntario_id).execute()
    
    return resultado.data[0]
