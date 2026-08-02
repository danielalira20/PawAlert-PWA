from datetime import datetime, timezone

from fastapi import HTTPException

from app.db.supabase import supabase_admin
from app.services import storage_service
from app.services.video_evidence_service import distancia_metros


TIPOS_EVIDENCIA = {
    "video",
    "identificacion",
    "fotos",
    "direccion",
    "formulario",
}

CHECKLIST_REMOTO_CAMPOS = {
    "identificacion_legible",
    "identidad_consistente",
    "direccion_consistente",
    "formulario_completo",
    "recorrido_suficiente",
    "accesos_seguros",
    "cierres_perimetrales",
    "ventanas_balcones",
    "espacio_aislamiento",
    "higiene_ventilacion",
    "convivencia_hogar",
    "autorizacion_vivienda",
}


def _registrar_evento_verificacion(
    verificacion_id: str,
    tipo_evento: str,
    descripcion: str,
    *,
    actor_usuario_id: str | None = None,
    actor_tipo: str = "sistema",
    datos: dict | None = None,
) -> None:
    """Registra auditoría sin impedir la operación principal por telemetría."""
    try:
        supabase_admin.table("bitacora_verificacion_hogar").insert({
            "verificacion_hogar_id": verificacion_id,
            "tipo_evento": tipo_evento,
            "actor_usuario_id": actor_usuario_id,
            "actor_tipo": actor_tipo,
            "descripcion": descripcion,
            "datos": datos or {},
        }).execute()
    except Exception:
        # La migración se despliega antes que el código. Este resguardo evita
        # que una falla secundaria de auditoría deje el expediente bloqueado.
        pass


def registrar_reintento_analisis(
    verificacion_id: str,
    usuario_staff_id: str,
) -> None:
    _registrar_evento_verificacion(
        verificacion_id,
        "analisis_reintentado",
        "Un integrante de la asociación solicitó repetir el análisis del video.",
        actor_usuario_id=usuario_staff_id,
        actor_tipo="asociacion",
    )


def _snapshot_evidencia(verificacion: dict, perfil: dict) -> dict:
    return {
        "identificacion_url": perfil.get("identificacion_url"),
        "video_url": perfil.get("video_recorrido_url"),
        "analisis_video": verificacion.get("analisis_video"),
        "analisis_video_estado": verificacion.get("analisis_video_estado"),
        "analisis_video_modelo": verificacion.get("analisis_video_modelo"),
        "analisis_video_error": verificacion.get("analisis_video_error"),
        "estado_coordenadas": verificacion.get("estado_coordenadas"),
        "distancia_coordenadas_m": verificacion.get("distancia_coordenadas_m"),
    }


