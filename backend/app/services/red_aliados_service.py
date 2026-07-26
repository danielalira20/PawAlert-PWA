from fastapi import HTTPException
from app.db.supabase import supabase
from app.services.report_service import obtener_id_catalogo
from app.models.red_aliados import ContribucionRequest, OfertaProactivaRequest


def _validar_subcategoria(subcategoria_id: str, categoria: str) -> None:
    """Valida que subcategoria_id exista, esté activa, y pertenezca a la
    categoria declarada — subcategoria_id es str (no Enum) porque
    subcategoria_recurso puede crecer sin deploy, así que se checa contra
    la tabla en tiempo de ejecución en vez de contra un set fijo."""
    categoria_id = obtener_id_catalogo("categoria_recurso", categoria)
    if not categoria_id:
        raise HTTPException(status_code=500, detail="Error al resolver catálogo de categoría")

    resultado = supabase.table("subcategoria_recurso").select("id, categoria_id").eq(
        "id", subcategoria_id
    ).eq("activo", True).execute()

    if not resultado.data:
        raise HTTPException(status_code=422, detail="Subcategoría no válida")

    if resultado.data[0]["categoria_id"] != categoria_id:
        raise HTTPException(
            status_code=422,
            detail="La subcategoría no pertenece a la categoría seleccionada"
        )


def _empacar_detalle(body: ContribucionRequest | OfertaProactivaRequest, incluir_categoria: bool = False) -> dict:
    """Junta en `detalle` (jsonb) los campos del 'paso común' que no tienen
    columna propia en la tabla destino — ver nota de mapeo de columnas en
    crear_contribucion/crear_oferta_proactiva."""
    detalle = dict(body.detalle or {})
    if incluir_categoria:
        detalle.setdefault("categoria", body.categoria.value)
    if body.especies_aplica:
        detalle.setdefault("especies_aplica", [e.value for e in body.especies_aplica])
    if body.fecha_disponibilidad:
        detalle.setdefault("fecha_disponibilidad", body.fecha_disponibilidad)
    if body.lugar_entrega:
        detalle.setdefault("lugar_entrega", body.lugar_entrega)
    if body.forma_entrega:
        detalle.setdefault("forma_entrega", body.forma_entrega)
    if body.vigencia:
        detalle.setdefault("vigencia", body.vigencia)
    return detalle


async def crear_contribucion(usuario_id: str, body: ContribucionRequest) -> dict:
    necesidad = supabase.table("necesidades").select("id, estado").eq(
        "id", body.necesidad_id
    ).execute()
    if not necesidad.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")
    if necesidad.data[0]["estado"] != "activa":
        raise HTTPException(status_code=400, detail="Esta necesidad ya no está activa")

    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    # `contribuciones` no tiene columna `categoria` (solo `subcategoria_id`,
    # de donde se puede derivar) — se guarda también en `detalle` para no
    # perder el dato que sí mandó el formulario.
    detalle = _empacar_detalle(body, incluir_categoria=True)

    resultado = supabase.table("contribuciones").insert({
        "necesidad_id": body.necesidad_id,
        "usuario_id": usuario_id,
        "cantidad_valor": body.cantidad_valor,
        "cantidad_unidad": body.cantidad_unidad,
        "modo": "reactiva",
        "oferta_proactiva_id": body.oferta_proactiva_id,
        "subcategoria_id": body.subcategoria_id,
        "detalle": detalle,
    }).execute()

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "necesidad_id": fila["necesidad_id"],
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }


