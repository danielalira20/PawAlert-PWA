from datetime import datetime, timezone
from fastapi import HTTPException
from app.db.supabase import supabase
from app.services.report_service import obtener_id_catalogo, registrar_historial


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
        "voluntarios(usuario_id, usuarios(nombre, apellido_paterno, telefono, email))"
    ).eq("asociacion_id", asociacion_id).order("created_at", desc=True)

    if estado:
        query = query.eq("estado", estado)

    resultado = query.execute()
    postulaciones = []

    for p in resultado.data:
        voluntario = p.get("voluntarios") or {}
        usuario = voluntario.get("usuarios") or {}

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

    # Dar de baja
    supabase.table("voluntarios").update({
        "estado": "dado_de_baja",
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

# ---------------------------------------------------------------------------
# B2 — Formulario de capacidades
# ---------------------------------------------------------------------------

async def obtener_capacidades(voluntario_id: str) -> dict:
    resultado = supabase.table("capacidades").select("*").eq(
        "voluntario_id", voluntario_id
    ).execute()

    if not resultado.data:
        return {"tiene_capacidades": False}

    return {"tiene_capacidades": True, **resultado.data[0]}


async def guardar_capacidades(voluntario_id: str, datos: dict) -> dict:
    voluntario = supabase.table("voluntarios").select(
        "estado"
    ).eq("id", voluntario_id).execute()

    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    estado_voluntario = voluntario.data[0]["estado"]
    if estado_voluntario not in ("activo_nivel_1", "activo_nivel_2"):
        raise HTTPException(
            status_code=403,
            detail="Solo puedes registrar capacidades si tu postulación fue aceptada"
        )

    # Validaciones de negocio
    if datos["capacidad_animales"] > 2:
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
 
    resultado = supabase.table("reportes").select(
        "id, estado_reporte, municipio, colonia, calle, referencia, "
        "latitud, longitud, created_at, "
        "asociaciones(nombre, contacto_telefono), "
        "animal(id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden))"
    ).eq("staff_asignado_id", usuario_id).order("created_at", desc=True).execute()
 
    pendientes = []
    en_accion = []
    completados = []
    historial = []
 
    for r in resultado.data or []:
        animal = r.get("animal") or {}
        fotos = animal.get("animal_fotos") or []
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
            "animal": {
                "tipo_animal": animal.get("tipo_animal_catalogo", {}).get("clave"),
                "condicion": animal.get("condicion_catalogo", {}).get("clave"),
                "tamanio": animal.get("tamanio_catalogo", {}).get("clave"),
                "sexo": animal.get("sexo"),
                "edad_aproximada": animal.get("edad_aproximada"),
                "descripcion": animal.get("descripcion"),
            }
        }
 
        estado = r.get("estado_reporte")
        if estado in ("pendiente", "asignado"):
            pendientes.append(reporte)
        elif estado in ("en_camino", "en_atencion"):
            en_accion.append(reporte)
        elif estado == "cerrado":
            completados.append(reporte)
        elif estado in ("sin_cobertura", "duplicado_vinculable", "duplicado_informativo", "cancelado_por_reportante"):
            historial.append(reporte)
 
    return {
        "pendientes": pendientes,
        "en_accion": en_accion,
        "completados": completados,
        "historial": historial,
    }