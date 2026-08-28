"""Registro y validacion de avistamientos (Capa 8, Entrega A).

Publica el evento `ubicacion_confirmada` en `historial_reporte` -- es el
contrato de desbloqueo que Urgency (Capa 2) necesita para engancharse a
cambios de ubicacion confirmada del animal. El nombre y shape de ese
evento no se cambian sin avisar.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException

from app.config import settings
from app.db.supabase import supabase_admin
from app.models.dispatch import (
    AvistamientoCreate,
    AvistamientoResult,
    CoordinationEvent,
    LocationSource,
)
from app.services import matching
from app.services.coverage_service import _distancia_km

ESTADO_VOLUNTARIO_VERIFICADO = "activo_nivel_2"
ROLES_ASOCIACION = ("asociacion", "staff")
logger = logging.getLogger(__name__)


def _obtener_reporte(reporte_id: str) -> dict:
    resultado = (
        supabase_admin.table("reportes")
        .select(
            "id, usuario_id, staff_asignado_id, asociacion_asignada_id, "
            "latitud, longitud, ultima_ubicacion_confirmada_id, "
            "ultima_latitud_confirmada, ultima_longitud_confirmada"
        )
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return resultado.data[0]


def _obtener_usuario(usuario_id: str) -> dict:
    resultado = (
        supabase_admin.table("usuarios")
        .select("id, asociacion_id, roles(nombre)")
        .eq("id", usuario_id)
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


def _es_asociacion_asignada(usuario: dict, reporte: dict) -> bool:
    return (
        usuario.get("rol") in ROLES_ASOCIACION
        and usuario.get("asociacion_id") is not None
        and usuario.get("asociacion_id") == reporte.get("asociacion_asignada_id")
    )


def _ubicacion_referencia(reporte: dict) -> tuple[float, float] | None:
    """Punto contra el que se mide la cercania de un voluntario_verificado:
    la ultima ubicacion confirmada si ya existe, o el punto original del
    reporte mientras no haya ninguna todavia."""
    ultima_latitud = reporte.get("ultima_latitud_confirmada")
    ultima_longitud = reporte.get("ultima_longitud_confirmada")
    if ultima_latitud is not None and ultima_longitud is not None:
        return float(ultima_latitud), float(ultima_longitud)

    ultima_id = reporte.get("ultima_ubicacion_confirmada_id")
    if ultima_id:
        avistamiento = (
            supabase_admin.table("avistamientos_animal")
            .select("latitud, longitud")
            .eq("id", ultima_id)
            .limit(1)
            .execute()
        )
        if avistamiento.data:
            fila = avistamiento.data[0]
            return float(fila["latitud"]), float(fila["longitud"])

    if reporte.get("latitud") is not None and reporte.get("longitud") is not None:
        return float(reporte["latitud"]), float(reporte["longitud"])
    return None


def _voluntario_verificado_cerca(usuario_id: str, reporte: dict) -> bool:
    """Mismo patron que coverage_service.obtener_casos_cercanos: Haversine
    contra el radio_max_km que el propio voluntario externo declaro en sus
    capacidades. No calcula ninguna zona dinamica -- eso es Entrega B."""
    referencia = _ubicacion_referencia(reporte)
    if referencia is None:
        return False

    resultado = (
        supabase_admin.table("voluntarios")
        .select("estado, capacidades(latitud, longitud, radio_max_km)")
        .eq("usuario_id", usuario_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        return False

    perfil = resultado.data[0]
    if perfil.get("estado") != ESTADO_VOLUNTARIO_VERIFICADO:
        return False

    capacidades = perfil.get("capacidades") or {}
    if isinstance(capacidades, list):
        capacidades = capacidades[0] if capacidades else {}
    if capacidades.get("latitud") is None or capacidades.get("longitud") is None:
        return False

    radio = float(capacidades.get("radio_max_km") or matching.MAX_RADIO_KM)
    if radio <= 0:
        return False

    distancia = _distancia_km(
        float(capacidades["latitud"]),
        float(capacidades["longitud"]),
        referencia[0],
        referencia[1],
    )
    return distancia <= radio


def _resolver_fuente(reporte: dict, usuario: dict) -> LocationSource | None:
    usuario_id = usuario["id"]
    if reporte.get("usuario_id") == usuario_id:
        return LocationSource.confirmacion_reportante
    if reporte.get("staff_asignado_id") == usuario_id:
        return LocationSource.voluntario_asignado
    if _es_asociacion_asignada(usuario, reporte):
        return LocationSource.asociacion
    if _voluntario_verificado_cerca(usuario_id, reporte):
        return LocationSource.voluntario_verificado
    return None


# Fuentes a las que se les exige estar físicamente cerca del caso para poder
# INTENTAR registrar un avistamiento. asociacion / administracion / el
# voluntario ya asignado quedan exentos: pueden registrar información que
# alguien más les compartió sin estar en el lugar.
FUENTES_CON_FILTRO_ENTRADA = (
    LocationSource.confirmacion_reportante,
    LocationSource.voluntario_verificado,
)


def _distancia_a_referencia(
    reporte: dict, latitud: float, longitud: float
) -> float | None:
    """Metros entre el GPS recibido y el punto de referencia actual del reporte.

    Reusa _resolver_punto_referencia() de reports.py (la misma función que usan
    los hitos de rescate: llegada_zona_reporte, llegue_refugio, etc.) en vez de
    _ubicacion_referencia() de este módulo. Ambas resuelven al mismo punto: las
    columnas denormalizadas ultima_latitud/longitud_confirmada y la fila de
    avistamientos_animal referida por ultima_ubicacion_confirmada_id se escriben
    SIEMPRE juntas en _confirmar_avistamiento() (UPDATE atómico), así que son
    intercambiables. Se elige _resolver_punto_referencia() por consistencia con
    el resto de validaciones de cercanía del proyecto.

    Devuelve None si el reporte no tiene ningún punto contra el cual medir.
    """
    from app.api.reports import _distancia_metros, _resolver_punto_referencia

    if not reporte.get("ultima_ubicacion_confirmada_id") and (
        reporte.get("latitud") is None or reporte.get("longitud") is None
    ):
        return None

    try:
        lat_ref, lon_ref, _ = _resolver_punto_referencia(reporte)
    except (TypeError, KeyError):
        # ultima_ubicacion_confirmada_id colgado y sin pin original: nada contra
        # qué medir.
        return None
    return _distancia_metros(latitud, longitud, lat_ref, lon_ref)


def _validar_cercania_entrada(
    reporte: dict, fuente: LocationSource, latitud: float, longitud: float
) -> None:
    """Rechaza con 422 si la fuente exige cercanía y el GPS recibido está más
    lejos del caso que settings.radio_entrada_avistamiento_metros."""
    if fuente not in FUENTES_CON_FILTRO_ENTRADA:
        return

    distancia = _distancia_a_referencia(reporte, latitud, longitud)
    if distancia is None:
        return

    radio = settings.radio_entrada_avistamiento_metros
    if distancia > radio:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Debes estar dentro de {radio} metros del caso para registrar "
                f"un avistamiento. Estás a {round(distancia)} metros."
            ),
        )


def evaluar_elegibilidad(
    reporte_id: str, usuario_id: str, latitud: float, longitud: float
) -> dict:
    """Elegibilidad del usuario autenticado para registrar un avistamiento en
    este reporte desde el GPS dado. La Pantalla A (frontend) la consulta para
    mostrar/ocultar el botón sin duplicar el cálculo de distancia."""
    reporte = _obtener_reporte(reporte_id)
    usuario = _obtener_usuario(usuario_id)

    fuente = _resolver_fuente(reporte, usuario)
    if fuente is None:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para registrar un avistamiento en este reporte",
        )

    radio = settings.radio_entrada_avistamiento_metros
    if fuente not in FUENTES_CON_FILTRO_ENTRADA:
        return {"elegible": True, "motivo": None, "fuente": fuente.value}

    distancia = _distancia_a_referencia(reporte, latitud, longitud)
    if distancia is None:
        # Sin punto de referencia no se puede filtrar por distancia; se permite.
        return {"elegible": True, "motivo": None, "fuente": fuente.value}

    return {
        "elegible": distancia <= radio,
        "distancia_metros": round(distancia, 1),
        "radio_metros": radio,
        "fuente": fuente.value,
    }


# --- Auto-validacion combinada (Fase 3) ------------------------------------
#
# Condicion 1 (fuente oficial) la resuelve el flujo existente ANTES de que
# nada de esto corra: `animal_encontrado` entra por
# registrar_avistamiento_desde_hito (ya validado), y asociacion/
# administracion se insertan validados desde registrar_avistamiento. Lo de
# abajo solo aplica a los que llegan como 'pendiente' por defecto, es decir
# reportante del caso y voluntario verificado cercano.

MOTIVO_TRUST_Y_RADIO = "trust_score_y_radio"
MOTIVO_CORROBORACION = "corroboracion"

# Rol con el que se consulta trust_score segun quien registra. Son los
# valores reales del CHECK de trust_score.rol (migracion 0047).
ROL_TRUST_POR_FUENTE = {
    LocationSource.confirmacion_reportante: "reportante",
    LocationSource.voluntario_verificado: "voluntario_externo",
}

ESTADOS_CORROBORABLES = ["pendiente", "validado"]


def _a_utc(valor: str | datetime) -> datetime:
    """Normaliza un observado_at (ISO de PostgREST o datetime del cliente) a
    UTC consciente de zona, para poder restar dos fechas sin que una naive y
    una aware revienten."""
    if isinstance(valor, str):
        fecha = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    else:
        fecha = valor
    if fecha.tzinfo is None:
        return fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc)


def _cumple_trust_y_radio(
    reporte: dict, avistamiento_nuevo: dict, latitud: float, longitud: float
) -> bool:
    """Condicion 2: trust score >= umbral Y distancia al punto de referencia
    del caso <= radio de coherencia. Las dos juntas, no una sola."""
    try:
        fuente = LocationSource(avistamiento_nuevo["fuente"])
    except (KeyError, ValueError):
        return False

    rol = ROL_TRUST_POR_FUENTE.get(fuente)
    usuario_id = avistamiento_nuevo.get("usuario_id")
    if rol is None or not usuario_id:
        return False

    # consultar_restricciones no atrapa sus propias excepciones: si la
    # consulta a trust_score falla, la deja subir. Aqui se degrada a "no
    # auto-valida" para que un problema del motor de reputacion nunca tumbe
    # el registro de un avistamiento -- mismo criterio fail-safe que el
    # resto del modulo.
    try:
        from app.services.reputacion_service import consultar_restricciones

        puntaje = int(consultar_restricciones(usuario_id, rol)["puntaje"])
    except Exception:
        logger.warning(
            "No se pudo consultar el trust score de %s (rol=%s); el "
            "avistamiento queda pendiente",
            usuario_id,
            rol,
            exc_info=True,
        )
        return False

    if puntaje < settings.trust_score_minimo_auto_validacion:
        return False

    distancia = _distancia_a_referencia(reporte, latitud, longitud)
    if distancia is None:
        return False
    return distancia <= settings.radio_coherencia_avistamiento_metros


def _buscar_corroboracion(
    avistamiento_nuevo: dict, latitud: float, longitud: float
) -> dict | None:
    """Condicion 3: otro avistamiento del MISMO animal, todavia vigente
    (pendiente o validado), que caiga dentro de AMBAS ventanas -- distancia
    y tiempo. Con una sola coincidencia basta; se devuelve la primera."""
    from app.api.reports import _distancia_metros

    animal_id = avistamiento_nuevo.get("animal_id")
    observado_at = avistamiento_nuevo.get("observado_at")
    if not animal_id or not observado_at:
        return None

    try:
        momento_nuevo = _a_utc(observado_at)
    except (TypeError, ValueError):
        return None

    candidatos = (
        supabase_admin.table("avistamientos_animal")
        .select("id, latitud, longitud, observado_at, estado_validacion")
        .eq("animal_id", animal_id)
        .neq("id", avistamiento_nuevo["id"])
        .in_("estado_validacion", ESTADOS_CORROBORABLES)
        .execute()
    )

    radio = settings.radio_corroboracion_avistamiento_metros
    ventana = settings.ventana_corroboracion_avistamiento_minutos
    for fila in candidatos.data or []:
        if fila.get("latitud") is None or fila.get("longitud") is None:
            continue
        distancia = _distancia_metros(
            latitud, longitud, float(fila["latitud"]), float(fila["longitud"])
        )
        if distancia > radio:
            continue
        try:
            minutos = abs(
                (momento_nuevo - _a_utc(fila["observado_at"])).total_seconds()
            ) / 60
        except (KeyError, TypeError, ValueError):
            continue
        if minutos > ventana:
            continue
        return fila
    return None


def _validar_condiciones_auto_validacion(
    reporte: dict, avistamiento_nuevo: dict
) -> tuple[bool, str | None]:
    """Decide si un avistamiento recien insertado como 'pendiente' se
    auto-valida. Retorna (se_auto_valida, motivo) -- motivo para
    logging/auditoria: MOTIVO_TRUST_Y_RADIO, MOTIVO_CORROBORACION, o None
    si queda pendiente.

    NO reevalua la condicion 1 (fuente oficial): esos avistamientos ya
    entraron validados y nunca llegan aqui.

    EFECTO LATERAL en el camino de corroboracion: cuando encuentra un
    avistamiento que corrobora, promueve TAMBIEN a ese a 'validado' antes
    de retornar -- la regla es que ambos se validan juntos, y hacerlo aqui
    evita repetir la busqueda desde el llamador.
    """
    latitud = avistamiento_nuevo.get("latitud")
    longitud = avistamiento_nuevo.get("longitud")
    if latitud is None or longitud is None:
        return False, None
    latitud = float(latitud)
    longitud = float(longitud)

    if _cumple_trust_y_radio(reporte, avistamiento_nuevo, latitud, longitud):
        return True, MOTIVO_TRUST_Y_RADIO

    corroborante = _buscar_corroboracion(avistamiento_nuevo, latitud, longitud)
    if corroborante is not None:
        if corroborante.get("estado_validacion") == "pendiente":
            supabase_admin.table("avistamientos_animal").update(
                {"estado_validacion": "validado"}
            ).eq("id", corroborante["id"]).eq(
                "estado_validacion", "pendiente"
            ).execute()
        return True, MOTIVO_CORROBORACION

    return False, None


def _superar_pendientes_del_caso(
    *, reporte_id: str, animal_id: str | None, avistamiento_id: str
) -> list[str]:
    """Marca como 'superado_por_otro' los avistamientos que seguian
    pendientes cuando este gano.

    Alcance deliberadamente hibrido: en un reporte de un solo animal barre
    todo el reporte (todos los pendientes competian por la misma ubicacion).
    En un reporte multi-animal se limita al mismo animal_id -- aprobar un
    avistamiento del perro no puede descartar en silencio los del gato, que
    no lo contradicen. La ambiguedad multi-animal ya esta reconocida en el
    codigo (ver el [WARN] de reports.py al derivar avistamientos de hitos).
    """
    animales = (
        supabase_admin.table("animal")
        .select("id")
        .eq("reporte_id", reporte_id)
        .limit(2)
        .execute()
    )
    es_mono_animal = len(animales.data or []) <= 1

    consulta = (
        supabase_admin.table("avistamientos_animal")
        .update({"estado_validacion": "superado_por_otro"})
        .eq("reporte_id", reporte_id)
        .eq("estado_validacion", "pendiente")
        .neq("id", avistamiento_id)
    )
    if not es_mono_animal and animal_id:
        consulta = consulta.eq("animal_id", animal_id)

    resultado = consulta.execute()
    return [fila["id"] for fila in (resultado.data or []) if fila.get("id")]


def _a_resultado(fila: dict) -> AvistamientoResult:
    return AvistamientoResult(
        id=fila["id"],
        reporte_id=fila["reporte_id"],
        animal_id=fila["animal_id"],
        fuente=LocationSource(fila["fuente"]),
        estado_validacion=fila["estado_validacion"],
        registrado_at=fila["registrado_at"],
    )


def _emitir_ubicacion_confirmada(
    *,
    reporte_id: str,
    avistamiento_id: str,
    latitud: float,
    longitud: float,
    fuente: LocationSource,
) -> None:
    supabase_admin.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": None,
            "tipo_evento": CoordinationEvent.ubicacion_confirmada.value,
            "descripcion": "Se confirmó una nueva ubicación del animal.",
            "datos_extra": {
                "avistamiento_id": avistamiento_id,
                "latitud": latitud,
                "longitud": longitud,
                "fuente": fuente.value,
            },
        }
    ).execute()


def _datos_para_duplicados(
    reporte_id: str,
) -> tuple[list[str], int, str] | None:
    """Especies (claves de tipo_animal_catalogo), cantidad total y
    created_at del reporte -- lo que exige DuplicateSearchInput mas alla de
    la ubicacion. created_at es el del reporte original, no el momento de
    esta confirmacion: buscar_duplicados_geograficos (migracion 0060) filtra
    candidatos por una ventana de +-120min alrededor de ese valor, y un
    avistamiento puede confirmarse horas despues de creado el reporte."""
    resultado = (
        supabase_admin.table("reportes")
        .select("created_at, animal(tipo_animal_catalogo(clave), cantidad)")
        .eq("id", reporte_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        return None

    fila = resultado.data[0]
    animales = fila.get("animal") or []
    especies = list(
        dict.fromkeys(
            (animal.get("tipo_animal_catalogo") or {}).get("clave")
            for animal in animales
            if (animal.get("tipo_animal_catalogo") or {}).get("clave")
        )
    )
    if not especies or not fila.get("created_at"):
        return None

    cantidad = sum(animal.get("cantidad") or 1 for animal in animales)
    return especies, cantidad, fila["created_at"]


def _detectar_posibles_duplicados(
    *,
    reporte_id: str,
    avistamiento_id: str,
    latitud: float,
    longitud: float,
) -> None:
    from app.models.urgency import DuplicateSearchInput
    from app.services.duplicate_service import find_geographic_duplicates

    datos = _datos_para_duplicados(reporte_id)
    if datos is None:
        return
    especies, cantidad, created_at = datos

    busqueda = DuplicateSearchInput(
        latitude=latitud,
        longitude=longitud,
        created_at=created_at,
        species=especies,
        quantity=cantidad,
        report_id=reporte_id,
    )
    duplicados = find_geographic_duplicates(busqueda)
    if not duplicados:
        return

    supabase_admin.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": None,
            "tipo_evento": CoordinationEvent.posible_duplicado_detectado.value,
            "descripcion": (
                "Se detectaron posibles duplicados tras confirmar una "
                "nueva ubicación."
            ),
            "datos_extra": {
                "avistamiento_id": avistamiento_id,
                "candidatos": [
                    {
                        "reporte_id": candidato.existing_report_id,
                        "distancia_m": candidato.distance_m,
                        "diferencia_minutos": candidato.time_difference_minutes,
                        "especies_compartidas": candidato.shared_species,
                    }
                    for candidato in duplicados
                ],
            },
        }
    ).execute()


def _recalcular_urgency(*, reporte_id: str, avistamiento_id: str) -> None:
    from app.services.urgency_service import evaluate_report_urgency

    resultado = evaluate_report_urgency(reporte_id)
    supabase_admin.table("historial_reporte").insert(
        {
            "reporte_id": reporte_id,
            "usuario_id": None,
            "tipo_evento": CoordinationEvent.urgency_recalculada.value,
            "descripcion": "Urgency se recalculó tras confirmar una nueva ubicación.",
            "datos_extra": {
                "avistamiento_id": avistamiento_id,
                "score": resultado.score,
                "nivel": resultado.level,
            },
        }
    ).execute()


def _notificar_voluntario_ubicacion_actualizada(
    *, reporte_id: str, avistamiento_id: str, staff_asignado_id: str | None
) -> None:
    """Encola un push para el voluntario asignado cuando alguien MÁS confirma
    una nueva ubicación del caso que él va atendiendo -- desde Fase 1 ya no
    puede registrar avistamientos él mismo, así que sin este aviso llegaría
    al punto viejo sin saber por qué `llegada_zona_reporte` lo rechaza.

    Solo encola (estado 'pendiente'); el envío real lo hace
    /internal/push/run. Sin voluntario asignado no hace nada -- es el caso
    normal, no un error.
    """
    if not staff_asignado_id:
        return

    from app.services.push_notification_service import queue_and_send_push

    queue_and_send_push(
        usuario_id=staff_asignado_id,
        tipo_evento="ubicacion_actualizada",
        idempotency_key=(
            f"ubicacion_actualizada:{avistamiento_id}:{staff_asignado_id}"
        ),
        payload={
            "mensaje": (
                "La ubicación del caso que atiendes cambió. Revísala antes "
                "de seguir en camino."
            ),
            "reporte_id": reporte_id,
        },
        reporte_id=reporte_id,
    )


def _confirmar_avistamiento(
    *,
    reporte_id: str,
    avistamiento_id: str,
    latitud: float,
    longitud: float,
    fuente: LocationSource,
    staff_asignado_id: str | None = None,
) -> None:
    supabase_admin.table("reportes").update(
        {
            "ultima_ubicacion_confirmada_id": avistamiento_id,
            "ultima_latitud_confirmada": latitud,
            "ultima_longitud_confirmada": longitud,
        }
    ).eq("id", reporte_id).execute()
    _emitir_ubicacion_confirmada(
        reporte_id=reporte_id,
        avistamiento_id=avistamiento_id,
        latitud=latitud,
        longitud=longitud,
        fuente=fuente,
    )
    try:
        from app.services.assignment_route_service import (
            recalculate_confirmed_assignment_route,
        )

        recalculate_confirmed_assignment_route(reporte_id)
    except Exception:
        logger.warning(
            "No se pudo recalcular la ruta del reporte %s tras confirmar "
            "una ubicacion",
            reporte_id,
            exc_info=True,
        )

    try:
        _detectar_posibles_duplicados(
            reporte_id=reporte_id,
            avistamiento_id=avistamiento_id,
            latitud=latitud,
            longitud=longitud,
        )
    except Exception:
        logger.warning(
            "No se pudo detectar duplicados del reporte %s tras confirmar "
            "una ubicacion",
            reporte_id,
            exc_info=True,
        )

    try:
        _recalcular_urgency(reporte_id=reporte_id, avistamiento_id=avistamiento_id)
    except Exception:
        logger.warning(
            "No se pudo recalcular urgency del reporte %s tras confirmar "
            "una ubicacion",
            reporte_id,
            exc_info=True,
        )

    try:
        _notificar_voluntario_ubicacion_actualizada(
            reporte_id=reporte_id,
            avistamiento_id=avistamiento_id,
            staff_asignado_id=staff_asignado_id,
        )
    except Exception:
        logger.warning(
            "No se pudo encolar la notificacion de cambio de ubicacion del "
            "reporte %s para el voluntario asignado",
            reporte_id,
            exc_info=True,
        )


def autorizar_subida_evidencia(reporte_id: str, usuario_id: str) -> None:
    """Autoriza subir una foto de evidencia para un avistamiento de este
    reporte. Misma regla de acceso que `registrar_avistamiento`: si el usuario
    no es una fuente valida (`_resolver_fuente`), no puede subir la foto."""
    reporte = _obtener_reporte(reporte_id)
    usuario = _obtener_usuario(usuario_id)
    if _resolver_fuente(reporte, usuario) is None:
        raise HTTPException(
            status_code=403,
            detail=(
                "No tienes permiso para registrar un avistamiento en este "
                "reporte"
            ),
        )


def _vincular_evidencia_avistamiento(
    *,
    evidencia_id: str,
    reporte_id: str,
    usuario_id: str,
    latitud: float,
    longitud: float,
) -> None:
    """Vincula y verifica una evidencia fotografica ya subida contra el GPS
    del avistamiento. Reusa el helper de la API de hitos -- la columna
    `tipo_hito` de `reporte_evidencias` guarda 'avistamiento' en este caso."""
    from app.api.reports import _vincular_y_verificar_evidencia

    _vincular_y_verificar_evidencia(
        evidencia_id=evidencia_id,
        reporte_id=reporte_id,
        usuario_id=usuario_id,
        tipo_hito="avistamiento",
        foto_url=None,
        latitud_declarada=latitud,
        longitud_declarada=longitud,
    )


def registrar_avistamiento(
    reporte_id: str, usuario_id: str, data: AvistamientoCreate
) -> AvistamientoResult:
    reporte = _obtener_reporte(reporte_id)
    usuario = _obtener_usuario(usuario_id)

    fuente = _resolver_fuente(reporte, usuario)
    if fuente is None:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para registrar un avistamiento en este reporte",
        )

    _validar_cercania_entrada(reporte, fuente, data.latitud, data.longitud)

    animal = (
        supabase_admin.table("animal")
        .select("id")
        .eq("id", data.animal_id)
        .eq("reporte_id", reporte_id)
        .limit(1)
        .execute()
    )
    if not animal.data:
        raise HTTPException(
            status_code=422,
            detail="El animal indicado no pertenece a este reporte",
        )

    # Se vincula ANTES del insert: si la evidencia no existe / no es de este
    # reporte / ya fue usada, el avistamiento no llega a crearse.
    if data.evidencia_id:
        _vincular_evidencia_avistamiento(
            evidencia_id=data.evidencia_id,
            reporte_id=reporte_id,
            usuario_id=usuario_id,
            latitud=data.latitud,
            longitud=data.longitud,
        )

    auto_validado = fuente in (
        LocationSource.asociacion,
        LocationSource.administracion,
    )
    insertado = (
        supabase_admin.table("avistamientos_animal")
        .insert(
            {
                "reporte_id": reporte_id,
                "animal_id": data.animal_id,
                "latitud": data.latitud,
                "longitud": data.longitud,
                "precision_metros": data.precision_metros,
                "observado_at": data.observado_at.isoformat(),
                "fuente": fuente.value,
                "usuario_id": usuario_id,
                "movilidad_observada": (
                    data.movilidad_observada.value
                    if data.movilidad_observada
                    else None
                ),
                "direccion_observada": data.direccion_observada,
                "comentario": data.comentario,
                "evidencia_id": data.evidencia_id,
                "estado_validacion": "validado" if auto_validado else "pendiente",
            }
        )
        .execute()
    )
    if not insertado.data:
        raise HTTPException(
            status_code=500, detail="No se pudo registrar el avistamiento"
        )

    fila = insertado.data[0]
    if auto_validado:
        _confirmar_avistamiento(
            reporte_id=reporte_id,
            avistamiento_id=fila["id"],
            latitud=data.latitud,
            longitud=data.longitud,
            fuente=fuente,
            staff_asignado_id=reporte.get("staff_asignado_id"),
        )
        return _a_resultado(fila)

    # Condiciones 2 y 3 (Fase 3): la fila ya existe como 'pendiente'; si
    # alguna se cumple, se promueve aqui. Nunca debe tumbar el registro --
    # un fallo evaluando las condiciones deja el avistamiento pendiente,
    # que es exactamente donde ya estaba.
    try:
        se_auto_valida, motivo = _validar_condiciones_auto_validacion(
            reporte, fila
        )
    except Exception:
        logger.warning(
            "No se pudieron evaluar las condiciones de auto-validacion del "
            "avistamiento %s; queda pendiente",
            fila["id"],
            exc_info=True,
        )
        return _a_resultado(fila)

    if not se_auto_valida:
        return _a_resultado(fila)

    promovido = (
        supabase_admin.table("avistamientos_animal")
        .update({"estado_validacion": "validado"})
        .eq("id", fila["id"])
        .eq("estado_validacion", "pendiente")
        .execute()
    )
    if not promovido.data:
        # Alguien lo resolvio entre el INSERT y este UPDATE; se respeta lo
        # que haya quedado en la base en vez de pisarlo.
        return _a_resultado(fila)

    logger.info(
        "Avistamiento %s auto-validado (motivo=%s)", fila["id"], motivo
    )
    fila["estado_validacion"] = "validado"
    _confirmar_avistamiento(
        reporte_id=reporte_id,
        avistamiento_id=fila["id"],
        latitud=data.latitud,
        longitud=data.longitud,
        fuente=fuente,
        staff_asignado_id=reporte.get("staff_asignado_id"),
    )
    return _a_resultado(fila)


def validar_avistamiento(
    avistamiento_id: str, usuario_id: str, aprobar: bool
) -> AvistamientoResult:
    resultado = (
        supabase_admin.table("avistamientos_animal")
        .select(
            "id, reporte_id, animal_id, fuente, estado_validacion, "
            "latitud, longitud, registrado_at"
        )
        .eq("id", avistamiento_id)
        .limit(1)
        .execute()
    )
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Avistamiento no encontrado")
    avistamiento = resultado.data[0]

    reporte = _obtener_reporte(avistamiento["reporte_id"])
    usuario = _obtener_usuario(usuario_id)

    es_staff_asignado = reporte.get("staff_asignado_id") == usuario_id
    if not es_staff_asignado and not _es_asociacion_asignada(usuario, reporte):
        raise HTTPException(
            status_code=403,
            detail=(
                "Solo el staff o la asociación asignada pueden validar "
                "este avistamiento"
            ),
        )

    if avistamiento["estado_validacion"] != "pendiente":
        raise HTTPException(
            status_code=409, detail="Este avistamiento ya fue resuelto"
        )

    nuevo_estado = "validado" if aprobar else "rechazado"
    actualizado = (
        supabase_admin.table("avistamientos_animal")
        .update({"estado_validacion": nuevo_estado})
        .eq("id", avistamiento_id)
        .eq("estado_validacion", "pendiente")
        .execute()
    )
    if not actualizado.data:
        raise HTTPException(
            status_code=409, detail="Este avistamiento ya fue resuelto"
        )

    if aprobar:
        # Los demas pendientes del caso dejan de estar en espera: este gano.
        # Secundario al hecho principal (la aprobacion), asi que un fallo
        # aqui se loguea pero no revierte ni bloquea la aprobacion.
        try:
            _superar_pendientes_del_caso(
                reporte_id=avistamiento["reporte_id"],
                animal_id=avistamiento.get("animal_id"),
                avistamiento_id=avistamiento_id,
            )
        except Exception:
            logger.warning(
                "No se pudieron marcar como superados los pendientes del "
                "reporte %s tras aprobar el avistamiento %s",
                avistamiento["reporte_id"],
                avistamiento_id,
                exc_info=True,
            )

        _confirmar_avistamiento(
            reporte_id=avistamiento["reporte_id"],
            avistamiento_id=avistamiento_id,
            latitud=avistamiento["latitud"],
            longitud=avistamiento["longitud"],
            fuente=LocationSource(avistamiento["fuente"]),
            staff_asignado_id=reporte.get("staff_asignado_id"),
        )

    avistamiento["estado_validacion"] = nuevo_estado
    return _a_resultado(avistamiento)


def registrar_avistamiento_desde_hito(
    *,
    reporte_id: str,
    animal_id: str,
    usuario_id: str,
    latitud: float,
    longitud: float,
    tipo_hito: str,
    direccion_observada: str | None = None,
    evidencia_id: str | None = None,
) -> AvistamientoResult:
    """Avistamiento derivado de un hito de rescate ya registrado -- quien lo
    dispara ya es el voluntario asignado al caso, así que se inserta
    validado de inmediato, sin pasar por aprobación manual.

    `direccion_observada` solo lo pasa 'animal_no_localizado' (hacia dónde
    vio moverse el voluntario al animal antes de perderlo). 'animal_encontrado'
    no lo pasa y la columna queda NULL, igual que hasta ahora.

    `evidencia_id` es la foto que el voluntario subió al registrar el hito
    (`HitoRequest.evidencia_id`). Ya quedó vinculada y verificada contra el
    GPS del hito en `registrar_hito` -> `_vincular_y_verificar_evidencia`, y
    el hito comparte lat/lon con este avistamiento, así que aquí solo se
    copia la referencia sin re-verificar (evitando el 409 de "ya vinculada").
    """
    ahora = datetime.now(timezone.utc).isoformat()
    insertado = (
        supabase_admin.table("avistamientos_animal")
        .insert(
            {
                "reporte_id": reporte_id,
                "animal_id": animal_id,
                "latitud": latitud,
                "longitud": longitud,
                "observado_at": ahora,
                "fuente": LocationSource.voluntario_asignado.value,
                "usuario_id": usuario_id,
                "direccion_observada": direccion_observada,
                "evidencia_id": evidencia_id,
                "comentario": f"Registrado automáticamente desde el hito '{tipo_hito}'.",
                "estado_validacion": "validado",
            }
        )
        .execute()
    )
    if not insertado.data:
        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar el avistamiento derivado del hito",
        )

    fila = insertado.data[0]
    _confirmar_avistamiento(
        reporte_id=reporte_id,
        avistamiento_id=fila["id"],
        latitud=latitud,
        longitud=longitud,
        fuente=LocationSource.voluntario_asignado,
        # staff_asignado_id se omite a proposito: en este camino quien dispara
        # ES el voluntario asignado (lo garantiza registrar_hito), asi que
        # notificarlo del cambio que el mismo causo seria ruido.
    )
    return _a_resultado(fila)