def _crear_ronda_inicial(
    verificacion_id: str,
    perfil: dict,
) -> None:
    """Crea la ronda 1 para expedientes nuevos; es idempotente."""
    try:
        existente = supabase_admin.table(
            "rondas_evidencia_verificacion"
        ).select("id").eq(
            "verificacion_hogar_id", verificacion_id
        ).limit(1).execute()
        if existente.data:
            return
        supabase_admin.table("rondas_evidencia_verificacion").insert({
            "verificacion_hogar_id": verificacion_id,
            "numero": 1,
            "estado": "inicial",
            "evidencia_anterior": {
                "identificacion_url": perfil.get("identificacion_url"),
                "video_url": perfil.get("video_recorrido_url"),
                "analisis_video_estado": "pendiente",
                "estado_coordenadas": "pendiente",
            },
            "entregada_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass


DIAS = {
    "lun": "Lunes",
    "mar": "Martes",
    "mie": "Miércoles",
    "jue": "Jueves",
    "vie": "Viernes",
    "sab": "Sábado",
    "dom": "Domingo",
}

FRANJAS = {
    "matutino": "Matutino",
    "vespertino": "Vespertino",
    "nocturno": "Nocturno",
    "madrugada": "Madrugada",
}

URGENCIAS = {
    "si": "Sí",
    "ocasional": "Solo en algunas ocasiones",
    "no": "No",
}

PROYECCION = {
    "ocasional": "Participación ocasional",
    "uno_tres_meses": "De uno a tres meses",
    "tres_seis_meses": "De tres a seis meses",
    "mas_seis_meses": "Más de seis meses",
    "continua": "Participación continua",
}

ETIQUETAS = {
    "inmediata": "Respuesta inmediata",
    "una_hora": "En al menos una hora",
    "tres_horas": "En al menos tres horas",
    "un_dia": "Con un día de anticipación",
    "automovil": "Automóvil",
    "motocicleta": "Motocicleta",
    "transporte_publico": "Transporte público",
    "bicicleta": "Bicicleta",
    "a_pie": "A pie",
    "depende_terceros": "Depende de otra persona",
    "perro": "Perros",
    "gato": "Gatos",
    "otro": "Otras especies",
    "pequeno": "Pequeños",
    "mediano": "Medianos",
    "grande": "Grandes",
    "sin_formacion": "Sin formación previa",
    "basico": "Conocimientos básicos",
    "formal": "Capacitación formal",
    "docil_estable": "Animales dóciles o estables",
    "cachorros_neonatos": "Cachorros o neonatos",
    "enfermedad_cuarentena": "Animales enfermos o en cuarentena",
    "reactivo_agresivo": "Animales reactivos o agresivos",
    "lesion_movilidad_reducida": "Animales lesionados o con movilidad reducida",
    "sin_experiencia": "Sin experiencia previa",
    "oral": "Medicamentos por vía oral",
    "topica": "Tratamientos tópicos",
    "inyectable_avanzado": "Inyecciones o tratamientos avanzados",
    "mascotas_propias": "Cuidado de mascotas propias",
    "rescate_independiente": "Rescates independientes",
    "casa_temporal": "Casa temporal",
    "refugio_asociacion": "Refugios u organizaciones",
    "clinica_veterinaria": "Clínicas veterinarias",
    "menos_1": "Menos de un año",
    "entre_1_3": "De uno a tres años",
    "mas_3": "Más de tres años",
    "transportadora_chica": "Transportadora pequeña",
    "transportadora_grande": "Transportadora grande",
    "jaula_contencion": "Jaula de contención",
    "correas_arneses": "Correas o arneses",
    "proteccion_vehiculo": "Protección para vehículo",
    "guantes_manejo": "Guantes de manejo",
    "sin_equipo": "Sin equipo propio",
    "ninguna": "Sin restricciones físicas",
    "evitar_carga_mayor_5kg": "Evitar cargas mayores a 5 kg",
    "evitar_carga_mayor_15kg": "Evitar cargas mayores a 15 kg",
    "evitar_escaleras": "Evitar escaleras",
    "evitar_caminatas_prolongadas": "Evitar caminatas prolongadas",
    "evitar_pie_prolongado": "Evitar permanecer de pie por mucho tiempo",
    "prefiere_comentarlo": "Prefiere comentarlo directamente",
    "whatsapp": "WhatsApp",
    "llamada": "Llamada telefónica",
    "plataforma": "Notificación en PawAlert",
    "salvar_animales": "Ayudar a animales en peligro",
    "apoyar_colectivos": "Respaldar a colectivos locales",
    "aplicar_conocimientos": "Aplicar conocimientos previos",
    "adquirir_experiencia": "Adquirir experiencia",
    "impacto_social": "Generar un impacto social positivo",
    "apoyar_recuperacion": "Acompañar la recuperación de animales",
}


def _etiqueta(valor):
    if valor is None:
        return None
    return ETIQUETAS.get(valor, valor)


def _etiquetas(valores) -> list[str]:
    return [_etiqueta(valor) for valor in (valores or [])]


def generar_resumen_expediente(perfil: dict, capacidades: dict) -> dict:
    """Crea una fotografía estructurada y legible de lo declarado.

    No asigna puntajes ni recomienda aprobar o rechazar. Las alertas solo
    señalan respuestas que la asociación debería revisar con atención.
    """
    disponibilidad = capacidades.get("disponibilidad") or {}
    alertas = []

    if perfil.get("acepta_visita") == "no":
        alertas.append({
            "clave": "no_acepta_visita",
            "nivel": "atencion",
            "texto": "Indicó que no acepta una visita al hogar.",
        })
    if perfil.get("autorizacion_propietario") == "no":
        alertas.append({
            "clave": "sin_autorizacion",
            "nivel": "atencion",
            "texto": "Indicó que no cuenta con autorización de la persona propietaria.",
        })
    if perfil.get("puede_aislar") == "no":
        alertas.append({
            "clave": "sin_aislamiento",
            "nivel": "informativa",
            "texto": "Indicó que no puede separar al animal si fuera necesario.",
        })
    if perfil.get("otros_animales") == "si" and perfil.get("animales_vacunados") == "no":
        alertas.append({
            "clave": "animales_sin_vacunas",
            "nivel": "atencion",
            "texto": "Reportó otros animales en casa sin vacunación vigente.",
        })
    if not perfil.get("video_recorrido_url"):
        alertas.append({
            "clave": "sin_video",
            "nivel": "atencion",
            "texto": "El expediente no contiene video del recorrido.",
        })

    return {
        "version": 1,
        "generado_at": datetime.now(timezone.utc).isoformat(),
        "ubicacion_hogar": {
            "municipio": perfil.get("municipio"),
            "estado": perfil.get("estado_ubicacion"),
            "tipo_vivienda": perfil.get("tipo_vivienda"),
            "subcategoria_vivienda": perfil.get("subcategoria_vivienda"),
        },
        "disponibilidad": {
            "dias": [DIAS.get(dia, dia) for dia in disponibilidad.get("dias", [])],
            "franjas": [
                FRANJAS.get(franja, franja)
                for franja in disponibilidad.get("franjas", [])
            ],
            "tiempo_reaccion": _etiqueta(capacidades.get("tiempo_reaccion")),
            "urgencias": URGENCIAS.get(
                capacidades.get("disponibilidad_urgencias")
            ),
            "casos_simultaneos": capacidades.get("max_casos_simultaneos"),
        },
        "movilidad": {
            "radio_max_km": capacidades.get("radio_max_km"),
            "medios_transporte": _etiquetas(capacidades.get("medios_transporte")),
            "vehiculo_apto_traslado": capacidades.get("vehiculo_apto_traslado", False),
            "tamanios_traslado": _etiquetas(capacidades.get("tamanios_traslado")),
        },
        "manejo_animal": {
            "especies": _etiquetas(capacidades.get("especies_manejo")),
            "otras_especies": _etiquetas(capacidades.get("otras_especies_manejo")),
            "tamanios": _etiquetas(capacidades.get("tamanios_manejo")),
            "primeros_auxilios": _etiqueta(capacidades.get("primeros_auxilios_nivel")),
            "experiencias_campo": _etiquetas(capacidades.get("experiencias_campo")),
            "tratamientos": _etiquetas(capacidades.get("vias_tratamiento")),
            "trayectoria": _etiquetas(capacidades.get("trayectoria_tipos")),
            "experiencia_anios": _etiqueta(capacidades.get("experiencia_anios")),
        },
        "equipo_y_bienestar": {
            "equipamiento": _etiquetas(capacidades.get("equipamiento")),
            "restricciones_fisicas": _etiquetas(
                capacidades.get("restricciones_fisicas")
            ),
        },
        "hogar": {
            "autorizacion_propietario": perfil.get("autorizacion_propietario"),
            "ubicacion_animal": perfil.get("ubicacion_animal"),
            "acepta_visita": perfil.get("acepta_visita"),
            "adultos": perfil.get("adultos_hogar"),
            "horas_solo": perfil.get("horas_solo"),
            "ninos": perfil.get("ninos_hogar"),
            "otros_animales": perfil.get("otros_animales"),
            "animales_vacunados": perfil.get("animales_vacunados"),
            "puede_aislar": perfil.get("puede_aislar"),
            "preferencia_especies": perfil.get("preferencia_especies") or [],
            "preferencia_tamanios": perfil.get("preferencia_tamanios") or [],
            "tiempo_resguardo": perfil.get("tiempo_resguardo"),
            "tiempo_resguardo_dias": perfil.get("tiempo_resguardo_dias"),
            "condiciones_declaradas": {
                "accesos_seguros": perfil.get("chk_accesos_seguros", False),
                "bardas_seguras": perfil.get("chk_bardas", False),
                "balcones_protegidos": perfil.get("chk_balcones", False),
                "espacio_suficiente": perfil.get("chk_espacio", False),
                "espacio_aislamiento": perfil.get("chk_aislamiento", False),
                "acepta_cuarentena": perfil.get("chk_cuarentena", False),
                "no_entrega_terceros": perfil.get("chk_no_entregar", False),
            },
            "horarios_visita": perfil.get("horarios_visita") or [],
        },
        "contacto_y_compromisos": {
            "canal_preferido": _etiqueta(capacidades.get("canal_contacto")),
            "compromiso_comunicacion": capacidades.get(
                "compromiso_comunicacion", False
            ),
            "compromiso_notificar": capacidades.get(
                "compromiso_notificar", False
            ),
            "proyeccion": PROYECCION.get(
                capacidades.get("proyeccion_colaboracion")
            ),
            "motivaciones": _etiquetas(capacidades.get("motivaciones")),
            "comentarios": capacidades.get("comentarios_adicionales"),
        },
        "evidencias": {
            "identificacion_recibida": bool(perfil.get("identificacion_url")),
            "video_recibido": bool(perfil.get("video_recorrido_url")),
            "consentimiento": perfil.get("consentimiento_evidencia", False),
        },
        "alertas": alertas,
    }


def _obtener_expediente(voluntario_id: str) -> tuple[dict, dict]:
    perfil = supabase_admin.table("perfil_casa_temporal").select("*").eq(
        "voluntario_id", voluntario_id
    ).limit(1).execute()
    if not perfil.data:
        raise HTTPException(
            status_code=422,
            detail="Primero debes completar la información de tu casa temporal",
        )

    capacidades = supabase_admin.table("capacidades").select("*").eq(
        "voluntario_id", voluntario_id
    ).limit(1).execute()
    if not capacidades.data:
        raise HTTPException(
            status_code=422,
            detail="Primero debes completar tu formulario de capacidades",
        )

    return perfil.data[0], capacidades.data[0]


def _obtener_asociacion_mas_cercana(perfil: dict) -> dict:
    latitud = perfil.get("latitud")
    longitud = perfil.get("longitud")
    if latitud is None or longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La casa temporal no tiene una ubicación válida",
        )

    resultado = supabase_admin.rpc(
        "asociacion_mas_cercana_hogar",
        {"hogar_lat": latitud, "hogar_lng": longitud},
    ).execute()
    if not resultado.data:
        raise HTTPException(
            status_code=409,
            detail=(
                "Por ahora no encontramos una asociación disponible para revisar "
                "tu postulación"
            ),
        )
    return resultado.data[0]


async def finalizar_postulacion_externa(voluntario_id: str) -> dict:
    """Dirige el expediente completo a la asociación más cercana.

    Es idempotente: si el flujo ya creó su verificación, repetir la petición
    devuelve la misma asignación sin duplicar postulaciones.
    """
    perfil, capacidades = _obtener_expediente(voluntario_id)

    pendiente = supabase_admin.table("postulaciones").select(
        "id, asociacion_id, numero_intento, tipo"
    ).eq("voluntario_id", voluntario_id).eq(
        "estado", "pendiente"
    ).limit(1).execute()

    if pendiente.data:
        postulacion = pendiente.data[0]
        if postulacion.get("tipo") != "externo":
            raise HTTPException(
                status_code=409,
                detail="Ya tienes otra postulación pendiente",
            )

        existente = supabase_admin.table("verificaciones_hogar").select(
            "id, postulacion_id, asociacion_id, estado, modalidad, "
            "distancia_asociacion_km, asociaciones(nombre)"
        ).eq("postulacion_id", postulacion["id"]).limit(1).execute()
        if existente.data:
            verificacion = existente.data[0]
            return {
                "postulacion_id": verificacion["postulacion_id"],
                "verificacion_id": verificacion["id"],
                "asociacion_id": verificacion["asociacion_id"],
                "asociacion_nombre": (
                    verificacion.get("asociaciones") or {}
                ).get("nombre"),
                "distancia_asociacion_km": verificacion.get(
                    "distancia_asociacion_km"
                ),
                "estado_verificacion": verificacion["estado"],
                "modalidad": verificacion["modalidad"],
                "ya_existia": True,
            }

    asociacion_cercana = _obtener_asociacion_mas_cercana(perfil)
    resumen = generar_resumen_expediente(perfil, capacidades)

    if pendiente.data:
        asociacion_id = postulacion["asociacion_id"]
        distancia_asociacion_km = (
            float(asociacion_cercana["distancia_km"])
            if asociacion_id == asociacion_cercana["id"]
            else None
        )
        if asociacion_id == asociacion_cercana["id"]:
            asociacion_nombre = asociacion_cercana["nombre"]
        else:
            asociacion_existente = supabase_admin.table("asociaciones").select(
                "nombre"
            ).eq("id", asociacion_id).limit(1).execute()
            asociacion_nombre = (
                asociacion_existente.data[0]["nombre"]
                if asociacion_existente.data
                else None
            )
    else:
        ultima = supabase_admin.table("postulaciones").select(
            "numero_intento"
        ).eq("voluntario_id", voluntario_id).order(
            "numero_intento", desc=True
        ).limit(1).execute()
        numero_intento = (
            int(ultima.data[0]["numero_intento"]) + 1
            if ultima.data
            else 1
        )
        creada = supabase_admin.table("postulaciones").insert({
            "voluntario_id": voluntario_id,
            "asociacion_id": asociacion_cercana["id"],
            "tipo": "externo",
            "estado": "pendiente",
            "numero_intento": numero_intento,
        }).execute()
        postulacion = creada.data[0]
        asociacion_id = asociacion_cercana["id"]
        asociacion_nombre = asociacion_cercana["nombre"]
        distancia_asociacion_km = float(asociacion_cercana["distancia_km"])

    verificacion_creada = supabase_admin.table("verificaciones_hogar").insert({
        "postulacion_id": postulacion["id"],
        "perfil_casa_temporal_id": perfil["id"],
        "asociacion_id": asociacion_id,
        "voluntario_postulante_id": voluntario_id,
        "estado": "pendiente_revision",
        "modalidad": "por_definir",
        "distancia_asociacion_km": distancia_asociacion_km,
        "resumen_expediente": resumen,
    }).execute()
    verificacion_id = verificacion_creada.data[0]["id"]
    _crear_ronda_inicial(verificacion_id, perfil)
    _registrar_evento_verificacion(
        verificacion_id,
        "verificacion_creada",
        "Se creó el expediente de verificación del hogar.",
        datos={"modalidad": "por_definir"},
    )

    supabase_admin.table("voluntarios").update({
        "estado": "postulacion_pendiente",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", voluntario_id).execute()

    return {
        "postulacion_id": postulacion["id"],
        "verificacion_id": verificacion_id,
        "asociacion_id": asociacion_id,
        "asociacion_nombre": asociacion_nombre,
        "distancia_asociacion_km": distancia_asociacion_km,
        "estado_verificacion": "pendiente_revision",
        "modalidad": "por_definir",
        "ya_existia": False,
    }


def obtener_verificacion_postulacion(
    postulacion_id: str,
    asociacion_id: str,
) -> dict:
    resultado = supabase_admin.table("verificaciones_hogar").select(
        "id, postulacion_id, perfil_casa_temporal_id, asociacion_id, "
        "voluntario_postulante_id, estado, modalidad, "
        "distancia_asociacion_km, resumen_expediente, analisis_video, "
        "analisis_video_estado, analisis_video_modelo, analisis_video_error, "
        "analisis_video_iniciado_at, analisis_video_procesado_at, "
        "estado_coordenadas, distancia_coordenadas_m, coordenadas_fuente, "
        "coordenadas_detalle, notas_asociacion, motivo_resultado, "
        "checklist_remoto, checklist_remoto_completado_at, "
        "modalidad_definida_por, modalidad_definida_at, "
        "resuelta_por_usuario_id, "
        "created_at, updated_at, resuelta_at"
    ).eq("postulacion_id", postulacion_id).eq(
        "asociacion_id", asociacion_id
    ).limit(1).execute()

    if not resultado.data:
        raise HTTPException(
            status_code=404,
            detail="No encontramos la verificación de esta postulación",
        )

    verificacion = resultado.data[0]
    perfil = supabase_admin.table("perfil_casa_temporal").select(
        "latitud, longitud, calle, numero, colonia, municipio, "
        "estado_ubicacion, referencia, identificacion_url, "
        "video_recorrido_url, foto_accesos_url, foto_bardas_url, "
        "foto_balcones_url, foto_espacio_url, horarios_visita"
    ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
    verificacion["hogar"] = perfil.data[0] if perfil.data else None

    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificador_voluntario_id, distancia_km, estado, propuesta_at, "
        "respondida_at, visita_programada_at, motivo_rechazo, "
        "horario_propuesto_at, horario_propuesto_por, horario_estado, "
        "horario_respondido_at, motivo_reagenda, check_in_at, check_out_at, "
        "check_in_latitud, check_in_longitud, check_in_distancia_m, "
        "checklist, notas_visita, resultado_visita, "
        "motivo_resultado_visita, resultado_at"
    ).eq("verificacion_hogar_id", verificacion["id"]).order(
        "propuesta_at", desc=True
    ).limit(1).execute()
    if asignacion.data:
        actual = asignacion.data[0]
        actual["verificador_nombre"] = _nombre_voluntario(
            actual["verificador_voluntario_id"]
        )
        verificacion["asignacion_actual"] = actual
    else:
        verificacion["asignacion_actual"] = None

    # La lista no debe depender del estado temporal del frontend. Si la
    # asociación cierra y vuelve a abrir el expediente, reconstruimos los
    # candidatos elegibles a partir de la función de matching.
    if verificacion["estado"] in ("pendiente_asignacion", "reagendar"):
        verificacion["candidatos"] = supabase_admin.rpc(
            "candidatos_verificacion_hogar",
            {"p_verificacion_hogar_id": verificacion["id"]},
        ).execute().data or []
    else:
        verificacion["candidatos"] = []

    try:
        rondas = supabase_admin.table(
            "rondas_evidencia_verificacion"
        ).select("*").eq(
            "verificacion_hogar_id", verificacion["id"]
        ).order("numero", desc=True).execute()
        verificacion["rondas_evidencia"] = rondas.data or []
    except Exception:
        verificacion["rondas_evidencia"] = []

    try:
        bitacora = supabase_admin.table(
            "bitacora_verificacion_hogar"
        ).select(
            "id, tipo_evento, actor_usuario_id, actor_tipo, descripcion, "
            "datos, created_at"
        ).eq(
            "verificacion_hogar_id", verificacion["id"]
        ).order("created_at", desc=True).execute()
        eventos = bitacora.data or []
        nombres_actor = {}
        for evento in eventos:
            actor_id = evento.get("actor_usuario_id")
            if actor_id and actor_id not in nombres_actor:
                nombres_actor[actor_id] = _nombre_usuario(actor_id)
            evento["actor_nombre"] = nombres_actor.get(actor_id)
        verificacion["bitacora"] = eventos
    except Exception:
        verificacion["bitacora"] = []
    if verificacion.get("resuelta_por_usuario_id"):
        verificacion["resuelta_por_nombre"] = _nombre_usuario(
            verificacion["resuelta_por_usuario_id"]
        )
    return verificacion


def seleccionar_modalidad_verificacion(
    verificacion_id: str,
    asociacion_id: str,
    usuario_staff_id: str,
    modalidad: str,
) -> dict:
    """Permite que la asociación elija revisión presencial o remota."""
    if modalidad not in ("presencial", "remota"):
        raise HTTPException(status_code=422, detail="Modalidad no válida")

    consulta = supabase_admin.table("verificaciones_hogar").select(
        "id, estado, modalidad"
    ).eq("id", verificacion_id).eq(
        "asociacion_id", asociacion_id
    ).limit(1).execute()
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")

    verificacion = consulta.data[0]
    if verificacion["estado"] not in (
        "pendiente_revision",
        "pendiente_asignacion",
        "reagendar",
        "revision_remota",
    ):
        raise HTTPException(
            status_code=409,
            detail="La modalidad ya no puede cambiarse en esta etapa",
        )

    activa = supabase_admin.table("asignaciones_verificacion_hogar").select(
        "id"
    ).eq("verificacion_hogar_id", verificacion_id).in_(
        "estado", ["propuesta", "aceptada"]
    ).execute()
    if activa.data:
        raise HTTPException(
            status_code=409,
            detail="Cancela primero la propuesta o visita activa",
        )

    ahora = datetime.now(timezone.utc).isoformat()
    estado = "revision_remota" if modalidad == "remota" else "pendiente_asignacion"
    supabase_admin.table("verificaciones_hogar").update({
        "modalidad": modalidad,
        "estado": estado,
        "modalidad_definida_por": usuario_staff_id,
        "modalidad_definida_at": ahora,
        "updated_at": ahora,
    }).eq("id", verificacion_id).execute()
    _registrar_evento_verificacion(
        verificacion_id,
        "modalidad_seleccionada",
        f"La asociación seleccionó la modalidad {modalidad}.",
        actor_usuario_id=usuario_staff_id,
        actor_tipo="asociacion",
        datos={
            "modalidad_anterior": verificacion.get("modalidad"),
            "modalidad": modalidad,
        },
    )
    return {
        "verificacion_id": verificacion_id,
        "estado": estado,
        "modalidad": modalidad,
        "mensaje": (
            "El expediente está listo para revisión remota."
            if modalidad == "remota"
            else "Ya puedes buscar una persona verificadora cercana."
        ),
    }


def preparar_verificacion_hogar(
    postulacion_id: str,
    asociacion_id: str,
) -> dict:
    """Busca verificadores elegibles después de que la asociación revisa.

    Si no existe nadie dentro de su propio radio declarado y del máximo
    absoluto de 30 km, cambia el expediente a revisión remota.
    """
    verificacion = obtener_verificacion_postulacion(
        postulacion_id,
        asociacion_id,
    )

    if verificacion["estado"] not in (
        "pendiente_revision",
        "pendiente_asignacion",
        "reagendar",
    ):
        raise HTTPException(
            status_code=409,
            detail="La verificación no puede prepararse en su estado actual",
        )

    candidatos = supabase_admin.rpc(
        "candidatos_verificacion_hogar",
        {"p_verificacion_hogar_id": verificacion["id"]},
    ).execute().data or []

    if not candidatos:
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "revision_remota",
            "modalidad": "remota",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", verificacion["id"]).execute()
        _registrar_evento_verificacion(
            verificacion["id"],
            "modalidad_remota_automatica",
            "No se encontraron verificadores elegibles; se activó la revisión remota.",
            datos={"radio_maximo_km": 30},
        )
        return {
            "verificacion_id": verificacion["id"],
            "estado": "revision_remota",
            "modalidad": "remota",
            "candidatos": [],
            "mensaje": (
                "No hay verificadores disponibles dentro de 30 km. "
                "El expediente continuará con revisión remota."
            ),
        }

    supabase_admin.table("verificaciones_hogar").update({
        "estado": "pendiente_asignacion",
        "modalidad": "presencial",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", verificacion["id"]).execute()
    _registrar_evento_verificacion(
        verificacion["id"],
        "candidatos_encontrados",
        "Se encontraron personas verificadoras para una visita presencial.",
        datos={"cantidad": len(candidatos)},
    )

    return {
        "verificacion_id": verificacion["id"],
        "estado": "pendiente_asignacion",
        "modalidad": "presencial",
        "candidatos": candidatos,
        "mensaje": "Encontramos personas voluntarias cercanas para realizar la visita.",
    }


def asignar_verificador_hogar(
    verificacion_id: str,
    verificador_voluntario_id: str,
    asociacion_id: str,
    usuario_staff_id: str | None = None,
) -> dict:
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, asociacion_id, estado"
    ).eq("id", verificacion_id).eq(
        "asociacion_id", asociacion_id
    ).limit(1).execute()
    if not verificacion.data:
        raise HTTPException(
            status_code=404,
            detail="Verificación no encontrada",
        )

    if verificacion.data[0]["estado"] not in (
        "pendiente_asignacion",
        "reagendar",
    ):
        raise HTTPException(
            status_code=409,
            detail="La verificación no está lista para asignarse",
        )

    candidatos = supabase_admin.rpc(
        "candidatos_verificacion_hogar",
        {"p_verificacion_hogar_id": verificacion_id},
    ).execute().data or []
    candidato = next(
        (
            item
            for item in candidatos
            if item["voluntario_id"] == verificador_voluntario_id
        ),
        None,
    )
    if not candidato:
        raise HTTPException(
            status_code=422,
            detail=(
                "La persona seleccionada no está disponible o se encuentra "
                "fuera de su radio de desplazamiento"
            ),
        )

    activa = supabase_admin.table("asignaciones_verificacion_hogar").select(
        "id"
    ).eq("verificacion_hogar_id", verificacion_id).in_(
        "estado", ["propuesta", "aceptada"]
    ).limit(1).execute()
    if activa.data:
        raise HTTPException(
            status_code=409,
            detail="Esta verificación ya tiene una propuesta activa",
        )

    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).insert({
        "verificacion_hogar_id": verificacion_id,
        "verificador_voluntario_id": verificador_voluntario_id,
        "distancia_km": float(candidato["distancia_km"]),
        "tramo_distancia": candidato["tramo_distancia"],
        "estado": "propuesta",
    }).execute()

    supabase_admin.table("verificaciones_hogar").update({
        "estado": "visita_propuesta",
        "modalidad": "presencial",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", verificacion_id).execute()
    _registrar_evento_verificacion(
        verificacion_id,
        "propuesta_visita_enviada",
        "La asociación envió una propuesta de visita presencial.",
        actor_usuario_id=usuario_staff_id,
        actor_tipo="asociacion",
        datos={
            "asignacion_id": asignacion.data[0]["id"],
            "verificador_voluntario_id": verificador_voluntario_id,
            "distancia_km": float(candidato["distancia_km"]),
        },
    )

    return {
        "asignacion_id": asignacion.data[0]["id"],
        "verificacion_id": verificacion_id,
        "estado": "visita_propuesta",
        "verificador": candidato,
        "mensaje": "La propuesta de visita fue enviada al voluntario.",
    }


def resolver_verificacion_remota(
    verificacion_id: str,
    asociacion_id: str,
    decision: str,
    motivo: str | None = None,
    tipos_evidencia: list[str] | None = None,
    usuario_staff_id: str | None = None,
) -> dict:
    """Cierra o devuelve a corrección una revisión remota.

    Gemini y los metadatos solo aportan evidencia. Esta transición siempre
    parte de una decisión explícita de la asociación.
    """
    resultado = supabase_admin.table("verificaciones_hogar").select(
        "id, postulacion_id, voluntario_postulante_id, asociacion_id, "
        "perfil_casa_temporal_id, estado, modalidad, analisis_video, "
        "analisis_video_estado, analisis_video_modelo, analisis_video_error, "
        "estado_coordenadas, distancia_coordenadas_m, checklist_remoto, "
        "checklist_remoto_completado_at"
    ).eq("id", verificacion_id).eq(
        "asociacion_id", asociacion_id
    ).limit(1).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")

    verificacion = resultado.data[0]
    if (
        verificacion["estado"] != "revision_remota"
        or verificacion["modalidad"] != "remota"
    ):
        raise HTTPException(
            status_code=409,
            detail="Esta verificación no está lista para una decisión remota",
        )

    postulacion = supabase_admin.table("postulaciones").select(
        "id, estado"
    ).eq("id", verificacion["postulacion_id"]).limit(1).execute()
    if not postulacion.data or postulacion.data[0]["estado"] != "pendiente":
        raise HTTPException(
            status_code=409,
            detail="La postulación ya fue resuelta",
        )

    motivo_limpio = (motivo or "").strip()
    if decision in ("solicitar_evidencia", "rechazar") and not motivo_limpio:
        raise HTTPException(
            status_code=422,
            detail="Explica brevemente el motivo para orientar al postulante",
        )

    ahora = datetime.now(timezone.utc).isoformat()
    if decision == "solicitar_evidencia":
        tipos = list(dict.fromkeys(tipos_evidencia or ["video"]))
        if any(tipo not in TIPOS_EVIDENCIA for tipo in tipos):
            raise HTTPException(status_code=422, detail="Tipo de evidencia no válido")

        perfil = supabase_admin.table("perfil_casa_temporal").select(
            "identificacion_url, video_recorrido_url"
        ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
        perfil_actual = perfil.data[0] if perfil.data else {}
        ultima = supabase_admin.table(
            "rondas_evidencia_verificacion"
        ).select("numero").eq(
            "verificacion_hogar_id", verificacion_id
        ).order("numero", desc=True).limit(1).execute()
        numero = int(ultima.data[0]["numero"]) + 1 if ultima.data else 1
        supabase_admin.table("rondas_evidencia_verificacion").insert({
            "verificacion_hogar_id": verificacion_id,
            "numero": numero,
            "estado": "solicitada",
            "tipos_solicitados": tipos,
            "instrucciones": motivo_limpio,
            "solicitada_por_usuario_id": usuario_staff_id,
            "evidencia_anterior": _snapshot_evidencia(
                verificacion,
                perfil_actual,
            ),
            "solicitada_at": ahora,
        }).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "requiere_cambios",
            "motivo_resultado": motivo_limpio,
            "resuelta_at": None,
            "updated_at": ahora,
        }).eq("id", verificacion_id).execute()
        _registrar_evento_verificacion(
            verificacion_id,
            "evidencia_solicitada",
            "La asociación solicitó correcciones al expediente.",
            actor_usuario_id=usuario_staff_id,
            actor_tipo="asociacion",
            datos={"ronda": numero, "tipos": tipos},
        )
        return {
            "estado": "requiere_cambios",
            "ronda": numero,
            "tipos_evidencia": tipos,
            "mensaje": "Se solicitaron correcciones a la persona postulante.",
        }

    voluntario_id = verificacion["voluntario_postulante_id"]
    if decision == "rechazar":
        supabase_admin.table("postulaciones").update({
            "estado": "rechazada",
            "motivo_rechazo": motivo_limpio,
            "resuelta_at": ahora,
        }).eq("id", verificacion["postulacion_id"]).execute()
        supabase_admin.table("voluntarios").update({
            "estado": "rechazado",
            "updated_at": ahora,
        }).eq("id", voluntario_id).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "rechazada",
            "motivo_resultado": motivo_limpio,
            "resuelta_por_usuario_id": usuario_staff_id,
            "resuelta_at": ahora,
            "updated_at": ahora,
        }).eq("id", verificacion_id).execute()
        _registrar_evento_verificacion(
            verificacion_id,
            "verificacion_rechazada",
            "La asociación rechazó la casa temporal en revisión remota.",
            actor_usuario_id=usuario_staff_id,
            actor_tipo="asociacion",
            datos={"motivo": motivo_limpio},
        )
        return {
            "estado": "rechazada",
            "mensaje": "La casa temporal no fue aprobada.",
        }

    if decision != "aprobar":
        raise HTTPException(status_code=422, detail="Decisión no válida")

    perfil = supabase_admin.table("perfil_casa_temporal").select(
        "video_recorrido_url"
    ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
    if not perfil.data or not perfil.data[0].get("video_recorrido_url"):
        raise HTTPException(
            status_code=409,
            detail="No se puede aprobar sin un video del hogar",
        )
    if verificacion.get("analisis_video_estado") != "completado":
        raise HTTPException(
            status_code=409,
            detail=(
                "Espera a que termine correctamente el análisis del video "
                "antes de aprobar"
            ),
        )
    checklist = verificacion.get("checklist_remoto") or {}
    if (
        not CHECKLIST_REMOTO_CAMPOS.issubset(checklist.keys())
        or not verificacion.get("checklist_remoto_completado_at")
    ):
        raise HTTPException(
            status_code=409,
            detail="Completa el checklist remoto antes de aprobar",
        )

    voluntario = supabase_admin.table("voluntarios").select(
        "id, usuario_id"
    ).eq("id", voluntario_id).limit(1).execute()
    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")

    rol = supabase_admin.table("roles").select("id").eq(
        "nombre", "voluntario_externo"
    ).limit(1).execute()
    if not rol.data:
        raise HTTPException(
            status_code=500,
            detail="No está configurado el rol de voluntario externo",
        )

    supabase_admin.table("voluntarios").update({
        "estado": "activo_nivel_2",
        "asociacion_id": asociacion_id,
        "updated_at": ahora,
    }).eq("id", voluntario_id).execute()
    supabase_admin.table("usuarios").update({
        "rol_id": rol.data[0]["id"],
        "asociacion_id": asociacion_id,
        "updated_at": ahora,
    }).eq("id", voluntario.data[0]["usuario_id"]).execute()
    supabase_admin.table("postulaciones").update({
        "estado": "aceptada",
        "motivo_rechazo": None,
        "resuelta_at": ahora,
    }).eq("id", verificacion["postulacion_id"]).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "aprobada",
        "motivo_resultado": motivo_limpio or None,
        "resuelta_por_usuario_id": usuario_staff_id,
        "resuelta_at": ahora,
        "updated_at": ahora,
    }).eq("id", verificacion_id).execute()
    _registrar_evento_verificacion(
        verificacion_id,
        "verificacion_aprobada",
        "La asociación aprobó la casa temporal en revisión remota.",
        actor_usuario_id=usuario_staff_id,
        actor_tipo="asociacion",
    )
    return {
        "estado": "aprobada",
        "nivel_voluntario": "activo_nivel_2",
        "mensaje": "La casa temporal fue aprobada.",
    }


def guardar_checklist_remoto(
    verificacion_id: str,
    asociacion_id: str,
    usuario_staff_id: str,
    checklist: dict,
) -> dict:
    consulta = supabase_admin.table("verificaciones_hogar").select(
        "id, estado, modalidad"
    ).eq("id", verificacion_id).eq(
        "asociacion_id", asociacion_id
    ).limit(1).execute()
    if not consulta.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")
    verificacion = consulta.data[0]
    if (
        verificacion["modalidad"] != "remota"
        or verificacion["estado"] != "revision_remota"
    ):
        raise HTTPException(
            status_code=409,
            detail="El checklist sólo está disponible durante la revisión remota",
        )

    evidencia = {
        clave: checklist.get(clave)
        for clave in CHECKLIST_REMOTO_CAMPOS
    }
    notas = (checklist.get("notas") or "").strip()
    evidencia["notas"] = notas or None
    evidencia["completado_por_usuario_id"] = usuario_staff_id
    ahora = datetime.now(timezone.utc).isoformat()
    evidencia["completado_at"] = ahora
    supabase_admin.table("verificaciones_hogar").update({
        "checklist_remoto": evidencia,
        "checklist_remoto_completado_at": ahora,
        "updated_at": ahora,
    }).eq("id", verificacion_id).execute()
    _registrar_evento_verificacion(
        verificacion_id,
        "checklist_remoto_completado",
        "Se completó el checklist de revisión remota.",
        actor_usuario_id=usuario_staff_id,
        actor_tipo="asociacion",
    )
    return {
        "checklist_remoto": evidencia,
        "checklist_remoto_completado_at": ahora,
        "mensaje": "Checklist remoto guardado.",
    }


async def enviar_evidencia_solicitada(
    voluntario_id: str,
    *,
    video_file=None,
    identificacion_file=None,
    fotos_files=None,
    correcciones: dict | None = None,
) -> dict:
    """Entrega la ronda activa sin destruir las evidencias anteriores."""
    postulacion = supabase_admin.table("postulaciones").select(
        "id"
    ).eq("voluntario_id", voluntario_id).eq(
        "tipo", "externo"
    ).eq("estado", "pendiente").order(
        "numero_intento", desc=True
    ).limit(1).execute()
    if not postulacion.data:
        raise HTTPException(
            status_code=404,
            detail="No tienes una postulación externa pendiente",
        )

    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, perfil_casa_temporal_id, estado, modalidad, analisis_video, "
        "analisis_video_estado, analisis_video_modelo, analisis_video_error, "
        "estado_coordenadas, distancia_coordenadas_m"
    ).eq("postulacion_id", postulacion.data[0]["id"]).limit(1).execute()
    if not verificacion.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")
    registro = verificacion.data[0]
    if registro["estado"] != "requiere_cambios":
        raise HTTPException(
            status_code=409,
            detail="La asociación no ha solicitado correcciones",
        )

    ronda = supabase_admin.table("rondas_evidencia_verificacion").select(
        "*"
    ).eq("verificacion_hogar_id", registro["id"]).eq(
        "estado", "solicitada"
    ).order("numero", desc=True).limit(1).execute()
    if not ronda.data:
        raise HTTPException(status_code=409, detail="No hay una ronda pendiente")
    ronda_actual = ronda.data[0]
    solicitados = set(ronda_actual.get("tipos_solicitados") or [])
    correcciones = correcciones or {}

    if not any((
        video_file,
        identificacion_file,
        fotos_files,
        correcciones.get("direccion"),
        correcciones.get("formulario"),
    )):
        raise HTTPException(
            status_code=422,
            detail="Adjunta o corrige al menos uno de los elementos solicitados",
        )
    if video_file and not (video_file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="Selecciona un video válido")
    if identificacion_file and not (
        identificacion_file.content_type or ""
    ).startswith("image/"):
        raise HTTPException(status_code=422, detail="Selecciona una imagen válida")

    perfil_consulta = supabase_admin.table("perfil_casa_temporal").select(
        "identificacion_url, video_recorrido_url"
    ).eq("id", registro["perfil_casa_temporal_id"]).limit(1).execute()
    perfil_actual = perfil_consulta.data[0] if perfil_consulta.data else {}
    cambios_perfil = {}
    evidencia_entregada = dict(
        ronda_actual.get("evidencia_entregada") or {}
    )
    reanalizar_video = False

    if video_file:
        video_url = await storage_service.subir_foto(
            video_file,
            "videos_recorridos",
        )
        cambios_perfil["video_recorrido_url"] = video_url
        evidencia_entregada["video_url"] = video_url
        reanalizar_video = True

    if identificacion_file:
        identificacion_url = await storage_service.subir_foto(
            identificacion_file,
            "identificaciones",
        )
        cambios_perfil["identificacion_url"] = identificacion_url
        evidencia_entregada["identificacion_url"] = identificacion_url

    fotos_urls = []
    for foto in fotos_files or []:
        if not (foto.content_type or "").startswith("image/"):
            raise HTTPException(
                status_code=422,
                detail="Todas las fotos deben ser archivos de imagen",
            )
        fotos_urls.append(
            await storage_service.subir_foto(foto, "evidencias_hogar")
        )
    if fotos_urls:
        evidencia_entregada["fotos_urls"] = fotos_urls

    direccion_permitida = {
        "latitud",
        "longitud",
        "calle",
        "numero",
        "colonia",
        "municipio",
        "estado_ubicacion",
        "referencia",
    }
    formulario_permitido = {
        "tipo_vivienda",
        "subcategoria_vivienda",
        "vivienda_otra_desc",
        "autorizacion_propietario",
        "ubicacion_animal",
        "acepta_visita",
        "adultos_hogar",
        "horas_solo",
        "ninos_hogar",
        "otros_animales",
        "animales_vacunados",
        "puede_aislar",
        "preferencia_especies",
        "preferencia_tamanios",
        "tiempo_resguardo",
        "tiempo_resguardo_dias",
        "chk_accesos_seguros",
        "chk_bardas",
        "chk_balcones",
        "chk_espacio",
        "chk_aislamiento",
        "chk_cuarentena",
        "chk_no_entregar",
    }
    direccion = correcciones.get("direccion") or {}
    formulario = correcciones.get("formulario") or {}
    cambios_perfil.update({
        clave: valor
        for clave, valor in direccion.items()
        if clave in direccion_permitida
    })
    cambios_perfil.update({
        clave: valor
        for clave, valor in formulario.items()
        if clave in formulario_permitido
    })
    if direccion:
        evidencia_entregada["direccion"] = direccion
    if formulario:
        evidencia_entregada["formulario"] = formulario

    ahora = datetime.now(timezone.utc).isoformat()
    cambios_perfil["updated_at"] = ahora
    supabase_admin.table("perfil_casa_temporal").update(
        cambios_perfil
    ).eq("id", registro["perfil_casa_temporal_id"]).execute()

    tipos_entregados = {
        tipo
        for tipo, clave in (
            ("video", "video_url"),
            ("identificacion", "identificacion_url"),
            ("fotos", "fotos_urls"),
            ("direccion", "direccion"),
            ("formulario", "formulario"),
        )
        if evidencia_entregada.get(clave)
    }
    pendientes = solicitados - tipos_entregados
    cambio_verificacion = {
        "estado": "requiere_cambios" if pendientes else "revision_remota",
        "motivo_resultado": (
            ronda_actual.get("instrucciones") if pendientes else None
        ),
        "updated_at": ahora,
    }
    if reanalizar_video:
        cambio_verificacion.update({
            "analisis_video": None,
            "analisis_video_estado": "pendiente",
            "analisis_video_modelo": None,
            "analisis_video_error": None,
            "analisis_video_iniciado_at": None,
            "analisis_video_procesado_at": None,
            "estado_coordenadas": "pendiente",
            "coordenadas_video_lat": None,
            "coordenadas_video_lng": None,
            "distancia_coordenadas_m": None,
            "coordenadas_fuente": None,
            "coordenadas_detalle": {},
            "checklist_remoto": {},
            "checklist_remoto_completado_at": None,
        })
    supabase_admin.table("verificaciones_hogar").update(
        cambio_verificacion
    ).eq("id", registro["id"]).execute()
    supabase_admin.table("rondas_evidencia_verificacion").update({
        "estado": "solicitada" if pendientes else "entregada",
        "evidencia_entregada": evidencia_entregada,
        "entregada_at": None if pendientes else ahora,
    }).eq("id", ronda_actual["id"]).execute()
    _registrar_evento_verificacion(
        registro["id"],
        "evidencia_entregada",
        "La persona postulante respondió la solicitud de correcciones.",
        actor_tipo="postulante",
        datos={
            "ronda": ronda_actual["numero"],
            "tipos_entregados": sorted(tipos_entregados),
            "tipos_pendientes": sorted(pendientes),
        },
    )
    return {
        "verificacion_id": registro["id"],
        "estado": cambio_verificacion["estado"],
        "ronda": ronda_actual["numero"],
        "reanalisar_video": reanalizar_video,
        "tipos_pendientes": sorted(pendientes),
        "mensaje": (
            "Las correcciones fueron enviadas a revisión."
            if not pendientes
            else "Guardamos el avance. Aún faltan elementos por actualizar."
        ),
    }


