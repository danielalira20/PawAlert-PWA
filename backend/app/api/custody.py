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
)
from app.services.report_service import registrar_historial
from app.services.custody_vision_service import analizar_evidencia_custodia
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


@router.get("/me")
def listar_mis_custodias(authorization: Optional[str] = Header(None)):
    usuario = _usuario(authorization)
    voluntario = _voluntario_externo(usuario)
    custodias = (
        supabase.table("custodias_temporales")
        .select("*")
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

    seguimiento_anterior = _ultimo_seguimiento(custodia_id)
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
                "gemini_analisis": {"estado": "procesando"},
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
    try:
        analisis = analizar_evidencia_custodia(
            body.foto_url,
            (seguimiento_anterior or {}).get("foto_url"),
            body.entorno_foto_url,
        )
    except Exception as error:
        analisis = {
            "estado": "error",
            "detalle": str(error)[:200],
            "requiere_revision_humana": True,
        }
    supabase.table("seguimientos_resguardo").update(
        {"gemini_analisis": analisis}
    ).eq("id", insertado.data[0]["id"]).execute()
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
    if asociacion.get("latitud") is None or asociacion.get("longitud") is None:
        raise HTTPException(status_code=409, detail="La asociación no tiene ubicación configurada")
    custodias = (
        supabase.table("custodias_temporales")
        .select("*")
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
            .select("latitud, longitud")
            .eq("voluntario_id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        if not perfil.data or perfil.data[0].get("latitud") is None:
            continue
        distancia = _distancia_km(
            asociacion["latitud"],
            asociacion["longitud"],
            perfil.data[0]["latitud"],
            perfil.data[0]["longitud"],
        )
        if distancia > radio_efectivo:
            continue
        voluntario = (
            supabase.table("voluntarios")
            .select("usuarios(nombre, apellido_paterno)")
            .eq("id", custodia["voluntario_id"])
            .limit(1)
            .execute()
        )
        persona = ((voluntario.data[0] if voluntario.data else {}).get("usuarios") or {})
        ultimo = _ultimo_seguimiento(custodia["id"])
        tarjetas.append(
            {
                **custodia,
                "reporte": _reporte_resumen(custodia["reporte_id"]),
                "voluntario_nombre": " ".join(
                    p for p in (persona.get("nombre"), persona.get("apellido_paterno")) if p
                ),
                "distancia_km": round(distancia, 1),
                "ultimo_seguimiento": ultimo,
                "solicitud_relevo": relevo_activo,
                "transferencia_activa": _transferencia_activa(custodia["id"]),
                "es_coordinadora": custodia["asociacion_coordinadora_id"] == asociacion["id"],
            }
        )
    return {"radio_km": radio_km, "custodias": tarjetas}


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
    insertado = (
        supabase.table("validaciones_seguimiento")
        .upsert(
            {
                "seguimiento_id": seguimiento_id,
                "asociacion_id": asociacion["id"],
                "usuario_id": usuario["id"],
                "decision": body.decision,
                "comentario": body.comentario,
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
        if "transferencia_no_disponible" in str(error):
            raise HTTPException(status_code=409, detail="La transferencia ya no está disponible")
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
