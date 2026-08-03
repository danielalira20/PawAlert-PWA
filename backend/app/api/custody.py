import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from app.db.supabase import supabase, supabase_admin
from app.models.custody import (
    AceptarRelevoRequest,
    ConfirmarTransferenciaRequest,
    ExtensionCustodiaRequest,
    SeguimientoCustodiaRequest,
    SolicitudRelevoRequest,
    ValidacionSeguimientoRequest,
    FinalizarCustodiaRequest,
    DudaRegionalRequest,
    EnviarAclaracionRequest,
    ResponderAclaracionRequest,
)
from app.services.report_service import registrar_historial
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response


router = APIRouter()
ESTADOS_CUSTODIA_ACTIVA = (
    "activo",
    "extension_pendiente",
    "buscando_relevo",
    "traslado_programado",
)
ESTADOS_CUSTODIA_REGIONAL = ESTADOS_CUSTODIA_ACTIVA + ("transferido",)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _usuario(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        auth = supabase.auth.get_user(authorization.replace("Bearer ", ""))
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    resultado = (
        supabase.table("usuarios")
        .select("id, asociacion_id, roles(nombre)")
        .eq("auth_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    fila = resultado.data[0]
    return {
        "id": fila["id"],
        "asociacion_id": fila.get("asociacion_id"),
        "rol": (fila.get("roles") or {}).get("nombre"),
    }


def _voluntario_externo(usuario: dict) -> dict:
    if usuario["rol"] != "voluntario_externo":
        raise HTTPException(status_code=403, detail="Esta acción corresponde al hogar temporal")
    resultado = (
        supabase.table("voluntarios")
        .select("id, estado")
        .eq("usuario_id", usuario["id"])
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Perfil voluntario no encontrado")
    return resultado.data[0]


def _asociacion_verificada(usuario: dict) -> dict:
    if usuario["rol"] not in ("asociacion", "staff") or not usuario.get("asociacion_id"):
        raise HTTPException(status_code=403, detail="Se requiere una asociación verificada")
    resultado = (
        supabase.table("asociaciones")
        .select("id, nombre, verificado, latitud, longitud")
        .eq("id", usuario["asociacion_id"])
        .limit(1)
        .execute()
    )
    if not resultado.data or not resultado.data[0].get("verificado"):
        raise HTTPException(status_code=403, detail="Se requiere una asociación verificada")
    return resultado.data[0]


def _distancia_km(lat1, lon1, lat2, lon2) -> float:
    radio = 6371
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dlat = p2 - p1
    dlon = math.radians(float(lon2)) - math.radians(float(lon1))
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return radio * 2 * math.asin(math.sqrt(a))


def _en_radio_regional(asociacion: dict, voluntario_id: str, radio_km: float = 50) -> bool:
    if asociacion.get("latitud") is None or asociacion.get("longitud") is None:
        return False
    perfil = (
        supabase.table("perfil_casa_temporal")
        .select("latitud, longitud")
        .eq("voluntario_id", voluntario_id)
        .limit(1)
        .execute()
    )
    if not perfil.data or perfil.data[0].get("latitud") is None:
        return False
    return _distancia_km(
        asociacion["latitud"],
        asociacion["longitud"],
        perfil.data[0]["latitud"],
        perfil.data[0]["longitud"],
    ) <= radio_km


def _frecuencia_horas(condicion: str, inicio_at: str, es_inicial: bool) -> int:
    texto = condicion.lower()
    if any(p in texto for p in ("crítico", "critico", "operado", "delicado")):
        return 24
    if any(p in texto for p in ("herido", "enfermo", "recuperación", "recuperacion")):
        return 48
    if es_inicial:
        return 72
    inicio = datetime.fromisoformat(str(inicio_at).replace("Z", "+00:00"))
    return 336 if (_ahora() - inicio).days >= 30 else 168


def _reporte_resumen(reporte_id: str) -> dict:
    resultado = (
        supabase.table("reportes")
        .select(
            "id, estado_reporte, created_at, "
            "animal(id, orden, es_grupo, cantidad, sexo, edad_aproximada, descripcion, "
            "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
            "animal_fotos(foto_url, orden))"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        return {"id": reporte_id, "animales": [], "foto_url": None}
    reporte = resultado.data[0]
    animales_crudos, animal_legado = shape_animal_embed(reporte.get("animal"))
    fotos = (animal_legado or {}).get("animal_fotos") or []
    return {
        "id": reporte_id,
        "estado_reporte": reporte.get("estado_reporte"),
        "created_at": str(reporte.get("created_at")),
        "animales": [shape_animal_response(a) for a in animales_crudos],
        "foto_url": sorted(fotos, key=lambda f: f.get("orden", 0))[0]["foto_url"] if fotos else None,
    }


def _ultimo_seguimiento(custodia_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("seguimientos_resguardo")
        .select("*")
        .eq("custodia_id", custodia_id)
        .order("creado_at", desc=True)
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _seguimientos_recientes(custodia_id: str) -> list[dict]:
    return (
        supabase.table("seguimientos_resguardo")
        .select(
            "id, tipo, condicion_actual, salud, alimentacion, tratamiento, "
            "comportamiento, foto_url, entorno_foto_url, estado_validacion, "
            "creado_at, proximo_seguimiento_at"
        )
        .eq("custodia_id", custodia_id)
        .order("creado_at", desc=True)
        .limit(2)
        .execute()
    ).data or []


def _transferencia_activa(custodia_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("transferencias_custodia")
        .select(
            "id, asociacion_origen_id, asociacion_receptora_id, fecha_programada, "
            "confirma_entrega_at, confirma_recepcion_at, estado"
        )
        .eq("custodia_id", custodia_id)
        .in_("estado", ["programada", "en_curso"])
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _aclaraciones_activas(custodia_id: str) -> list[dict]:
    return (
        supabase.table("aclaraciones_seguimiento")
        .select(
            "id, seguimiento_id, asociacion_origen_id, pregunta_regional, "
            "mensaje_coordinadora, respuesta_voluntario, foto_respuesta_url, "
            "estado, creada_at, enviada_at, respondida_at, revision_manual"
        )
        .eq("custodia_id", custodia_id)
        .in_("estado", ["pendiente_coordinadora", "enviada_voluntario", "respondida"])
        .order("creada_at", desc=True)
        .execute()
    ).data or []


def _seguimiento_inicial(custodia_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("seguimientos_resguardo")
        .select("id, foto_url, entorno_foto_url, creado_at")
        .eq("custodia_id", custodia_id)
        .order("creado_at")
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _ultima_evidencia_entorno(custodia_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("seguimientos_resguardo")
        .select("id, entorno_foto_url, creado_at")
        .eq("custodia_id", custodia_id)
        .not_.is_("entorno_foto_url", "null")
        .order("creado_at", desc=True)
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _revision_activa(seguimiento_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("revisiones_seguimiento")
        .select("id, asociacion_id, estado, reservada_at, vence_at, asociaciones(nombre)")
        .eq("seguimiento_id", seguimiento_id)
        .eq("estado", "reservada")
        .gt("vence_at", _ahora().isoformat())
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _ultima_validacion(seguimiento_id: str) -> Optional[dict]:
    resultado = (
        supabase.table("validaciones_seguimiento")
        .select(
            "id, decision, comentario, mismo_animal, foto_clara, entorno_adecuado, "
            "condicion_evolucion, posibles_inconsistencias, creado_at, asociaciones(nombre)"
        )
        .eq("seguimiento_id", seguimiento_id)
        .order("creado_at", desc=True)
        .limit(1)
        .execute()
    )
    return resultado.data[0] if resultado.data else None


def _puede_ver_ubicacion_hogar(
    custodia: dict,
    transferencia: Optional[dict],
    asociacion_id: str,
) -> bool:
    return (
        custodia.get("asociacion_coordinadora_id") == asociacion_id
        or bool(
            transferencia
            and transferencia.get("asociacion_receptora_id") == asociacion_id
        )
    )


@router.get("/me")
def listar_mis_custodias(authorization: Optional[str] = Header(None)):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    custodias = (
        supabase.table("custodias_temporales")
        .select(
            "id, reporte_id, voluntario_id, asociacion_coordinadora_id, estado, "
            "inicio_at, fecha_limite, proximo_seguimiento_at, ultimo_seguimiento_at, "
            "seguimiento_inicial_at, frecuencia_horas, ruta_ingreso"
        )
        .eq("voluntario_id", voluntario["id"])
        .order("inicio_at", desc=True)
        .execute()
    ).data or []
    notificaciones = (
        supabase.table("notificaciones_custodia")
        .select("id, custodia_id, tipo, mensaje, leida, creada_at")
        .eq("usuario_id", usuario["id"])
        .order("creada_at", desc=True)
        .limit(20)
        .execute()
    ).data or []
    return {
        "custodias": [
            {
                **c,
                "reporte": _reporte_resumen(c["reporte_id"]),
                "ultimo_seguimiento": _ultimo_seguimiento(c["id"]),
                "transferencia_activa": _transferencia_activa(c["id"]),
                "seguimiento_inicial_pendiente": not bool(c.get("seguimiento_inicial_at")),
                "aclaraciones": [
                    a for a in _aclaraciones_activas(c["id"])
                    if a["estado"] in ("enviada_voluntario", "respondida")
                ],
            }
            for c in custodias
        ],
        "notificaciones": notificaciones,
    }


@router.patch("/notifications/{notificacion_id}/read")
def marcar_notificacion_leida(
    notificacion_id: str,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    resultado = (
        supabase.table("notificaciones_custodia")
        .update({"leida": True})
        .eq("id", notificacion_id)
        .eq("usuario_id", usuario["id"])
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"leida": True}


@router.post("/{custodia_id}/followups", status_code=201)
def registrar_seguimiento(
    custodia_id: str,
    body: SeguimientoCustodiaRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    resultado = (
        supabase.table("custodias_temporales")
        .select("*")
        .eq("id", custodia_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Custodia no encontrada")
    custodia = resultado.data[0]
    if custodia["voluntario_id"] != voluntario["id"] or custodia["estado"] not in ESTADOS_CUSTODIA_ACTIVA:
        raise HTTPException(status_code=403, detail="No puedes registrar seguimiento en esta custodia")

    es_inicial = not bool(custodia.get("seguimiento_inicial_at"))
    if es_inicial and not body.entorno_foto_url:
        raise HTTPException(status_code=422, detail="El seguimiento inicial requiere foto del entorno")
    inicio = datetime.fromisoformat(str(custodia["inicio_at"]).replace("Z", "+00:00"))
    if es_inicial and _ahora() < inicio + timedelta(hours=2):
        raise HTTPException(status_code=409, detail="El seguimiento inicial se habilita dos horas después de la llegada")
    if not es_inicial and not body.entorno_foto_url and (_ahora() - inicio).days >= 15:
        ultimo_entorno = (
            supabase.table("seguimientos_resguardo")
            .select("creado_at")
            .eq("custodia_id", custodia_id)
            .not_.is_("entorno_foto_url", "null")
            .order("creado_at", desc=True)
            .limit(1)
            .execute()
        )
        if not ultimo_entorno.data:
            raise HTTPException(
                status_code=422,
                detail="Corresponde actualizar la evidencia del entorno",
            )
        fecha_entorno = datetime.fromisoformat(
            str(ultimo_entorno.data[0]["creado_at"]).replace("Z", "+00:00")
        )
        if _ahora() - fecha_entorno >= timedelta(days=15):
            raise HTTPException(
                status_code=422,
                detail="Corresponde actualizar la evidencia del entorno",
            )

    frecuencia = _frecuencia_horas(body.condicion_actual, custodia["inicio_at"], es_inicial)
    siguiente = _ahora() + timedelta(hours=frecuencia)
    insertado = (
        supabase.table("seguimientos_resguardo")
        .insert(
            {
                "custodia_id": custodia_id,
                "creado_por_id": usuario["id"],
                "tipo": "inicial" if es_inicial else "periodico",
                "condicion_actual": body.condicion_actual,
                "salud": body.salud,
                "alimentacion": body.alimentacion,
                "tratamiento": body.tratamiento,
                "comportamiento": body.comportamiento,
                "foto_url": body.foto_url,
                "entorno_foto_url": body.entorno_foto_url,
                "latitud": body.latitud,
                "longitud": body.longitud,
                "gemini_analisis": {"estado": "revision_manual"},
                "estado_validacion": "pendiente",
                "proximo_seguimiento_at": siguiente.isoformat(),
            }
        )
        .execute()
    )
    cambios = {
        "ultimo_seguimiento_at": _ahora().isoformat(),
        "proximo_seguimiento_at": siguiente.isoformat(),
        "frecuencia_horas": frecuencia,
    }
    if es_inicial:
        cambios["seguimiento_inicial_at"] = _ahora().isoformat()
    supabase.table("custodias_temporales").update(cambios).eq("id", custodia_id).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="seguimiento_inicial" if es_inicial else "seguimiento_resguardo",
        descripcion="Seguimiento de custodia registrado",
        datos_extra={"seguimiento_id": insertado.data[0]["id"], "frecuencia_horas": frecuencia},
    )
    return {"seguimiento": insertado.data[0], "proximo_seguimiento_at": siguiente.isoformat()}


@router.get("/regional")
def listar_seguimiento_regional(
    radio_km: float = Query(default=50, ge=1, le=300),
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    custodias = (
        supabase.table("custodias_temporales")
        .select(
            "id, reporte_id, voluntario_id, asociacion_coordinadora_id, estado, "
            "inicio_at, fecha_limite, proximo_seguimiento_at, ultimo_seguimiento_at, "
            "seguimiento_inicial_at, frecuencia_horas, ruta_ingreso"
        )
        .in_("estado", list(ESTADOS_CUSTODIA_REGIONAL))
        .order("proximo_seguimiento_at")
        .execute()
    ).data or []
    tarjetas = []
    for custodia in custodias:
        relevo = (
            supabase.table("solicitudes_relevo")
            .select(
                "id, motivo, estado, solicitada_at, radio_actual_km, escalada_admin_at"
            )
            .eq("custodia_id", custodia["id"])
            .in_("estado", ["abierta", "reservada"])
            .limit(1)
            .execute()
        )
        relevo_activo = relevo.data[0] if relevo.data else None
        radio_efectivo = max(
            radio_km,
            float((relevo_activo or {}).get("radio_actual_km") or 0),
        )
        perfil = (
            supabase.table("perfil_casa_temporal")
            .select(
                "latitud, longitud, calle, numero, colonia, municipio, "
                "estado_ubicacion"
            )
            .eq("voluntario_id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        es_coordinadora = custodia["asociacion_coordinadora_id"] == asociacion["id"]
        perfil_hogar = perfil.data[0] if perfil.data else {}
        if perfil_hogar.get("latitud") is None and not es_coordinadora:
            continue
        distancia = None
        if (
            asociacion.get("latitud") is not None
            and asociacion.get("longitud") is not None
            and perfil_hogar.get("latitud") is not None
            and perfil_hogar.get("longitud") is not None
        ):
            distancia = _distancia_km(
                asociacion["latitud"],
                asociacion["longitud"],
                perfil_hogar["latitud"],
                perfil_hogar["longitud"],
            )
        if not es_coordinadora and (distancia is None or distancia > radio_efectivo):
            continue
        voluntario = (
            supabase.table("voluntarios")
            .select("usuarios(nombre, apellido_paterno)")
            .eq("id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        persona = ((voluntario.data[0] if voluntario.data else {}).get("usuarios") or {})
        seguimientos = _seguimientos_recientes(custodia["id"])
        ultimo = seguimientos[0] if seguimientos else None
        inicial = _seguimiento_inicial(custodia["id"])
        ultimo_entorno = _ultima_evidencia_entorno(custodia["id"])
        revision = _revision_activa(ultimo["id"]) if ultimo else None
        validacion = _ultima_validacion(ultimo["id"]) if ultimo else None
        transferencia = _transferencia_activa(custodia["id"])
        ubicacion_hogar = None
        if perfil_hogar and _puede_ver_ubicacion_hogar(custodia, transferencia, asociacion["id"]):
            hogar = perfil_hogar
            ubicacion_hogar = {
                "calle": hogar.get("calle"),
                "numero": hogar.get("numero"),
                "colonia": hogar.get("colonia"),
                "municipio": hogar.get("municipio"),
                "estado": hogar.get("estado_ubicacion"),
                "latitud": hogar.get("latitud"),
                "longitud": hogar.get("longitud"),
            }
        tarjetas.append(
            {
                "id": custodia["id"],
                "reporte_id": custodia["reporte_id"],
                "estado": custodia["estado"],
                "inicio_at": custodia.get("inicio_at"),
                "fecha_limite": custodia.get("fecha_limite"),
                "proximo_seguimiento_at": custodia.get("proximo_seguimiento_at"),
                "ultimo_seguimiento_at": custodia.get("ultimo_seguimiento_at"),
                "frecuencia_horas": custodia.get("frecuencia_horas"),
                "ruta_ingreso": custodia.get("ruta_ingreso"),
                "reporte": _reporte_resumen(custodia["reporte_id"]),
                "voluntario_nombre": " ".join(
                    p for p in (persona.get("nombre"), persona.get("apellido_paterno")) if p
                ),
                "distancia_km": round(distancia, 1) if distancia is not None else None,
                "ultimo_seguimiento": ultimo,
                "seguimiento_anterior": seguimientos[1] if len(seguimientos) > 1 else None,
                "seguimiento_inicial": inicial,
                "ultima_evidencia_entorno": ultimo_entorno,
                "revision_activa": revision,
                "ultima_validacion": validacion,
                "solicitud_relevo": relevo_activo,
                "transferencia_activa": transferencia,
                "ubicacion_hogar": ubicacion_hogar,
                "es_coordinadora": es_coordinadora,
                "aclaraciones": (
                    _aclaraciones_activas(custodia["id"])
                    if es_coordinadora
                    else [
                        a for a in _aclaraciones_activas(custodia["id"])
                        if a["asociacion_origen_id"] == asociacion["id"]
                    ]
                ),
            }
        )
    return {"radio_km": radio_km, "custodias": tarjetas}


@router.post("/followups/{seguimiento_id}/review/reserve")
def reservar_revision(
    seguimiento_id: str,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    seguimiento = (
        supabase.table("seguimientos_resguardo")
        .select("id, custodia_id")
        .eq("id", seguimiento_id)
        .limit(1)
        .execute()
    )
    if not seguimiento.data:
        raise HTTPException(status_code=404, detail="Seguimiento no encontrado")
    custodia = (
        supabase.table("custodias_temporales")
        .select("asociacion_coordinadora_id, voluntario_id")
        .eq("id", seguimiento.data[0]["custodia_id"])
        .limit(1)
        .execute()
    ).data[0]
    es_coordinadora = custodia["asociacion_coordinadora_id"] == asociacion["id"]
    if (
        custodia["asociacion_coordinadora_id"] != asociacion["id"]
        and not _en_radio_regional(asociacion, custodia["voluntario_id"])
    ):
        raise HTTPException(status_code=403, detail="La custodia está fuera de tu región")
    try:
        reserva = supabase_admin.rpc(
            "reservar_revision_seguimiento",
            {
                "p_seguimiento_id": seguimiento_id,
                "p_asociacion_id": asociacion["id"],
                "p_usuario_id": usuario["id"],
                "p_es_coordinadora": es_coordinadora,
            },
        ).execute()
    except Exception as error:
        if "revision_reservada" in str(error).lower():
            raise HTTPException(
                status_code=409,
                detail="Otra asociación está revisando esta evidencia. Se liberará en un máximo de 30 minutos.",
            ) from error
        raise
    return reserva.data


@router.post("/followups/{seguimiento_id}/questions", status_code=201)
def formular_duda_regional(
    seguimiento_id: str,
    body: DudaRegionalRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    seguimiento = (
        supabase.table("seguimientos_resguardo").select("id, custodia_id")
        .eq("id", seguimiento_id).limit(1).execute()
    )
    if not seguimiento.data:
        raise HTTPException(status_code=404, detail="Seguimiento no encontrado")
    custodia = (
        supabase.table("custodias_temporales")
        .select("reporte_id, asociacion_coordinadora_id, voluntario_id")
        .eq("id", seguimiento.data[0]["custodia_id"]).limit(1).execute()
    ).data[0]
    if custodia["asociacion_coordinadora_id"] == asociacion["id"]:
        raise HTTPException(status_code=409, detail="La coordinadora puede solicitar la aclaración directamente")
    if not _en_radio_regional(asociacion, custodia["voluntario_id"]):
        raise HTTPException(status_code=403, detail="La custodia está fuera de tu región")
    revision = (
        supabase.table("revisiones_seguimiento")
        .select("id, asociacion_id, estado, vence_at")
        .eq("seguimiento_id", seguimiento_id).limit(1).execute()
    )
    if not revision.data:
        raise HTTPException(status_code=409, detail="Reserva esta revisión antes de enviar una duda")
    reserva = revision.data[0]
    vence_at = datetime.fromisoformat(str(reserva["vence_at"]).replace("Z", "+00:00"))
    if reserva["asociacion_id"] != asociacion["id"] or reserva["estado"] != "reservada" or vence_at <= _ahora():
        raise HTTPException(status_code=409, detail="La reserva de revisión ya no está disponible")
    try:
        creada = supabase.table("aclaraciones_seguimiento").insert({
            "seguimiento_id": seguimiento_id,
            "custodia_id": seguimiento.data[0]["custodia_id"],
            "asociacion_origen_id": asociacion["id"],
            "creada_por_id": usuario["id"],
            "pregunta_regional": body.pregunta.strip(),
            "revision_manual": {
                "mismo_animal": body.mismo_animal,
                "foto_clara": body.foto_clara,
                "entorno_adecuado": body.entorno_adecuado,
                "condicion_evolucion": body.condicion_evolucion,
                "posibles_inconsistencias": body.posibles_inconsistencias,
            },
            "estado": "pendiente_coordinadora",
        }).execute()
    except Exception as error:
        if "aclaracion_activa_por_origen" in str(error).lower() or "duplicate" in str(error).lower():
            raise HTTPException(status_code=409, detail="Tu asociación ya tiene una duda activa sobre esta evidencia") from error
        raise
    registrar_historial(
        reporte_id=custodia["reporte_id"], usuario_id=usuario["id"],
        tipo_evento="duda_regional_formulada",
        descripcion="Una asociación regional envió una duda a la coordinadora",
        datos_extra={"aclaracion_id": creada.data[0]["id"]},
    )
    supabase.table("revisiones_seguimiento").update({
        "estado": "completada", "completada_at": _ahora().isoformat()
    }).eq("seguimiento_id", seguimiento_id).eq("asociacion_id", asociacion["id"]).execute()
    return {"aclaracion": creada.data[0]}


@router.post("/clarifications/{aclaracion_id}/forward")
def enviar_aclaracion_al_voluntario(
    aclaracion_id: str,
    body: EnviarAclaracionRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    aclaracion = (
        supabase.table("aclaraciones_seguimiento")
        .select("*, custodias_temporales(reporte_id, asociacion_coordinadora_id)")
        .eq("id", aclaracion_id).limit(1).execute()
    )
    if not aclaracion.data:
        raise HTTPException(status_code=404, detail="Aclaración no encontrada")
    fila = aclaracion.data[0]
    custodia = fila.get("custodias_temporales") or {}
    if custodia.get("asociacion_coordinadora_id") != asociacion["id"]:
        raise HTTPException(status_code=403, detail="Solo la coordinadora puede contactar al hogar temporal")
    if fila["estado"] not in ("pendiente_coordinadora", "respondida"):
        raise HTTPException(status_code=409, detail="La aclaración no puede enviarse en su estado actual")
    supabase.table("aclaraciones_seguimiento").update({
        "mensaje_coordinadora": body.mensaje.strip(),
        "estado": "enviada_voluntario",
        "enviada_at": _ahora().isoformat(),
    }).eq("id", aclaracion_id).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"], usuario_id=usuario["id"],
        tipo_evento="aclaracion_solicitada",
        descripcion="La asociación coordinadora solicitó una aclaración al hogar temporal",
        datos_extra={"aclaracion_id": aclaracion_id},
    )
    return {"estado": "enviada_voluntario"}


@router.post("/clarifications/{aclaracion_id}/respond")
def responder_aclaracion(
    aclaracion_id: str,
    body: ResponderAclaracionRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    aclaracion = (
        supabase.table("aclaraciones_seguimiento")
        .select("*, custodias_temporales(reporte_id, voluntario_id)")
        .eq("id", aclaracion_id).limit(1).execute()
    )
    if not aclaracion.data:
        raise HTTPException(status_code=404, detail="Aclaración no encontrada")
    fila = aclaracion.data[0]
    custodia = fila.get("custodias_temporales") or {}
    if custodia.get("voluntario_id") != voluntario["id"] or fila["estado"] != "enviada_voluntario":
        raise HTTPException(status_code=403, detail="No puedes responder esta aclaración")
    supabase.table("aclaraciones_seguimiento").update({
        "respuesta_voluntario": body.respuesta.strip(),
        "foto_respuesta_url": body.foto_url,
        "estado": "respondida",
        "respondida_at": _ahora().isoformat(),
    }).eq("id", aclaracion_id).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"], usuario_id=usuario["id"],
        tipo_evento="aclaracion_respondida",
        descripcion="El hogar temporal respondió una solicitud de aclaración",
        datos_extra={"aclaracion_id": aclaracion_id, "foto_url": body.foto_url},
    )
    return {"estado": "respondida"}


@router.post("/clarifications/{aclaracion_id}/resolve")
def resolver_aclaracion(
    aclaracion_id: str,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    aclaracion = (
        supabase.table("aclaraciones_seguimiento")
        .select("id, estado, custodias_temporales(reporte_id, asociacion_coordinadora_id)")
        .eq("id", aclaracion_id).limit(1).execute()
    )
    if not aclaracion.data:
        raise HTTPException(status_code=404, detail="Aclaración no encontrada")
    fila = aclaracion.data[0]
    custodia = fila.get("custodias_temporales") or {}
    if custodia.get("asociacion_coordinadora_id") != asociacion["id"]:
        raise HTTPException(status_code=403, detail="Solo la coordinadora puede resolver la aclaración")
    if fila["estado"] != "respondida":
        raise HTTPException(status_code=409, detail="Espera la respuesta del hogar temporal")
    supabase.table("aclaraciones_seguimiento").update({
        "estado": "resuelta",
        "resuelta_at": _ahora().isoformat(),
        "resuelta_por_id": usuario["id"],
    }).eq("id", aclaracion_id).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"], usuario_id=usuario["id"],
        tipo_evento="aclaracion_resuelta",
        descripcion="La asociación coordinadora cerró la aclaración",
        datos_extra={"aclaracion_id": aclaracion_id},
    )
    return {"estado": "resuelta"}


@router.post("/followups/{seguimiento_id}/validation", status_code=201)
def validar_seguimiento(
    seguimiento_id: str,
    body: ValidacionSeguimientoRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    seguimiento = (
        supabase.table("seguimientos_resguardo")
        .select("id, custodia_id")
        .eq("id", seguimiento_id)
        .limit(1)
        .execute()
    )
    if not seguimiento.data:
        raise HTTPException(status_code=404, detail="Seguimiento no encontrado")
    custodia = (
        supabase.table("custodias_temporales")
        .select("reporte_id, asociacion_coordinadora_id, voluntario_id")
        .eq("id", seguimiento.data[0]["custodia_id"])
        .limit(1)
        .execute()
    ).data[0]
    if (
        custodia["asociacion_coordinadora_id"] != asociacion["id"]
        and not _en_radio_regional(asociacion, custodia["voluntario_id"])
    ):
        raise HTTPException(status_code=403, detail="La custodia está fuera de tu región")
    es_coordinadora = custodia["asociacion_coordinadora_id"] == asociacion["id"]
    if body.decision in ("aclaracion_solicitada", "alerta") and not es_coordinadora:
        raise HTTPException(
            status_code=403,
            detail="Envía una duda a la coordinadora; solo ella puede contactar al hogar temporal",
        )
    if body.decision == "aclaracion_solicitada" and not (body.comentario or "").strip():
        raise HTTPException(status_code=422, detail="Escribe la aclaración que recibirá el hogar temporal")
    if None in (body.mismo_animal, body.foto_clara, body.entorno_adecuado) or not body.condicion_evolucion:
        raise HTTPException(status_code=422, detail="Completa la revisión manual de la evidencia")
    revision = (
        supabase.table("revisiones_seguimiento")
        .select("id, asociacion_id, estado, vence_at")
        .eq("seguimiento_id", seguimiento_id)
        .limit(1)
        .execute()
    )
    if not revision.data:
        raise HTTPException(status_code=409, detail="Reserva esta revisión antes de responder")
    revision = revision.data[0]
    vence_at = datetime.fromisoformat(str(revision["vence_at"]).replace("Z", "+00:00"))
    if (
        revision["asociacion_id"] != asociacion["id"]
        or revision["estado"] != "reservada"
        or vence_at <= _ahora()
    ):
        raise HTTPException(status_code=409, detail="La reserva de revisión ya no está disponible")
    insertado = (
        supabase.table("validaciones_seguimiento")
        .upsert(
            {
                "seguimiento_id": seguimiento_id,
                "asociacion_id": asociacion["id"],
                "usuario_id": usuario["id"],
                "decision": body.decision,
                "comentario": body.comentario,
                "mismo_animal": body.mismo_animal,
                "foto_clara": body.foto_clara,
                "entorno_adecuado": body.entorno_adecuado,
                "condicion_evolucion": body.condicion_evolucion,
                "posibles_inconsistencias": body.posibles_inconsistencias,
            },
            on_conflict="seguimiento_id,asociacion_id",
        )
        .execute()
    )
    estado = body.decision
    existentes = (
        supabase.table("validaciones_seguimiento")
        .select("decision")
        .eq("seguimiento_id", seguimiento_id)
        .execute()
    ).data or []
    decisiones = {v["decision"] for v in existentes}
    if len(decisiones) > 1 and custodia["asociacion_coordinadora_id"] != asociacion["id"]:
        estado = "alerta"
    supabase.table("seguimientos_resguardo").update(
        {"estado_validacion": estado}
    ).eq("id", seguimiento_id).execute()
    supabase.table("revisiones_seguimiento").update(
        {"estado": "completada", "completada_at": _ahora().isoformat()}
    ).eq("id", revision["id"]).execute()
    if body.decision == "aclaracion_solicitada":
        supabase.table("aclaraciones_seguimiento").insert({
            "seguimiento_id": seguimiento_id,
            "custodia_id": seguimiento.data[0]["custodia_id"],
            "asociacion_origen_id": asociacion["id"],
            "creada_por_id": usuario["id"],
            "pregunta_regional": body.comentario.strip(),
            "mensaje_coordinadora": body.comentario.strip(),
            "estado": "enviada_voluntario",
            "enviada_at": _ahora().isoformat(),
        }).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="seguimiento_validado" if estado == "validado" else "alerta_bienestar",
        descripcion="Asociación revisó evidencia de custodia",
        datos_extra={"seguimiento_id": seguimiento_id, "decision": body.decision},
    )
    return {"validacion": insertado.data[0], "estado_validacion": estado}


@router.post("/{custodia_id}/extension")
def extender_custodia(
    custodia_id: str,
    body: ExtensionCustodiaRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    custodia = (
        supabase.table("custodias_temporales").select("*").eq("id", custodia_id).limit(1).execute()
    )
    if not custodia.data or custodia.data[0]["voluntario_id"] != voluntario["id"]:
        raise HTTPException(status_code=403, detail="No puedes extender esta custodia")
    nueva_fecha = body.nueva_fecha_limite.astimezone(timezone.utc)
    if nueva_fecha <= _ahora() + timedelta(days=1):
        raise HTTPException(status_code=422, detail="La nueva fecha debe ampliar el resguardo al menos un día")
    capacidad = (
        supabase.table("capacidades")
        .select("capacidad_animales")
        .eq("voluntario_id", voluntario["id"])
        .limit(1)
        .execute()
    )
    activas = (
        supabase.table("custodias_temporales")
        .select("id", count="exact")
        .eq("voluntario_id", voluntario["id"])
        .in_("estado", list(ESTADOS_CUSTODIA_ACTIVA))
        .execute()
    )
    limite = (capacidad.data[0] if capacidad.data else {}).get("capacidad_animales") or 0
    if limite and (activas.count or len(activas.data or [])) > limite:
        raise HTTPException(status_code=409, detail="Tu capacidad actual necesita revisión")
    supabase.table("custodias_temporales").update(
        {"fecha_limite": nueva_fecha.isoformat(), "estado": "activo"}
    ).eq("id", custodia_id).execute()
    registrar_historial(
        reporte_id=custodia.data[0]["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="extension_resguardo",
        descripcion="Se amplió la fecha límite del resguardo",
        datos_extra={"nueva_fecha_limite": nueva_fecha.isoformat()},
    )
    return {"fecha_limite": nueva_fecha.isoformat(), "estado": "activo"}


@router.post("/{custodia_id}/relief", status_code=201)
def solicitar_relevo(
    custodia_id: str,
    body: SolicitudRelevoRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    custodia = (
        supabase.table("custodias_temporales").select("*").eq("id", custodia_id).limit(1).execute()
    )
    if not custodia.data or custodia.data[0]["voluntario_id"] != voluntario["id"]:
        raise HTTPException(status_code=403, detail="No puedes solicitar relevo para esta custodia")
    existente = (
        supabase.table("solicitudes_relevo")
        .select("id")
        .eq("custodia_id", custodia_id)
        .in_("estado", ["abierta", "reservada"])
        .limit(1)
        .execute()
    )
    if existente.data:
        raise HTTPException(status_code=409, detail="Ya existe una solicitud de relevo activa")
    creado = (
        supabase.table("solicitudes_relevo")
        .insert({"custodia_id": custodia_id, "solicitada_por_id": usuario["id"], "motivo": body.motivo})
        .execute()
    )
    supabase.table("custodias_temporales").update(
        {"estado": "buscando_relevo"}
    ).eq("id", custodia_id).execute()
    registrar_historial(
        reporte_id=custodia.data[0]["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="relevo_solicitado",
        descripcion="El hogar temporal solicitó un relevo",
        datos_extra={"solicitud_id": creado.data[0]["id"], "motivo": body.motivo},
    )
    return creado.data[0]


@router.post("/relief/{solicitud_id}/accept")
def aceptar_relevo(
    solicitud_id: str,
    body: AceptarRelevoRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    solicitud = (
        supabase.table("solicitudes_relevo")
        .select(
            "custodia_id, radio_actual_km, "
            "custodias_temporales(voluntario_id, reporte_id)"
        )
        .eq("id", solicitud_id)
        .limit(1)
        .execute()
    )
    if not solicitud.data:
        raise HTTPException(status_code=404, detail="Solicitud de relevo no encontrada")
    voluntario_id = (solicitud.data[0].get("custodias_temporales") or {}).get(
        "voluntario_id"
    )
    radio_relevo = float(solicitud.data[0].get("radio_actual_km") or 50)
    if not voluntario_id or not _en_radio_regional(
        asociacion, voluntario_id, radio_relevo
    ):
        raise HTTPException(status_code=403, detail="El relevo está fuera de tu región")
    try:
        resultado = supabase_admin.rpc(
            "reservar_relevo_custodia",
            {
                "p_solicitud_id": solicitud_id,
                "p_asociacion_receptora_id": asociacion["id"],
                "p_fecha_programada": body.fecha_programada.astimezone(timezone.utc).isoformat(),
            },
        ).execute()
    except Exception as error:
        if "relevo_no_disponible" in str(error):
            raise HTTPException(status_code=409, detail="El relevo ya no está disponible")
        raise
    registrar_historial(
        reporte_id=(solicitud.data[0].get("custodias_temporales") or {})["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="traslado_programado",
        descripcion="Una asociación regional reservó el relevo",
        datos_extra={
            "transferencia_id": resultado.data,
            "asociacion_receptora_id": asociacion["id"],
            "fecha_programada": body.fecha_programada.astimezone(timezone.utc).isoformat(),
        },
    )
    return {"transferencia_id": resultado.data, "estado": "traslado_programado"}


@router.post("/transfers/{transferencia_id}/confirm")
def confirmar_transferencia(
    transferencia_id: str,
    body: ConfirmarTransferenciaRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    transferencia = (
        supabase.table("transferencias_custodia")
        .select("*, custodias_temporales(voluntario_id, reporte_id)")
        .eq("id", transferencia_id)
        .limit(1)
        .execute()
    )
    if not transferencia.data:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")
    fila = transferencia.data[0]
    custodia = fila.get("custodias_temporales") or {}
    modo = None
    if usuario["rol"] == "voluntario_externo":
        voluntario = _voluntario_externo(usuario)
        if voluntario["id"] == custodia.get("voluntario_id"):
            modo = "entrega"
    elif usuario.get("asociacion_id") == fila.get("asociacion_receptora_id"):
        _asociacion_verificada(usuario)
        modo = "recepcion"
    if not modo:
        raise HTTPException(status_code=403, detail="No puedes confirmar esta transferencia")
    try:
        resultado = supabase_admin.rpc(
            "confirmar_transferencia_custodia",
            {
                "p_transferencia_id": transferencia_id,
                "p_usuario_id": usuario["id"],
                "p_modo": modo,
                "p_foto_url": body.foto_url,
                "p_latitud": body.latitud,
                "p_longitud": body.longitud,
            },
        ).execute()
    except Exception as error:
        detalle_error = str(error).lower()
        if "transferencia_no_disponible" in detalle_error:
            raise HTTPException(status_code=409, detail="La transferencia ya no está disponible")
        if "entrega_pendiente" in detalle_error:
            raise HTTPException(status_code=409, detail="El hogar temporal debe confirmar primero que realizó la entrega")
        if "confirmaciones_distantes" in detalle_error:
            raise HTTPException(
                status_code=409,
                detail="Las dos confirmaciones están a más de 200 metros. Verifiquen que ambos estén en el mismo punto de entrega.",
            )
        raise
    estado = resultado.data
    registrar_historial(
        reporte_id=custodia["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="entrega_confirmada" if estado == "confirmada" else "traslado_programado",
        descripcion="Se confirmó una parte de la transferencia de custodia",
        datos_extra={"transferencia_id": transferencia_id, "modo": modo, "estado": estado},
    )
    return {"estado": estado, "confirmacion": modo}


@router.post("/{custodia_id}/finish")
def finalizar_custodia(
    custodia_id: str,
    body: FinalizarCustodiaRequest,
    authorization: Optional[str] = Header(None),
):
    usuario = _usuario(authorization)
    asociacion = _asociacion_verificada(usuario)
    resultado = (
        supabase.table("custodias_temporales")
        .select("id, reporte_id, estado, asociacion_coordinadora_id")
        .eq("id", custodia_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Custodia no encontrada")
    custodia = resultado.data[0]
    if custodia["asociacion_coordinadora_id"] != asociacion["id"]:
        raise HTTPException(status_code=403, detail="Sólo la asociación coordinadora puede finalizar")
    if body.resolucion == "transferencia_confirmada" and custodia["estado"] != "transferido":
        raise HTTPException(status_code=409, detail="La transferencia todavía no ha sido confirmada por ambas partes")
    estado_cerrado = (
        supabase.table("reporte_estados")
        .select("id")
        .eq("clave", "cerrado")
        .limit(1)
        .execute()
    )
    if not estado_cerrado.data:
        raise HTTPException(status_code=500, detail="No se pudo resolver el estado de cierre")
    supabase.table("custodias_temporales").update(
        {"estado": "finalizado", "finalizada_at": _ahora().isoformat()}
    ).eq("id", custodia_id).execute()
    supabase.table("reportes").update(
        {
            "estado_reporte": "cerrado",
            "estado_id": estado_cerrado.data[0]["id"],
            "estado_cobertura": "finalizado",
        }
    ).eq("id", custodia["reporte_id"]).execute()
    registrar_historial(
        reporte_id=custodia["reporte_id"],
        usuario_id=usuario["id"],
        tipo_evento="custodia_finalizada",
        descripcion="La asociación coordinadora finalizó la custodia",
        datos_extra={
            "resolucion": body.resolucion,
            "referencia_proceso": body.referencia_proceso,
        },
    )
    return {"estado": "finalizado", "resolucion": body.resolucion}


def generar_notificaciones_vencimiento() -> dict:
    limite = (_ahora() + timedelta(hours=72)).isoformat()
    custodias = (
        supabase.table("custodias_temporales")
        .select("id, voluntario_id, fecha_limite, proximo_seguimiento_at")
        .in_("estado", list(ESTADOS_CUSTODIA_ACTIVA))
        .lte("fecha_limite", limite)
        .execute()
    ).data or []
    creadas = 0
    for custodia in custodias:
        voluntario = (
            supabase.table("voluntarios")
            .select("usuario_id")
            .eq("id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        if not voluntario.data or not custodia.get("fecha_limite"):
            continue
        fecha = datetime.fromisoformat(str(custodia["fecha_limite"]).replace("Z", "+00:00"))
        horas = (fecha - _ahora()).total_seconds() / 3600
        tipo = "vencimiento_24h" if horas <= 24 else "vencimiento_72h"
        try:
            supabase.table("notificaciones_custodia").upsert(
                {
                    "custodia_id": custodia["id"],
                    "usuario_id": voluntario.data[0]["usuario_id"],
                    "tipo": tipo,
                    "mensaje": f"Tu resguardo vence en aproximadamente {max(0, round(horas))} horas.",
                    "leida": False,
                    "creada_at": _ahora().isoformat(),
                },
                on_conflict="custodia_id,usuario_id,tipo",
            ).execute()
            creadas += 1
        except Exception:
            continue
    proximos = (
        supabase.table("custodias_temporales")
        .select("id, voluntario_id, proximo_seguimiento_at")
        .in_("estado", list(ESTADOS_CUSTODIA_ACTIVA))
        .lte("proximo_seguimiento_at", (_ahora() + timedelta(hours=4)).isoformat())
        .execute()
    ).data or []
    for custodia in proximos:
        voluntario = (
            supabase.table("voluntarios")
            .select("usuario_id")
            .eq("id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        if not voluntario.data or not custodia.get("proximo_seguimiento_at"):
            continue
        proximo = datetime.fromisoformat(
            str(custodia["proximo_seguimiento_at"]).replace("Z", "+00:00")
        )
        vencido = proximo <= _ahora()
        tipo = "seguimiento_vencido" if vencido else "seguimiento_proximo"
        mensaje = (
            "Tu seguimiento está vencido. Registra una actualización cuanto antes."
            if vencido
            else "Tu próximo seguimiento se habilitará dentro de las siguientes 4 horas."
        )
        try:
            supabase.table("notificaciones_custodia").upsert(
                {
                    "custodia_id": custodia["id"],
                    "usuario_id": voluntario.data[0]["usuario_id"],
                    "tipo": tipo,
                    "mensaje": mensaje,
                    "leida": False,
                    "creada_at": _ahora().isoformat(),
                },
                on_conflict="custodia_id,usuario_id,tipo",
            ).execute()
            creadas += 1
        except Exception:
            continue
    return {
        "custodias_revisadas": len(custodias) + len(proximos),
        "notificaciones_generadas": creadas,
    }


def escalar_relevos_sin_respuesta() -> dict:
    solicitudes = (
        supabase.table("solicitudes_relevo")
        .select("id, radio_actual_km, solicitada_at, ultima_ampliacion_at")
        .eq("estado", "abierta")
        .execute()
    ).data or []
    ampliadas = 0
    escaladas = 0
    ahora = _ahora()
    for solicitud in solicitudes:
        referencia = solicitud.get("ultima_ampliacion_at") or solicitud["solicitada_at"]
        fecha = datetime.fromisoformat(str(referencia).replace("Z", "+00:00"))
        if ahora - fecha < timedelta(hours=24):
            continue
        radio = int(solicitud.get("radio_actual_km") or 50)
        if radio < 300:
            supabase.table("solicitudes_relevo").update(
                {
                    "radio_actual_km": min(300, radio + 50),
                    "ultima_ampliacion_at": ahora.isoformat(),
                }
            ).eq("id", solicitud["id"]).execute()
            ampliadas += 1
        else:
            supabase.table("solicitudes_relevo").update(
                {"escalada_admin_at": ahora.isoformat()}
            ).eq("id", solicitud["id"]).execute()
            escaladas += 1
    return {"radios_ampliados": ampliadas, "escaladas_administracion": escaladas}