async def crear_oferta_proactiva(usuario_id: str, body: OfertaProactivaRequest) -> dict:
    perfil = supabase.table("perfil_apoyo").select("id, tipo").eq(
        "usuario_id", usuario_id
    ).execute()
    if not perfil.data:
        raise HTTPException(
            status_code=403,
            detail="Necesitas un perfil de aliado para ofrecer disponibilidad proactiva"
        )

    # Regla de negocio #4 (flujo-red-aliados-pawalert.md): el modo
    # proactivo es exclusivo de aliado_local / patrocinador_institucional,
    # nunca de donante_comunitario.
    if perfil.data[0]["tipo"] == "donante_comunitario":
        raise HTTPException(
            status_code=403,
            detail="El modo proactivo no está disponible para donantes comunitarios"
        )

    _validar_subcategoria(body.subcategoria_id, body.categoria.value)

    # `ofertas_proactivas` sí tiene columna `categoria` (varchar) — no hace
    # falta duplicarla en `detalle` como en contribuciones.
    detalle = _empacar_detalle(body, incluir_categoria=False)

    resultado = supabase.table("ofertas_proactivas").insert({
        "perfil_apoyo_id": perfil.data[0]["id"],
        "categoria": body.categoria.value,
        "capacidad_declarada": body.capacidad_declarada,
        "capacidad_disponible": body.capacidad_declarada,
        "unidad": body.unidad,
        "frecuencia": body.frecuencia,
        "subcategoria_id": body.subcategoria_id,
        "detalle": detalle,
    }).execute()

    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "categoria": fila["categoria"],
        "capacidad_declarada": fila["capacidad_declarada"],
        "capacidad_disponible": fila["capacidad_disponible"],
        "unidad": fila["unidad"],
        "activa": fila["activa"],
        "created_at": str(fila["created_at"]),
    }


# ─── Motor de sugerencias, Ruta 1 (BACK01) ───────────────────────────────
# Se llama desde POST /reports/{id}/hitos (registrar_hito en reports.py)
# cuando se registra el hito "encontre_animal". Solo lee — nunca reserva
# capacidad (eso es BACK02) ni persiste nada (la sugerencia se regresa en
# la respuesta del hito, no se guarda en ninguna tabla).

_CONDICION_A_URGENCIA = {"grave": "critico", "herido": "urgente", "estable": "no_urgente"}
_ORDEN_URGENCIA = {"no_urgente": 0, "urgente": 1, "critico": 2}


def _nivel_urgencia_efectivo(condicion_animal: str | None, condicion_observada: str | None) -> str | None:
    """Nivel de urgencia para el motor de sugerencias — puramente
    lógico/temporal para decidir a quién sugerir en este instante. Nunca
    escribe en animal.condicion_id ni en ninguna otra columna: el reporte
    se queda exactamente como se creó.

    Base: animal.condicion_id (grave/herido/estable) tal como se declaró al
    crear el reporte. `condicion_observada` (texto libre de
    HitoRequest.condicion_observada en el hito 'encontre_animal') solo
    puede ESCALAR ese nivel hacia arriba, nunca bajarlo:
    - 'Igual que en el reporte' -> sin cambio
    - 'Peor de lo esperado' -> sube a mínimo 'urgente'
    - 'En estado crítico' -> fuerza 'critico'
    - 'No estaba en el lugar' -> None (no se ejecuta el matching)
    - None o cualquier otro valor no reconocido -> sin cambio (mismo
      tratamiento que 'Igual que en el reporte')
    """
    nivel = _CONDICION_A_URGENCIA.get(condicion_animal or "", "no_urgente")

    if condicion_observada == "No estaba en el lugar":
        return None
    if condicion_observada == "En estado crítico":
        return "critico"
    if condicion_observada == "Peor de lo esperado":
        if _ORDEN_URGENCIA[nivel] < _ORDEN_URGENCIA["urgente"]:
            return "urgente"
        return nivel
    return nivel


def sugerir_aliado_veterinario(reporte_id: str, nivel_urgencia: str) -> dict | None:
    """Busca la oferta proactiva de servicios veterinarios más cercana
    compatible por categoría + zona + nivel de urgencia, vía la función SQL
    sugerencia_veterinaria_cercana (migrations/0011_sugerencia_veterinaria.sql)
    — mismo patrón que assignment_service.asignar_asociacion() con
    encontrar_asociacion_cercana."""
    resultado = supabase.rpc(
        "sugerencia_veterinaria_cercana",
        {"p_reporte_id": reporte_id, "p_nivel_urgencia": nivel_urgencia},
    ).execute()

    if not resultado.data:
        return None

    fila = resultado.data[0]
    return {
        "oferta_id": fila["oferta_id"],
        "perfil_apoyo_id": fila["perfil_apoyo_id"],
        "nombre": fila["nombre"],
        "distancia_km": fila["distancia_km"],
        "unidad": fila["unidad"],
        "capacidad_disponible": fila["capacidad_disponible"],
        "nivel_urgencia": nivel_urgencia,
    }


