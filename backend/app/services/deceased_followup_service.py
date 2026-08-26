import logging
from datetime import datetime, timezone
from typing import Any

from app.db.supabase import supabase_admin
from app.models.report import (
    RevisionResultadoSinVidaRequest,
    SeguimientoRetiroAnimalRequest,
)
from app.services.storage_service import crear_url_firmada_sensible
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response


ESTADOS_SEGUIMIENTO_ABIERTOS = (
    "pendiente_voluntario",
    "pendiente_asociacion",
    "escalado_administracion",
)

logger = logging.getLogger(__name__)

ERRORES_REVISION_CONOCIDOS = (
    "decision_revision_invalida",
    "notas_revision_requeridas",
    "seguimiento_no_autorizado",
    "reporte_no_encontrado",
    "resultado_no_encontrado",
    "revision_duda_no_reversible",
    "seguimiento_ya_reactivado",
    "reporte_no_disponible_para_reactivar",
    "asociacion_coordinadora_requerida",
    "estado_asignado_no_encontrado",
    "seguimiento_no_preparado_para_reactivar",
    "reporte_no_preparado_para_reactivar",
    "urgency_recalculada_requerida",
)

ERRORES_SEGUIMIENTO_RETIRO_CONOCIDOS = (
    "tipo_actor_seguimiento_invalido",
    "accion_seguimiento_invalida",
    "idempotency_key_requerida",
    "idempotency_key_en_conflicto",
    "nombre_servicio_requerido",
    "seguimiento_fallecimiento_no_encontrado",
    "seguimiento_fallecimiento_no_disponible",
    "resultado_seguimiento_no_encontrado",
    "resultado_reactivado_no_admite_seguimiento",
    "voluntario_seguimiento_no_autorizado",
    "asociacion_seguimiento_no_autorizada",
    "evidencia_seguimiento_no_disponible",
    "evidencia_seguimiento_en_conflicto",
)


class SeguimientoFallecimientoError(Exception):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(codigo)


def _ejecutar_rpc(nombre: str, parametros: dict) -> Any:
    try:
        respuesta = supabase_admin.rpc(nombre, parametros).execute()
    except Exception as error:
        detalle = str(error).lower()
        for codigo in ERRORES_REVISION_CONOCIDOS:
            if codigo in detalle:
                raise SeguimientoFallecimientoError(codigo) from error
        raise SeguimientoFallecimientoError(
            "revision_fallecimiento_no_disponible"
        ) from error

    datos = respuesta.data
    if isinstance(datos, list):
        datos = datos[0] if datos else None
    return datos


def revisar_resultado(
    reporte_id: str,
    resultado_id: str,
    usuario_id: str,
    asociacion_id: str,
    body: RevisionResultadoSinVidaRequest,
) -> dict:
    datos = _ejecutar_rpc(
        "revisar_resultado_rescate_sin_vida",
        {
            "p_reporte_id": reporte_id,
            "p_resultado_id": resultado_id,
            "p_usuario_id": usuario_id,
            "p_asociacion_id": asociacion_id,
            "p_decision": body.decision,
            "p_notas": body.notas.strip(),
        },
    )
    if not isinstance(datos, dict) or datos.get("reporte_id") != reporte_id:
        raise SeguimientoFallecimientoError("respuesta_revision_invalida")

    if not datos.get("requiere_reactivacion"):
        return datos

    try:
        from app.services.urgency_service import evaluate_report_urgency

        evaluate_report_urgency(reporte_id)
    except Exception as error:
        logger.warning(
            "La duda del reporte %s quedó pendiente de recalcular Urgency: %s",
            reporte_id,
            type(error).__name__,
        )
        raise SeguimientoFallecimientoError(
            "reactivacion_urgency_pendiente"
        ) from error

    datos.update(finalizar_reactivacion_pendiente(reporte_id))
    return datos