async def reemplazar_video_solicitado(
    voluntario_id: str,
    video_file,
) -> dict:
    """Compatibilidad con clientes anteriores que sólo envían un video."""
    return await enviar_evidencia_solicitada(
        voluntario_id,
        video_file=video_file,
    )


def registrar_actualizacion_formulario_solicitada(
    voluntario_id: str,
    perfil: dict,
    *,
    identificacion_actualizada: bool = False,
    video_actualizado: bool = False,
) -> dict | None:
    """Vincula la edición del formulario con la ronda pendiente, si existe."""
    postulacion = supabase_admin.table("postulaciones").select("id").eq(
        "voluntario_id", voluntario_id
    ).eq("tipo", "externo").eq("estado", "pendiente").order(
        "numero_intento", desc=True
    ).limit(1).execute()
    if not postulacion.data:
        return None
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, estado"
    ).eq("postulacion_id", postulacion.data[0]["id"]).limit(1).execute()
    if not verificacion.data or verificacion.data[0]["estado"] != "requiere_cambios":
        return None
    verificacion_id = verificacion.data[0]["id"]
    ronda = supabase_admin.table("rondas_evidencia_verificacion").select(
        "*"
    ).eq("verificacion_hogar_id", verificacion_id).eq(
        "estado", "solicitada"
    ).order("numero", desc=True).limit(1).execute()
    if not ronda.data:
        return None

    actual = ronda.data[0]
    solicitados = set(actual.get("tipos_solicitados") or [])
    evidencia = dict(actual.get("evidencia_entregada") or {})
    if "direccion" in solicitados:
        evidencia["direccion"] = {
            clave: perfil.get(clave)
            for clave in (
                "latitud", "longitud", "calle", "numero", "colonia",
                "municipio", "estado_ubicacion", "referencia",
            )
        }
    if "formulario" in solicitados:
        evidencia["formulario"] = {
            clave: perfil.get(clave)
            for clave in (
                "tipo_vivienda", "subcategoria_vivienda",
                "autorizacion_propietario", "ubicacion_animal",
                "acepta_visita", "adultos_hogar", "horas_solo",
                "ninos_hogar", "otros_animales", "animales_vacunados",
                "puede_aislar", "preferencia_especies",
                "preferencia_tamanios", "tiempo_resguardo",
            )
        }
    if identificacion_actualizada and "identificacion" in solicitados:
        evidencia["identificacion_url"] = perfil.get("identificacion_url")
    if video_actualizado and "video" in solicitados:
        evidencia["video_url"] = perfil.get("video_recorrido_url")

    entregados = {
        tipo
        for tipo, clave in (
            ("video", "video_url"),
            ("identificacion", "identificacion_url"),
            ("fotos", "fotos_urls"),
            ("direccion", "direccion"),
            ("formulario", "formulario"),
        )
        if evidencia.get(clave)
    }
    pendientes = solicitados - entregados
    ahora = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("rondas_evidencia_verificacion").update({
        "estado": "solicitada" if pendientes else "entregada",
        "evidencia_entregada": evidencia,
        "entregada_at": None if pendientes else ahora,
    }).eq("id", actual["id"]).execute()
    cambio = {
        "estado": "requiere_cambios" if pendientes else "revision_remota",
        "motivo_resultado": (
            actual.get("instrucciones") if pendientes else None
        ),
        "updated_at": ahora,
    }
    capacidades = supabase_admin.table("capacidades").select("*").eq(
        "voluntario_id", voluntario_id
    ).limit(1).execute()
    cambio["resumen_expediente"] = generar_resumen_expediente(
        perfil,
        capacidades.data[0] if capacidades.data else {},
    )
    if video_actualizado:
        cambio.update({
            "analisis_video": None,
            "analisis_video_estado": "pendiente",
            "analisis_video_modelo": None,
            "analisis_video_error": None,
            "analisis_video_iniciado_at": None,
            "analisis_video_procesado_at": None,
            "estado_coordenadas": "pendiente",
            "checklist_remoto": {},
            "checklist_remoto_completado_at": None,
        })
    supabase_admin.table("verificaciones_hogar").update(
        cambio
    ).eq("id", verificacion_id).execute()
    _registrar_evento_verificacion(
        verificacion_id,
        "formulario_actualizado",
        "La persona postulante actualizó los datos solicitados.",
        actor_tipo="postulante",
        datos={
            "ronda": actual["numero"],
            "tipos_pendientes": sorted(pendientes),
        },
    )
    return {
        "verificacion_id": verificacion_id,
        "reanalisar_video": video_actualizado,
        "tipos_pendientes": sorted(pendientes),
    }