# ─── BACK02 — aceptar la sugerencia y reservar capacidad ─────────────────
# reservar_capacidad_oferta() es genérica a propósito (ver
# migrations/0012_aceptar_sugerencia_aliado.sql): cualquier flujo que
# necesite descontar capacidad de una oferta_proactiva la puede llamar
# igual, no solo Ruta 1 — por ejemplo BACK06 de Diego más adelante, cuando
# exista el flujo de aceptar una contribución reactiva normal que también
# venga de una oferta_proactiva_id.

def reservar_capacidad_oferta(oferta_id: str, cantidad: float) -> float | None:
    resultado = supabase.rpc(
        "reservar_capacidad_oferta",
        {"p_oferta_id": oferta_id, "p_cantidad": cantidad},
    ).execute()
    return resultado.data  # número resultante, o None si no alcanzaba/no existe/no está activa


async def aceptar_sugerencia_veterinaria(reporte_id: str, oferta_id: str) -> dict:
    """Acepta la sugerencia que regresó POST /reports/{id}/hitos y reserva
    de inmediato 1 unidad de la oferta — Ruta 1 siempre reserva una sola
    unidad (una cita/consulta), no una cantidad variable, porque la
    urgencia médica pesa más que esperar aprobación (flujo-red-aliados-pawalert.md,
    sección 6, Ruta 1, paso 5).

    Crea la contribución en estado 'comprometida', NO 'confirmada' — la
    asociación confirma DESPUÉS que el servicio se usó (mismo doc, paso 6);
    ese endpoint de confirmación todavía no existe (trabajo futuro,
    probablemente de Diego), así que aquí solo se deja el estado correcto
    para cuando exista."""
    capacidad_resultante = reservar_capacidad_oferta(oferta_id, 1)
    if capacidad_resultante is None:
        raise HTTPException(
            status_code=409,
            detail="Ya no hay capacidad disponible en esta oferta — alguien más la tomó primero."
        )

    oferta = supabase.table("ofertas_proactivas").select(
        "unidad, subcategoria_id, perfil_apoyo(id, usuario_id)"
    ).eq("id", oferta_id).execute()

    if not oferta.data:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")

    fila_oferta = oferta.data[0]
    perfil_apoyo = fila_oferta.get("perfil_apoyo") or {}
    # El usuario_id de la contribución es el del aliado dueño de la oferta
    # (quien ofrece, según el esquema documentado en tareas-red-aliados-pawalert.md),
    # no el del staff/voluntario que acepta la sugerencia.
    usuario_aliado_id = perfil_apoyo.get("usuario_id")
    perfil_apoyo_id = perfil_apoyo.get("id")

    resultado = supabase.table("contribuciones").insert({
        "reporte_id": reporte_id,
        "necesidad_id": None,
        "usuario_id": usuario_aliado_id,
        "cantidad_valor": 1,
        "cantidad_unidad": fila_oferta.get("unidad"),
        "modo": "proactiva",
        "oferta_proactiva_id": oferta_id,
        "subcategoria_id": fila_oferta.get("subcategoria_id"),
        "estado": "comprometida",
        "detalle": {"origen": "sugerencia_ruta1"},
    }).execute()

    fila = resultado.data[0]
    contribucion = {
        "id": fila["id"],
        "necesidad_id": fila.get("necesidad_id"),
        "reporte_id": fila.get("reporte_id"),
        "oferta_proactiva_id": fila.get("oferta_proactiva_id"),
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }

    # Datos de contacto y ubicación del aliado para que el voluntario/staff
    # que trae el caso pueda llevar al animal a la veterinaria — mismo
    # criterio que contacto_aliado/contacto_asociacion de Ruta 2
    # (aceptar_sugerencia_general), duplicado a propósito en vez de
    # extraído a un helper compartido.
    contacto_aliado = {"nombre": None, "telefono": None, "email": None}
    if usuario_aliado_id:
        usuario_aliado = supabase.table("usuarios").select(
            "nombre, apellido_paterno, telefono, email"
        ).eq("id", usuario_aliado_id).execute()
        if usuario_aliado.data:
            fila_usuario = usuario_aliado.data[0]
            contacto_aliado = {
                "nombre": " ".join(
                    filter(None, [fila_usuario.get("nombre"), fila_usuario.get("apellido_paterno")])
                ).strip() or None,
                "telefono": fila_usuario.get("telefono"),
                "email": fila_usuario.get("email"),
            }

    ubicacion_aliado = {
        "calle": None, "colonia": None, "municipio": None,
        "referencia": None, "latitud": None, "longitud": None,
    }
    if perfil_apoyo_id:
        ubicacion = supabase.rpc(
            "ubicacion_perfil_apoyo", {"p_perfil_apoyo_id": perfil_apoyo_id}
        ).execute()
        if ubicacion.data:
            fila_ubicacion = ubicacion.data[0]
            ubicacion_aliado = {
                "calle": fila_ubicacion.get("calle"),
                "colonia": fila_ubicacion.get("colonia"),
                "municipio": fila_ubicacion.get("municipio"),
                "referencia": fila_ubicacion.get("referencia"),
                "latitud": float(fila_ubicacion["latitud"]) if fila_ubicacion.get("latitud") is not None else None,
                "longitud": float(fila_ubicacion["longitud"]) if fila_ubicacion.get("longitud") is not None else None,
            }

    return {
        "contribucion": contribucion,
        "contacto_aliado": contacto_aliado,
        "ubicacion_aliado": ubicacion_aliado,
    }