def registrar_seguimiento_retiro(
    reporte_id: str,
    resultado_id: str,
    usuario_id: str,
    tipo_actor: str,
    asociacion_id: str | None,
    body: SeguimientoRetiroAnimalRequest,
) -> dict:
    parametros = {
        "p_reporte_id": reporte_id,
        "p_resultado_id": resultado_id,
        "p_usuario_id": usuario_id,
        "p_tipo_actor": tipo_actor,
        "p_asociacion_id": asociacion_id,
        "p_accion": body.accion,
        "p_idempotency_key": body.idempotency_key,
        "p_folio": body.folio,
        "p_nombre_servicio": body.nombre_servicio,
        "p_destino_informado": body.destino_informado,
        "p_nota": body.nota,
        "p_evidencia_lugar_id": (
            str(body.evidencia_lugar_id)
            if body.evidencia_lugar_id
            else None
        ),
    }
    try:
        respuesta = supabase_admin.rpc(
            "registrar_seguimiento_retiro_animal",
            parametros,
        ).execute()
    except Exception as error:
        detalle = str(error).lower()
        for codigo in ERRORES_SEGUIMIENTO_RETIRO_CONOCIDOS:
            if codigo in detalle:
                raise SeguimientoFallecimientoError(codigo) from error
        raise SeguimientoFallecimientoError(
            "registro_seguimiento_retiro_no_disponible"
        ) from error

    datos = respuesta.data
    if isinstance(datos, list):
        datos = datos[0] if datos else None
    if (
        not isinstance(datos, dict)
        or datos.get("reporte_id") != reporte_id
        or datos.get("resultado_id") != resultado_id
    ):
        raise SeguimientoFallecimientoError(
            "respuesta_seguimiento_retiro_invalida"
        )
    return datos


def finalizar_reactivacion_pendiente(reporte_id: str) -> dict:
    activacion = _ejecutar_rpc(
        "finalizar_reactivacion_duda_fallecimiento",
        {"p_reporte_id": reporte_id},
    )
    if not isinstance(activacion, dict):
        raise SeguimientoFallecimientoError("respuesta_reactivacion_invalida")

    matching_status = "completo"
    candidatos = 0
    try:
        from app.services import matching

        resultado_matching = matching.obtener_candidatos(reporte_id)
        candidatos = len(resultado_matching.get("candidatos") or [])
        if candidatos:
            supabase_admin.table("reportes").update({
                "candidatos_presentados_at": datetime.now(
                    timezone.utc
                ).isoformat()
            }).eq("id", reporte_id).execute()
    except Exception as error:
        matching_status = "pendiente_reintento"
        logger.warning(
            "El reporte %s se reactivó, pero matching quedó pendiente: %s",
            reporte_id,
            type(error).__name__,
        )

    return {
        "reactivacion": activacion,
        "matching_status": matching_status,
        "candidatos_calculados": candidatos,
    }


def _obtener_seguimiento_autorizado(
    reporte_id: str,
    asociacion_id: str,
) -> dict:
    consulta = (
        supabase_admin.table("seguimientos_fallecimiento_reporte")
        .select(
            "id, reporte_id, asociacion_coordinadora_id, estado, iniciado_at, "
            "asociacion_deadline_at, administracion_deadline_at, "
            "resultado_final, conclusion_rescate, cerrado_at, actualizado_at"
        )
        .eq("reporte_id", reporte_id)
        .eq("asociacion_coordinadora_id", asociacion_id)
        .execute()
    )
    if not consulta.data:
        raise SeguimientoFallecimientoError("seguimiento_no_encontrado")
    return consulta.data[0]


def listar_seguimientos_asociacion(asociacion_id: str) -> list[dict]:
    resultado = (
        supabase_admin.table("seguimientos_fallecimiento_reporte")
        .select(
            "id, reporte_id, estado, iniciado_at, asociacion_deadline_at, "
            "administracion_deadline_at, actualizado_at, "
            "reportes(municipio, colonia, created_at)"
        )
        .eq("asociacion_coordinadora_id", asociacion_id)
        .in_("estado", list(ESTADOS_SEGUIMIENTO_ABIERTOS))
        .order("iniciado_at", desc=False)
        .execute()
    )
    return resultado.data or []