def _nombre_voluntario(voluntario_id: str) -> str:
    voluntario = supabase_admin.table("voluntarios").select(
        "usuario_id"
    ).eq("id", voluntario_id).limit(1).execute()
    if not voluntario.data:
        return "Persona voluntaria"
    usuario = supabase_admin.table("usuarios").select(
        "nombre, apellido_paterno"
    ).eq("id", voluntario.data[0]["usuario_id"]).limit(1).execute()
    if not usuario.data:
        return "Persona voluntaria"
    return " ".join(
        parte for parte in (
            usuario.data[0].get("nombre"),
            usuario.data[0].get("apellido_paterno"),
        ) if parte
    )


def _usuario_id_voluntario(voluntario_id: str) -> str | None:
    try:
        voluntario = supabase_admin.table("voluntarios").select(
            "usuario_id"
        ).eq("id", voluntario_id).limit(1).execute()
        return (
            voluntario.data[0].get("usuario_id")
            if voluntario.data
            else None
        )
    except Exception:
        return None


def _nombre_usuario(usuario_id: str) -> str | None:
    try:
        usuario = supabase_admin.table("usuarios").select(
            "nombre, apellido_paterno"
        ).eq("id", usuario_id).limit(1).execute()
        if not usuario.data:
            return None
        return " ".join(
            parte for parte in (
                usuario.data[0].get("nombre"),
                usuario.data[0].get("apellido_paterno"),
            ) if parte
        )
    except Exception:
        return None


