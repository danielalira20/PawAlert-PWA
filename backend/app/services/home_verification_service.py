from datetime import datetime, timezone

from fastapi import HTTPException

from app.db.supabase import supabase_admin


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

    supabase_admin.table("voluntarios").update({
        "estado": "postulacion_pendiente",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", voluntario_id).execute()

    return {
        "postulacion_id": postulacion["id"],
        "verificacion_id": verificacion_creada.data[0]["id"],
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
        "estado_coordenadas, notas_asociacion, motivo_resultado, "
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
        "video_recorrido_url, horarios_visita"
    ).eq("id", verificacion["perfil_casa_temporal_id"]).limit(1).execute()
    verificacion["hogar"] = perfil.data[0] if perfil.data else None
    return verificacion


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

    return {
        "asignacion_id": asignacion.data[0]["id"],
        "verificacion_id": verificacion_id,
        "estado": "visita_propuesta",
        "verificador": candidato,
        "mensaje": "La propuesta de visita fue enviada al voluntario.",
    }