# ─── Motor de sugerencias, Ruta 2 (BACK03) — necesidades generales ───────
# A diferencia de Ruta 1 (ligada a un hito de un reporte con urgencia
# médica, match único automático), aquí la asociación consulta bajo
# demanda contra una necesidad general (sin reporte de por medio) y elige
# entre una lista de ofertas compatibles, aceptando la cantidad que
# quiera. Función SQL propia (ofertas_compatibles_necesidad,
# migrations/0013_ofertas_compatibles_necesidad.sql) — no se reusa la de
# Ruta 1 porque el ancla geográfica, el filtro de categoría y la
# cardinalidad del resultado son distintos.

def buscar_ofertas_compatibles(necesidad_id: str) -> list[dict]:
    resultado = supabase.rpc(
        "ofertas_compatibles_necesidad",
        {"p_necesidad_id": necesidad_id},
    ).execute()

    return [
        {
            "oferta_id": fila["oferta_id"],
            "perfil_apoyo_id": fila["perfil_apoyo_id"],
            "nombre": fila["nombre"],
            "distancia_km": fila["distancia_km"],
            "unidad": fila["unidad"],
            "capacidad_disponible": fila["capacidad_disponible"],
        }
        for fila in (resultado.data or [])
    ]


async def aceptar_sugerencia_general(necesidad_id: str, oferta_id: str, cantidad: float) -> dict:
    """Acepta una oferta compatible con una necesidad general y reserva la
    cantidad indicada — a diferencia de Ruta 1 (siempre 1 unidad fija),
    aquí la cantidad es variable y la elige la asociación.

    Crea la contribución en estado 'comprometida' (mismo criterio que
    Ruta 1 — la confirmación de uso es un paso futuro que todavía no
    existe) y regresa, además de la contribución, los datos de contacto
    de ambas partes para que coordinen la entrega fuera de la plataforma
    (no hay chat ni logística interna en este alcance)."""
    capacidad_resultante = reservar_capacidad_oferta(oferta_id, cantidad)
    if capacidad_resultante is None:
        # Mensaje distinto al de Ruta 1: ahí la cantidad siempre es 1 fija,
        # así que un 409 solo puede ser una carrera con otra asociación.
        # Aquí la cantidad es variable, así que el motivo más probable es
        # simplemente pedir más de lo disponible, no necesariamente una
        # carrera.
        raise HTTPException(
            status_code=409,
            detail="La cantidad solicitada supera la capacidad disponible en esta oferta"
        )

    oferta = supabase.table("ofertas_proactivas").select(
        "unidad, subcategoria_id, perfil_apoyo(usuario_id)"
    ).eq("id", oferta_id).execute()
    if not oferta.data:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    fila_oferta = oferta.data[0]
    usuario_aliado_id = (fila_oferta.get("perfil_apoyo") or {}).get("usuario_id")

    necesidad = supabase.table("necesidades").select(
        "asociacion_id"
    ).eq("id", necesidad_id).execute()
    if not necesidad.data:
        raise HTTPException(status_code=404, detail="Necesidad no encontrada")
    asociacion_id = necesidad.data[0]["asociacion_id"]

    resultado = supabase.table("contribuciones").insert({
        "necesidad_id": necesidad_id,
        "reporte_id": None,
        "usuario_id": usuario_aliado_id,
        "cantidad_valor": cantidad,
        "cantidad_unidad": fila_oferta.get("unidad"),
        "modo": "proactiva",
        "oferta_proactiva_id": oferta_id,
        "subcategoria_id": fila_oferta.get("subcategoria_id"),
        "estado": "comprometida",
        "detalle": {"origen": "sugerencia_ruta2"},
    }).execute()
    fila = resultado.data[0]

    contribucion = {
        "id": fila["id"],
        "necesidad_id": fila.get("necesidad_id"),
        "reporte_id": fila.get("reporte_id"),
        "oferta_proactiva_id": fila.get("oferta_proactiva_id"),
        "estado": fila["estado"],
        "created_at": str(fila["created_at"]),
    }

    contacto_aliado = {"nombre": None, "telefono": None, "email": None}
    if usuario_aliado_id:
        usuario_aliado = supabase.table("usuarios").select(
            "nombre, apellido_paterno, telefono, email"
        ).eq("id", usuario_aliado_id).execute()
        if usuario_aliado.data:
            fila_usuario = usuario_aliado.data[0]
            contacto_aliado = {
                "nombre": " ".join(
                    filter(None, [fila_usuario.get("nombre"), fila_usuario.get("apellido_paterno")])
                ).strip() or None,
                "telefono": fila_usuario.get("telefono"),
                "email": fila_usuario.get("email"),
            }

    contacto_asociacion = {"nombre": None, "telefono": None, "email": None}
    asociacion = supabase.table("asociaciones").select(
        "nombre, contacto_telefono, contacto_email"
    ).eq("id", asociacion_id).execute()
    if asociacion.data:
        fila_asociacion = asociacion.data[0]
        contacto_asociacion = {
            "nombre": fila_asociacion.get("nombre"),
            "telefono": fila_asociacion.get("contacto_telefono"),
            "email": fila_asociacion.get("contacto_email"),
        }

    # Notificación best-effort al aliado — nunca debe tumbar la aceptación
    # ya confirmada si falla (por ejemplo, si el esquema de
    # notificaciones_aliado cambia). tipo='oferta_aceptada' no tiene CHECK
    # constraint en la tabla, así que no requiere cambio de esquema.
    try:
        if usuario_aliado_id:
            perfil_apoyo = supabase.table("perfil_apoyo").select("id").eq(
                "usuario_id", usuario_aliado_id
            ).execute()
            if perfil_apoyo.data:
                supabase.table("notificaciones_aliado").insert({
                    "perfil_apoyo_id": perfil_apoyo.data[0]["id"],
                    "necesidad_id": necesidad_id,
                    "tipo": "oferta_aceptada",
                }).execute()
    except Exception as error:
        print(f"[WARN] No se pudo crear notificaciones_aliado para oferta {oferta_id}: {error}")

    return {
        "contribucion": contribucion,
        "contacto_aliado": contacto_aliado,
        "contacto_asociacion": contacto_asociacion,
    }