def listar_propuestas_verificacion_hogar(
    verificador_voluntario_id: str,
) -> list[dict]:
    asignaciones = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, distancia_km, tramo_distancia, estado, "
        "propuesta_at, respondida_at, visita_programada_at, motivo_rechazo, "
        "horario_propuesto_at, horario_propuesto_por, horario_estado, "
        "horario_respondido_at, motivo_reagenda, check_in_at, check_out_at, "
        "check_in_distancia_m, checklist, notas_visita, resultado_visita, "
        "motivo_resultado_visita, resultado_at"
    ).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).order("propuesta_at", desc=True).execute().data or []

    respuesta = []
    for asignacion in asignaciones:
        verificacion = supabase_admin.table("verificaciones_hogar").select(
            "id, perfil_casa_temporal_id, voluntario_postulante_id, "
            "asociacion_id, estado, modalidad, resumen_expediente"
        ).eq(
            "id", asignacion["verificacion_hogar_id"]
        ).limit(1).execute()
        if not verificacion.data:
            continue
        hogar = verificacion.data[0]
        perfil = supabase_admin.table("perfil_casa_temporal").select(
            "municipio, colonia, estado_ubicacion, tipo_vivienda"
        ).eq("id", hogar["perfil_casa_temporal_id"]).limit(1).execute()
        asociacion = supabase_admin.table("asociaciones").select(
            "nombre"
        ).eq("id", hogar["asociacion_id"]).limit(1).execute()
        zona = perfil.data[0] if perfil.data else {}
        respuesta.append({
            **asignacion,
            "estado_verificacion": hogar["estado"],
            "asociacion_nombre": (
                asociacion.data[0]["nombre"]
                if asociacion.data
                else "Tu asociación"
            ),
            "postulante_nombre": "Postulante de casa temporal",
            "zona_hogar": {
                "municipio": zona.get("municipio"),
                "colonia": zona.get("colonia"),
                "estado": zona.get("estado_ubicacion"),
                "tipo_vivienda": zona.get("tipo_vivienda"),
            },
            "resumen_previo": {
                "hogar": (hogar.get("resumen_expediente") or {}).get("hogar"),
                "disponibilidad": (
                    hogar.get("resumen_expediente") or {}
                ).get("disponibilidad"),
            },
        })
    return respuesta