def obtener_detalle_seguimiento(
    reporte_id: str,
    asociacion_id: str,
) -> dict:
    seguimiento = _obtener_seguimiento_autorizado(reporte_id, asociacion_id)

    reporte_res = (
        supabase_admin.table("reportes")
        .select(
            "id, estado_reporte, municipio, colonia, calle, created_at, "
            "animal(id, orden, es_grupo, cantidad, trae_crias_nacidas, "
            "numero_crias_nacidas, sexo, edad_aproximada, descripcion, "
            "tipo_animal_catalogo(clave), condicion_catalogo(clave), "
            "tamanio_catalogo(clave))"
        )
        .eq("id", reporte_id)
        .execute()
    )
    if not reporte_res.data:
        raise SeguimientoFallecimientoError("reporte_no_encontrado")

    reporte = reporte_res.data[0]
    animales_crudos, _ = shape_animal_embed(reporte.pop("animal", None))
    reporte["animales"] = [
        shape_animal_response(animal) for animal in animales_crudos
    ]

    resultados_res = (
        supabase_admin.table("resultados_rescate_animal")
        .select(
            "id, animal_id, reportado_por_id, evidencia_id, estado, "
            "cantidad_reportada, latitud, longitud, puede_esperar_seguro, "
            "riesgo_vial, riesgo_sanitario, identificacion_observada, "
            "comentario, motivo_retiro_seguridad, revision_notas, "
            "reportado_at, revisado_at, actualizado_at"
        )
        .eq("reporte_id", reporte_id)
        .order("reportado_at", desc=False)
        .execute()
    )
    resultados = resultados_res.data or []

    evidencias_por_id: dict[str, dict] = {}
    evidencia_ids = list({
        fila["evidencia_id"]
        for fila in resultados
        if fila.get("evidencia_id")
    })
    if evidencia_ids:
        evidencias_res = (
            supabase_admin.table("reporte_evidencias")
            .select("id, foto_url, created_at")
            .eq("reporte_id", reporte_id)
            .in_("id", evidencia_ids)
            .execute()
        )
        evidencias_por_id = {
            evidencia["id"]: evidencia
            for evidencia in (evidencias_res.data or [])
        }

    for fila in resultados:
        evidencia = evidencias_por_id.get(fila.get("evidencia_id"))
        fila["evidencia"] = None
        if evidencia and evidencia.get("foto_url"):
            try:
                acceso = crear_url_firmada_sensible(evidencia["foto_url"])
            except (RuntimeError, ValueError):
                acceso = None
            if acceso:
                fila["evidencia"] = {
                    "url": acceso["url"],
                    "expira_at": acceso["expira_at"],
                    "creada_at": evidencia.get("created_at"),
                    "contenido_sensible": True,
                }

    acciones_res = (
        supabase_admin.table("seguimientos_retiro_animal")
        .select(
            "id, resultado_rescate_animal_id, registrado_por_id, "
            "tipo_actor, accion, folio, nombre_servicio, destino_informado, "
            "nota, registrado_at"
        )
        .eq("reporte_id", reporte_id)
        .order("registrado_at", desc=True)
        .execute()
    )

    contactos = []
    municipio = reporte.get("municipio")
    if municipio:
        contactos_res = (
            supabase_admin.table("contactos_retiro_animal")
            .select(
                "id, municipio_nombre, nombre_servicio, telefono, "
                "tipo_servicio, horario, fuente, verificado_at"
            )
            .eq("municipio_nombre", municipio)
            .eq("activo", True)
            .order("prioridad", desc=False)
            .execute()
        )
        contactos = contactos_res.data or []

    return {
        "seguimiento": seguimiento,
        "reporte": reporte,
        "resultados": resultados,
        "acciones_retiro": acciones_res.data or [],
        "contactos_retiro": contactos,
    }