def crear_necesidad_asociacion(supabase, asociacion_id: str, data):
    # 1. Mapear la urgencia
    urgencia_db = None
    if data.urgencia:
        mapeo_urgencia = {
            "Alta": "critico",
            "Media": "urgente",
            "Baja": "no_urgente"
        }
        urgencia_db = mapeo_urgencia.get(data.urgencia)

    # 2. Preparar el payload con las nuevas columnas
    necesidad_payload = {
        "asociacion_id": asociacion_id,
        "reporte_id": str(data.reporte_id) if data.reporte_id else None,
        "categoria": data.categoria,
        "urgencia": urgencia_db,
        "estado": "activa",
        "subcategoria_id": str(data.subcategoria_id) if data.subcategoria_id else None,
        "cantidad_valor": data.cantidad_valor,
        "cantidad_unidad": data.cantidad_unidad,
        "detalle": data.detalle if data.detalle else {}
    }

    # 3. Insertar en Supabase
    try:
        response = supabase.table("necesidades").insert(necesidad_payload).execute()
        necesidad_creada = response.data[0]
        
        # BACK05: Notificar a aliados compatibles (Best-Effort)
        try:
            supabase.rpc(
                "notificar_aliados_cercanos", 
                {"p_necesidad_id": necesidad_creada["id"]}
            ).execute()
        except Exception as notify_err:
            print(f"[WARN] Error al generar notificaciones para necesidad {necesidad_creada['id']}: {notify_err}")

        return necesidad_creada
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al crear la necesidad: {str(e)}")