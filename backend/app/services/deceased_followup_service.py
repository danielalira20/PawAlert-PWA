from app.db.supabase import supabase_admin
from app.services.storage_service import crear_url_firmada_sensible
from app.utils.animal_shaping import shape_animal_embed, shape_animal_response


ESTADOS_SEGUIMIENTO_ABIERTOS = (
    "pendiente_voluntario",
    "pendiente_asociacion",
    "escalado_administracion",
)


class SeguimientoFallecimientoError(Exception):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(codigo)


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