def obtener_propuesta_verificacion_hogar(
    asignacion_id: str,
    verificador_voluntario_id: str,
) -> dict:
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, distancia_km, tramo_distancia, estado, "
        "propuesta_at, respondida_at, visita_programada_at, notas_previas, "
        "motivo_rechazo, horario_propuesto_at, horario_propuesto_por, "
        "horario_estado, horario_respondido_at, motivo_reagenda, "
        "check_in_at, check_out_at, check_in_latitud, check_in_longitud, "
        "check_in_distancia_m, checklist, notas_visita, resultado_visita, "
        "motivo_resultado_visita, resultado_at"
    ).eq("id", asignacion_id).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")

    detalle = asignacion.data[0]
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, perfil_casa_temporal_id, voluntario_postulante_id, "
        "asociacion_id, estado, modalidad, resumen_expediente, "
        "analisis_video, analisis_video_estado, estado_coordenadas, "
        "distancia_coordenadas_m, motivo_resultado"
    ).eq("id", detalle["verificacion_hogar_id"]).limit(1).execute()
    if not verificacion.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")
    hogar = verificacion.data[0]
    perfil_campos = (
        "municipio, colonia, estado_ubicacion, tipo_vivienda, "
        "preferencia_especies, preferencia_tamanios, horarios_visita"
    )
    if detalle["estado"] in ("aceptada", "completada"):
        perfil_campos += (
            ", latitud, longitud, calle, numero, referencia, "
            "identificacion_url, video_recorrido_url, foto_accesos_url, "
            "foto_bardas_url, foto_balcones_url, foto_espacio_url"
        )
    perfil = supabase_admin.table("perfil_casa_temporal").select(
        perfil_campos
    ).eq("id", hogar["perfil_casa_temporal_id"]).limit(1).execute()
    asociacion = supabase_admin.table("asociaciones").select(
        "nombre"
    ).eq("id", hogar["asociacion_id"]).limit(1).execute()

    respuesta = {
        **detalle,
        "estado_verificacion": hogar["estado"],
        "asociacion_nombre": (
            asociacion.data[0]["nombre"] if asociacion.data else "Tu asociación"
        ),
        "postulante_nombre": (
            _nombre_voluntario(hogar["voluntario_postulante_id"])
            if detalle["estado"] in ("aceptada", "completada")
            else "Postulante de casa temporal"
        ),
        "hogar": perfil.data[0] if perfil.data else {},
        "resumen_expediente": hogar.get("resumen_expediente") or {},
    }
    if detalle["estado"] in ("aceptada", "completada"):
        respuesta.update({
            "analisis_video": hogar.get("analisis_video"),
            "analisis_video_estado": hogar.get("analisis_video_estado"),
            "estado_coordenadas": hogar.get("estado_coordenadas"),
            "distancia_coordenadas_m": hogar.get(
                "distancia_coordenadas_m"
            ),
        })
    return respuesta


def responder_propuesta_verificacion_hogar(
    asignacion_id: str,
    verificador_voluntario_id: str,
    respuesta: str,
    motivo: str | None = None,
) -> dict:
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, estado"
    ).eq("id", asignacion_id).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    propuesta = asignacion.data[0]
    if propuesta["estado"] != "propuesta":
        raise HTTPException(
            status_code=409,
            detail="Esta propuesta ya fue respondida",
        )

    motivo_limpio = (motivo or "").strip()
    if respuesta == "rechazar" and not motivo_limpio:
        raise HTTPException(
            status_code=422,
            detail="Indica brevemente por qué no puedes realizar la visita",
        )
    ahora = datetime.now(timezone.utc).isoformat()
    if respuesta == "aceptar":
        supabase_admin.table(
            "asignaciones_verificacion_hogar"
        ).update({
            "estado": "aceptada",
            "respondida_at": ahora,
            "motivo_rechazo": None,
            "updated_at": ahora,
        }).eq("id", asignacion_id).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "visita_aceptada",
            "updated_at": ahora,
        }).eq("id", propuesta["verificacion_hogar_id"]).execute()
        _registrar_evento_verificacion(
            propuesta["verificacion_hogar_id"],
            "propuesta_visita_aceptada",
            "La persona verificadora aceptó realizar la visita.",
            actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
            actor_tipo="verificador",
            datos={"asignacion_id": asignacion_id},
        )
        return {
            "estado": "aceptada",
            "estado_verificacion": "visita_aceptada",
            "mensaje": "Aceptaste la visita. El siguiente paso es acordar el horario.",
        }

    if respuesta != "rechazar":
        raise HTTPException(status_code=422, detail="Respuesta no válida")
    supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).update({
        "estado": "rechazada",
        "respondida_at": ahora,
        "motivo_rechazo": motivo_limpio,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "pendiente_asignacion",
        "updated_at": ahora,
    }).eq("id", propuesta["verificacion_hogar_id"]).execute()
    _registrar_evento_verificacion(
        propuesta["verificacion_hogar_id"],
        "propuesta_visita_rechazada",
        "La persona verificadora rechazó la propuesta de visita.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"asignacion_id": asignacion_id, "motivo": motivo_limpio},
    )
    return {
        "estado": "rechazada",
        "estado_verificacion": "pendiente_asignacion",
        "mensaje": "Rechazaste la visita. La asociación buscará a otra persona.",
    }


def _normalizar_horario_futuro(horario: datetime) -> str:
    if horario.tzinfo is None:
        horario = horario.replace(tzinfo=timezone.utc)
    horario_utc = horario.astimezone(timezone.utc)
    if horario_utc <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=422,
            detail="Selecciona una fecha y hora futura",
        )
    return horario_utc.isoformat()


