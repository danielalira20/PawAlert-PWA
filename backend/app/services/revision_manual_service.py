from typing import Any

from app.db.supabase import supabase_admin


class RevisionManualError(Exception):
    """La transición no pudo completarse de forma segura."""


class AtencionEnCursoError(RevisionManualError):
    """El reporte ya tiene una atención que requiere intervención humana."""


def transicionar_a_revision_manual(reporte_id: str, motivo: str) -> dict[str, Any]:
    try:
        resultado = supabase_admin.rpc(
            "transicion_revision_manual",
            {"p_reporte_id": reporte_id, "p_motivo": motivo},
        ).execute()
    except Exception as error:
        mensaje = str(error).lower()
        if "atencion_en_curso" in mensaje:
            raise AtencionEnCursoError("atencion_en_curso") from error
        if "reporte_no_encontrado" in mensaje:
            raise RevisionManualError("reporte_no_encontrado") from error
        if "reporte_no_aprobado" in mensaje:
            raise RevisionManualError("reporte_no_aprobado") from error
        raise RevisionManualError("transicion_no_disponible") from error

    datos = resultado.data
    if isinstance(datos, list):
        datos = datos[0] if datos else None
    if not isinstance(datos, dict) or datos.get("estado") != "revision_manual":
        raise RevisionManualError("respuesta_transicion_invalida")
    return datos
