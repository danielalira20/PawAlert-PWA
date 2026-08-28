from typing import Any

from app.db.supabase import supabase_admin
from app.models.report import ResultadoRescateSinVidaRequest


class ResultadoRescateError(Exception):
    def __init__(self, codigo: str) -> None:
        super().__init__(codigo)
        self.codigo = codigo


ERRORES_RESULTADO_CONOCIDOS = (
    "reporte_no_encontrado",
    "resultado_rescate_no_disponible",
    "voluntario_no_asignado",
    "llegada_zona_requerida",
    "evidencia_no_disponible",
    "evidencia_vinculada_otro_hito",
    "animal_resultado_invalido",
    "animal_duplicado",
    "animal_no_pertenece_reporte",
    "cantidad_animal_invalida",
    "resultado_no_modificable",
    "resultado_previo_en_conflicto",
    "resultado_faltante_en_reintento",
    "estado_seguimiento_no_encontrado",
)


def registrar_resultado_sin_vida(
    reporte_id: str,
    usuario_id: str,
    body: ResultadoRescateSinVidaRequest,
) -> dict[str, Any]:
    parametros = {
        "p_reporte_id": reporte_id,
        "p_usuario_id": usuario_id,
        "p_animales": [animal.model_dump(mode="json") for animal in body.animales],
        "p_evidencia_id": str(body.evidencia_id),
        "p_latitud": body.latitud,
        "p_longitud": body.longitud,
        "p_puede_esperar_seguro": body.puede_esperar_seguro,
        "p_riesgo_vial": body.riesgo_vial,
        "p_riesgo_sanitario": body.riesgo_sanitario,
        "p_identificacion_observada": body.identificacion_observada,
        "p_comentario": body.comentario,
        "p_motivo_retiro_seguridad": body.motivo_retiro_seguridad,
    }

    try:
        resultado = supabase_admin.rpc(
            "registrar_resultado_rescate_sin_vida",
            parametros,
        ).execute()
    except Exception as error:
        detalle = str(error).lower()
        for codigo in ERRORES_RESULTADO_CONOCIDOS:
            if codigo in detalle:
                raise ResultadoRescateError(codigo) from error
        raise ResultadoRescateError("registro_resultado_no_disponible") from error

    datos = resultado.data
    if isinstance(datos, list):
        datos = datos[0] if datos else None
    if not isinstance(datos, dict) or datos.get("reporte_id") != reporte_id:
        raise ResultadoRescateError("respuesta_resultado_invalida")
    return datos