def proponer_horario_verificacion_hogar(
    asignacion_id: str,
    verificador_voluntario_id: str,
    horario: datetime,
    motivo: str | None = None,
) -> dict:
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, estado, horario_estado"
    ).eq("id", asignacion_id).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    visita = asignacion.data[0]
    if visita["estado"] != "aceptada":
        raise HTTPException(
            status_code=409,
            detail="Primero debes aceptar la propuesta de visita",
        )

    motivo_limpio = (motivo or "").strip()
    if visita.get("horario_estado") == "confirmado" and not motivo_limpio:
        raise HTTPException(
            status_code=422,
            detail="Explica brevemente por qué necesitas reagendar",
        )

    horario_iso = _normalizar_horario_futuro(horario)
    ahora = datetime.now(timezone.utc).isoformat()
    supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).update({
        "horario_propuesto_at": horario_iso,
        "horario_propuesto_por": "verificador",
        "horario_estado": "pendiente_postulante",
        "horario_respondido_at": None,
        "motivo_reagenda": motivo_limpio or None,
        "visita_programada_at": None,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "coordinando_visita",
        "updated_at": ahora,
    }).eq("id", visita["verificacion_hogar_id"]).execute()
    _registrar_evento_verificacion(
        visita["verificacion_hogar_id"],
        "horario_propuesto",
        "La persona verificadora propuso un horario para la visita.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"horario": horario_iso, "motivo": motivo_limpio or None},
    )
    return {
        "horario_estado": "pendiente_postulante",
        "horario_propuesto_at": horario_iso,
        "estado_verificacion": "coordinando_visita",
        "mensaje": "Horario enviado. Esperaremos la confirmación del postulante.",
    }


def confirmar_horario_como_verificador(
    asignacion_id: str,
    verificador_voluntario_id: str,
) -> dict:
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, estado, horario_estado, "
        "horario_propuesto_at"
    ).eq("id", asignacion_id).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    visita = asignacion.data[0]
    if (
        visita["estado"] != "aceptada"
        or visita.get("horario_estado") != "pendiente_verificador"
        or not visita.get("horario_propuesto_at")
    ):
        raise HTTPException(
            status_code=409,
            detail="No hay un nuevo horario pendiente de tu confirmación",
        )

    ahora = datetime.now(timezone.utc).isoformat()
    horario = visita["horario_propuesto_at"]
    supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).update({
        "horario_estado": "confirmado",
        "horario_respondido_at": ahora,
        "visita_programada_at": horario,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "visita_programada",
        "updated_at": ahora,
    }).eq("id", visita["verificacion_hogar_id"]).execute()
    return {
        "horario_estado": "confirmado",
        "visita_programada_at": horario,
        "estado_verificacion": "visita_programada",
        "mensaje": "La visita quedó programada.",
    }


def obtener_coordinacion_visita_postulante(
    voluntario_postulante_id: str,
) -> dict:
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, asociacion_id, perfil_casa_temporal_id, estado, modalidad"
    ).eq("voluntario_postulante_id", voluntario_postulante_id).in_(
        "estado",
        [
            "visita_aceptada",
            "coordinando_visita",
            "visita_programada",
            "visita_en_curso",
            "visita_realizada",
        ],
    ).order("created_at", desc=True).limit(1).execute()
    if not verificacion.data:
        raise HTTPException(
            status_code=404,
            detail="No tienes una visita en coordinación",
        )
    proceso = verificacion.data[0]
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificador_voluntario_id, estado, horario_propuesto_at, "
        "horario_propuesto_por, horario_estado, horario_respondido_at, "
        "visita_programada_at, motivo_reagenda, check_in_at, check_out_at"
    ).eq("verificacion_hogar_id", proceso["id"]).eq(
        "estado", "aceptada"
    ).order("propuesta_at", desc=True).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(
            status_code=404,
            detail="No encontramos a la persona verificadora asignada",
        )
    visita = asignacion.data[0]
    asociacion = supabase_admin.table("asociaciones").select(
        "nombre"
    ).eq("id", proceso["asociacion_id"]).limit(1).execute()
    perfil = supabase_admin.table("perfil_casa_temporal").select(
        "horarios_visita"
    ).eq("id", proceso["perfil_casa_temporal_id"]).limit(1).execute()
    return {
        **visita,
        "verificacion_hogar_id": proceso["id"],
        "estado_verificacion": proceso["estado"],
        "asociacion_nombre": (
            asociacion.data[0]["nombre"] if asociacion.data else "La asociación"
        ),
        "verificador_nombre": _nombre_voluntario(
            visita["verificador_voluntario_id"]
        ),
        "horarios_declarados": (
            perfil.data[0].get("horarios_visita") or []
            if perfil.data
            else []
        ),
    }


def responder_horario_como_postulante(
    voluntario_postulante_id: str,
    respuesta: str,
    horario: datetime | None = None,
    motivo: str | None = None,
) -> dict:
    coordinacion = obtener_coordinacion_visita_postulante(
        voluntario_postulante_id
    )
    horario_estado = coordinacion.get("horario_estado")
    ahora = datetime.now(timezone.utc).isoformat()

    if respuesta == "confirmar":
        if (
            horario_estado != "pendiente_postulante"
            or not coordinacion.get("horario_propuesto_at")
        ):
            raise HTTPException(
                status_code=409,
                detail="No hay un horario pendiente de tu confirmación",
            )
        horario_confirmado = coordinacion["horario_propuesto_at"]
        supabase_admin.table(
            "asignaciones_verificacion_hogar"
        ).update({
            "horario_estado": "confirmado",
            "horario_respondido_at": ahora,
            "visita_programada_at": horario_confirmado,
            "updated_at": ahora,
        }).eq("id", coordinacion["id"]).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "visita_programada",
            "updated_at": ahora,
        }).eq("id", coordinacion["verificacion_hogar_id"]).execute()
        return {
            "asignacion_id": coordinacion["id"],
            "horario_estado": "confirmado",
            "visita_programada_at": horario_confirmado,
            "estado_verificacion": "visita_programada",
            "mensaje": "Confirmaste el horario de la visita.",
        }

    if respuesta != "proponer_cambio" or horario is None:
        raise HTTPException(status_code=422, detail="Respuesta no válida")
    if horario_estado not in ("pendiente_postulante", "confirmado"):
        raise HTTPException(
            status_code=409,
            detail="La visita no está lista para solicitar un cambio",
        )
    motivo_limpio = (motivo or "").strip()
    if not motivo_limpio:
        raise HTTPException(
            status_code=422,
            detail="Explica brevemente por qué necesitas cambiar el horario",
        )
    horario_iso = _normalizar_horario_futuro(horario)
    supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).update({
        "horario_propuesto_at": horario_iso,
        "horario_propuesto_por": "postulante",
        "horario_estado": "pendiente_verificador",
        "horario_respondido_at": None,
        "visita_programada_at": None,
        "motivo_reagenda": motivo_limpio,
        "updated_at": ahora,
    }).eq("id", coordinacion["id"]).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "coordinando_visita",
        "updated_at": ahora,
    }).eq("id", coordinacion["verificacion_hogar_id"]).execute()
    return {
        "asignacion_id": coordinacion["id"],
        "horario_estado": "pendiente_verificador",
        "horario_propuesto_at": horario_iso,
        "estado_verificacion": "coordinando_visita",
        "mensaje": "Enviamos tu propuesta de horario a la persona verificadora.",
    }


CHECKLIST_VISITA_CAMPOS = {
    "identidad_coincide",
    "espacio_coincide_video",
    "accesos_seguros",
    "cierres_perimetrales",
    "ventanas_balcones",
    "espacio_aislamiento",
    "higiene_ventilacion",
    "convivencia_hogar",
    "autorizacion_vivienda",
}


def _obtener_visita_asignada(
    asignacion_id: str,
    verificador_voluntario_id: str,
) -> tuple[dict, dict]:
    asignacion = supabase_admin.table(
        "asignaciones_verificacion_hogar"
    ).select(
        "id, verificacion_hogar_id, estado, horario_estado, "
        "visita_programada_at, check_in_at, check_out_at, checklist, "
        "resultado_visita"
    ).eq("id", asignacion_id).eq(
        "verificador_voluntario_id", verificador_voluntario_id
    ).limit(1).execute()
    if not asignacion.data:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    visita = asignacion.data[0]
    if visita["estado"] != "aceptada":
        raise HTTPException(
            status_code=409,
            detail="Esta visita ya no se encuentra activa",
        )

    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, postulacion_id, perfil_casa_temporal_id, asociacion_id, "
        "voluntario_postulante_id, estado, modalidad"
    ).eq("id", visita["verificacion_hogar_id"]).limit(1).execute()
    if not verificacion.data:
        raise HTTPException(status_code=404, detail="Verificación no encontrada")
    return visita, verificacion.data[0]


def registrar_check_in_visita(
    asignacion_id: str,
    verificador_voluntario_id: str,
    latitud: float | None = None,
    longitud: float | None = None,
) -> dict:
    visita, verificacion = _obtener_visita_asignada(
        asignacion_id,
        verificador_voluntario_id,
    )
    if (
        visita.get("horario_estado") != "confirmado"
        or not visita.get("visita_programada_at")
    ):
        raise HTTPException(
            status_code=409,
            detail="Primero debe confirmarse la fecha y hora de la visita",
        )
    if visita.get("check_in_at"):
        raise HTTPException(
            status_code=409,
            detail="La llegada a esta visita ya fue registrada",
        )
    if verificacion["estado"] != "visita_programada":
        raise HTTPException(
            status_code=409,
            detail="La visita no está lista para iniciar",
        )

    distancia = None
    if latitud is not None and longitud is not None:
        perfil = supabase_admin.table("perfil_casa_temporal").select(
            "latitud, longitud"
        ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
        hogar = perfil.data[0] if perfil.data else {}
        if hogar.get("latitud") is not None and hogar.get("longitud") is not None:
            distancia = round(
                distancia_metros(
                    float(latitud),
                    float(longitud),
                    float(hogar["latitud"]),
                    float(hogar["longitud"]),
                ),
                1,
            )

    ahora = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("asignaciones_verificacion_hogar").update({
        "check_in_at": ahora,
        "check_in_latitud": latitud,
        "check_in_longitud": longitud,
        "check_in_distancia_m": distancia,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "visita_en_curso",
        "updated_at": ahora,
    }).eq("id", verificacion["id"]).execute()
    _registrar_evento_verificacion(
        verificacion["id"],
        "check_in_visita",
        "La persona verificadora registró su llegada al hogar.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"asignacion_id": asignacion_id, "distancia_m": distancia},
    )
    return {
        "check_in_at": ahora,
        "check_in_distancia_m": distancia,
        "estado_verificacion": "visita_en_curso",
        "mensaje": "Llegada registrada. Tu asociación puede ver que estás en la visita.",
    }


def guardar_checklist_visita(
    asignacion_id: str,
    verificador_voluntario_id: str,
    checklist: dict,
) -> dict:
    visita, verificacion = _obtener_visita_asignada(
        asignacion_id,
        verificador_voluntario_id,
    )
    if not visita.get("check_in_at"):
        raise HTTPException(
            status_code=409,
            detail="Registra tu llegada antes de completar la revisión",
        )
    if visita.get("check_out_at"):
        raise HTTPException(
            status_code=409,
            detail="La visita ya fue cerrada",
        )
    if verificacion["estado"] != "visita_en_curso":
        raise HTTPException(
            status_code=409,
            detail="La visita no está en curso",
        )

    respuestas = {
        clave: checklist.get(clave)
        for clave in CHECKLIST_VISITA_CAMPOS
    }
    if any(valor not in {"cumple", "no_cumple", "no_aplica"} for valor in respuestas.values()):
        raise HTTPException(
            status_code=422,
            detail="Responde todos los puntos de la revisión",
        )
    notas = (checklist.get("notas") or "").strip()
    ahora = datetime.now(timezone.utc).isoformat()
    evidencia = {
        **respuestas,
        "completado_at": ahora,
    }
    supabase_admin.table("asignaciones_verificacion_hogar").update({
        "checklist": evidencia,
        "notas_visita": notas or None,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    _registrar_evento_verificacion(
        verificacion["id"],
        "checklist_presencial_completado",
        "La persona verificadora completó el checklist presencial.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"asignacion_id": asignacion_id},
    )
    return {
        "checklist": evidencia,
        "notas_visita": notas or None,
        "mensaje": "Revisión guardada.",
    }


def registrar_check_out_visita(
    asignacion_id: str,
    verificador_voluntario_id: str,
) -> dict:
    visita, verificacion = _obtener_visita_asignada(
        asignacion_id,
        verificador_voluntario_id,
    )
    if not visita.get("check_in_at"):
        raise HTTPException(
            status_code=409,
            detail="No hay una llegada registrada",
        )
    if visita.get("check_out_at"):
        raise HTTPException(
            status_code=409,
            detail="La salida de esta visita ya fue registrada",
        )
    checklist = visita.get("checklist") or {}
    if not CHECKLIST_VISITA_CAMPOS.issubset(checklist.keys()):
        raise HTTPException(
            status_code=409,
            detail="Completa y guarda la revisión antes de registrar tu salida",
        )
    if verificacion["estado"] != "visita_en_curso":
        raise HTTPException(
            status_code=409,
            detail="La visita no está en curso",
        )

    ahora = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("asignaciones_verificacion_hogar").update({
        "check_out_at": ahora,
        "updated_at": ahora,
    }).eq("id", asignacion_id).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "visita_realizada",
        "updated_at": ahora,
    }).eq("id", verificacion["id"]).execute()
    _registrar_evento_verificacion(
        verificacion["id"],
        "check_out_visita",
        "La persona verificadora registró su salida del hogar.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"asignacion_id": asignacion_id},
    )
    return {
        "check_out_at": ahora,
        "estado_verificacion": "visita_realizada",
        "mensaje": "Salida registrada. Ya puedes enviar el resultado.",
    }


def resolver_resultado_visita(
    asignacion_id: str,
    verificador_voluntario_id: str,
    resultado: str,
    motivo: str | None = None,
) -> dict:
    visita, verificacion = _obtener_visita_asignada(
        asignacion_id,
        verificador_voluntario_id,
    )
    if not visita.get("check_out_at") or verificacion["estado"] != "visita_realizada":
        raise HTTPException(
            status_code=409,
            detail="Registra tu salida antes de enviar el resultado",
        )
    if visita.get("resultado_visita"):
        raise HTTPException(
            status_code=409,
            detail="El resultado de esta visita ya fue enviado",
        )

    motivo_limpio = (motivo or "").strip()
    if resultado in ("solicitar_ajustes", "rechazar") and not motivo_limpio:
        raise HTTPException(
            status_code=422,
            detail="Explica brevemente el resultado para orientar al postulante",
        )
    checklist = visita.get("checklist") or {}
    if resultado == "aprobar" and any(
        checklist.get(campo) == "no_cumple"
        for campo in CHECKLIST_VISITA_CAMPOS
    ):
        raise HTTPException(
            status_code=409,
            detail="No puedes aprobar mientras existan puntos marcados como no cumple",
        )
    if resultado not in ("aprobar", "solicitar_ajustes", "rechazar"):
        raise HTTPException(status_code=422, detail="Resultado no válido")

    ahora = datetime.now(timezone.utc).isoformat()
    cierre_asignacion = {
        "estado": "completada",
        "resultado_visita": resultado,
        "motivo_resultado_visita": motivo_limpio or None,
        "resultado_at": ahora,
        "updated_at": ahora,
    }

    if resultado == "solicitar_ajustes":
        perfil = supabase_admin.table("perfil_casa_temporal").select(
            "identificacion_url, video_recorrido_url"
        ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
        ultima = supabase_admin.table(
            "rondas_evidencia_verificacion"
        ).select("numero").eq(
            "verificacion_hogar_id", verificacion["id"]
        ).order("numero", desc=True).limit(1).execute()
        numero_ronda = int(ultima.data[0]["numero"]) + 1 if ultima.data else 1
        supabase_admin.table("rondas_evidencia_verificacion").insert({
            "verificacion_hogar_id": verificacion["id"],
            "numero": numero_ronda,
            "estado": "solicitada",
            "tipos_solicitados": ["video"],
            "instrucciones": motivo_limpio,
            "solicitada_por_usuario_id": _usuario_id_voluntario(
                verificador_voluntario_id
            ),
            "evidencia_anterior": {
                "identificacion_url": (
                    perfil.data[0].get("identificacion_url")
                    if perfil.data else None
                ),
                "video_url": (
                    perfil.data[0].get("video_recorrido_url")
                    if perfil.data else None
                ),
            },
            "solicitada_at": ahora,
        }).execute()
        supabase_admin.table("asignaciones_verificacion_hogar").update(
            cierre_asignacion
        ).eq("id", asignacion_id).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "requiere_cambios",
            "modalidad": "remota",
            "motivo_resultado": motivo_limpio,
            "resuelta_at": None,
            "updated_at": ahora,
        }).eq("id", verificacion["id"]).execute()
        _registrar_evento_verificacion(
            verificacion["id"],
            "ajustes_solicitados_visita",
            "La persona verificadora solicitó ajustes después de la visita.",
            actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
            actor_tipo="verificador",
            datos={"asignacion_id": asignacion_id, "motivo": motivo_limpio},
        )
        return {
            "estado": "requiere_cambios",
            "mensaje": "Se solicitaron ajustes y un nuevo recorrido al postulante.",
        }

    voluntario_id = verificacion["voluntario_postulante_id"]
    if resultado == "rechazar":
        supabase_admin.table("asignaciones_verificacion_hogar").update(
            cierre_asignacion
        ).eq("id", asignacion_id).execute()
        supabase_admin.table("postulaciones").update({
            "estado": "rechazada",
            "motivo_rechazo": motivo_limpio,
            "resuelta_at": ahora,
        }).eq("id", verificacion["postulacion_id"]).execute()
        supabase_admin.table("voluntarios").update({
            "estado": "rechazado",
            "updated_at": ahora,
        }).eq("id", voluntario_id).execute()
        supabase_admin.table("verificaciones_hogar").update({
            "estado": "rechazada",
            "motivo_resultado": motivo_limpio,
            "resuelta_at": ahora,
            "updated_at": ahora,
        }).eq("id", verificacion["id"]).execute()
        _registrar_evento_verificacion(
            verificacion["id"],
            "verificacion_rechazada",
            "La persona verificadora no aprobó la casa temporal.",
            actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
            actor_tipo="verificador",
            datos={"asignacion_id": asignacion_id, "motivo": motivo_limpio},
        )
        return {
            "estado": "rechazada",
            "mensaje": "La casa temporal no fue aprobada.",
        }

    voluntario = supabase_admin.table("voluntarios").select(
        "id, usuario_id"
    ).eq("id", voluntario_id).limit(1).execute()
    if not voluntario.data:
        raise HTTPException(status_code=404, detail="Voluntario no encontrado")
    rol = supabase_admin.table("roles").select("id").eq(
        "nombre", "voluntario_externo"
    ).limit(1).execute()
    if not rol.data:
        raise HTTPException(
            status_code=500,
            detail="No está configurado el rol de voluntario externo",
        )

    supabase_admin.table("asignaciones_verificacion_hogar").update(
        cierre_asignacion
    ).eq("id", asignacion_id).execute()
    supabase_admin.table("voluntarios").update({
        "estado": "activo_nivel_2",
        "asociacion_id": verificacion["asociacion_id"],
        "updated_at": ahora,
    }).eq("id", voluntario_id).execute()
    supabase_admin.table("usuarios").update({
        "rol_id": rol.data[0]["id"],
        "asociacion_id": verificacion["asociacion_id"],
        "updated_at": ahora,
    }).eq("id", voluntario.data[0]["usuario_id"]).execute()
    supabase_admin.table("postulaciones").update({
        "estado": "aceptada",
        "motivo_rechazo": None,
        "resuelta_at": ahora,
    }).eq("id", verificacion["postulacion_id"]).execute()
    supabase_admin.table("verificaciones_hogar").update({
        "estado": "aprobada",
        "motivo_resultado": motivo_limpio or None,
        "resuelta_at": ahora,
        "updated_at": ahora,
    }).eq("id", verificacion["id"]).execute()
    _registrar_evento_verificacion(
        verificacion["id"],
        "verificacion_aprobada",
        "La persona verificadora aprobó la casa temporal.",
        actor_usuario_id=_usuario_id_voluntario(verificador_voluntario_id),
        actor_tipo="verificador",
        datos={"asignacion_id": asignacion_id},
    )
    return {
        "estado": "aprobada",
        "nivel_voluntario": "activo_nivel_2",
        "mensaje": "La casa temporal fue aprobada.",
    }
