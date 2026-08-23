"""Optimizador batch de despacho con VROOM (Fase 2).

Agrupa varios reportes elegibles en una sola corrida de VROOM, en vez de
asignar reporte por reporte: eso permite que el mismo voluntario nunca
reciba dos casos nuevos en la misma corrida (capacity=[1] por vehiculo,
delivery=[1] por job -- ver decision de diseno en el prompt de Fase 2), algo
que el flujo secuencial anterior no podia garantizar cuando un voluntario
calificaba para varios reportes a la vez.

Ante cualquier fallo (matriz no disponible, VROOM no disponible, excepcion
inesperada) cae a un fallback local reporte-por-reporte equivalente al
comportamiento previo de escalamiento.py, con la salvedad de que tambien
evita repetir voluntario dentro del mismo lote.
"""

import logging
from datetime import datetime, timezone

from app.db.supabase import supabase_admin
from app.models.dispatch import (
    DispatchAssignment,
    DispatchOptimizationResult,
    RoutingStatus,
)
from app.services import matching
from app.services.dispatch_route_matrix_service import (
    calculate_dispatch_route_matrix,
)
from app.services.vroom_service import (
    VroomJob,
    VroomOptimizationRequest,
    VroomVehicle,
    get_optimization,
)

logger = logging.getLogger(__name__)

_TOP_N_CANDIDATOS = 5

VoluntarioInfo = dict[str, dict]


def optimizar_lote_reportes(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo]:
    """Optimiza la asignacion de un lote de reportes con VROOM.

    Devuelve el resultado del despacho junto con un mapa
    ``{voluntario_id: {"usuario_id": ..., "nombre": ...}}`` recolectado
    mientras se armaba el pool de candidatos -- el caller (escalamiento.py)
    lo necesita para completar los datos que pide
    ``coverage_service.reservar_cobertura`` por cada asignacion, sin repetir
    ninguna consulta.
    """
    try:
        resultado = _optimizar_con_vroom(reporte_ids)
    except Exception:
        logger.exception(
            "Fallo inesperado optimizando el lote con VROOM; usando fallback local"
        )
        resultado = None

    if resultado is not None:
        return resultado

    return _fallback_local(reporte_ids)


def _optimizar_con_vroom(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo] | None:
    reporte_ids = list(dict.fromkeys(reporte_ids))
    candidatos_por_reporte: dict[str, list[dict]] = {}
    voluntarios_info: VoluntarioInfo = {}

    for reporte_id in reporte_ids:
        candidatos = matching.obtener_candidatos(reporte_id)["candidatos"]
        candidatos = candidatos[:_TOP_N_CANDIDATOS]
        candidatos_por_reporte[reporte_id] = candidatos
        for candidato in candidatos:
            voluntarios_info[candidato["voluntario_id"]] = {
                "usuario_id": candidato["usuario_id"],
                "nombre": candidato["nombre"],
            }

    voluntario_ids = list(dict.fromkeys(
        candidato["voluntario_id"]
        for candidatos in candidatos_por_reporte.values()
        for candidato in candidatos
    ))
    voluntario_ids_validos = _filtrar_con_coordenadas(voluntario_ids)

    matrix_result = calculate_dispatch_route_matrix(
        voluntario_ids_validos, reporte_ids
    )
    if matrix_result.status != RoutingStatus.complete:
        return None

    request = _construir_request_vroom(
        reporte_ids,
        candidatos_por_reporte,
        voluntario_ids_validos,
        matrix_result.durations_seconds,
    )
    vroom_result = get_optimization(request)
    if vroom_result.status != "complete":
        return None

    resultado = _traducir_resultado_vroom(
        vroom_result, matrix_result, reporte_ids, voluntario_ids_validos
    )
    return resultado, voluntarios_info


def _filtrar_con_coordenadas(voluntario_ids: list[str]) -> list[str]:
    """Descarta (con log) voluntarios sin coordenadas validas en
    `capacidades` -- calculate_dispatch_route_matrix es todo-o-nada ante
    datos faltantes, asi que hay que filtrar antes de llamarla."""
    if not voluntario_ids:
        return []

    resultado = (
        supabase_admin.table("capacidades")
        .select("voluntario_id, latitud, longitud")
        .in_("voluntario_id", voluntario_ids)
        .execute()
    )
    con_coordenadas = {
        fila["voluntario_id"]
        for fila in (resultado.data or [])
        if fila.get("latitud") is not None and fila.get("longitud") is not None
    }

    descartados = [vid for vid in voluntario_ids if vid not in con_coordenadas]
    if descartados:
        logger.warning(
            "Excluyendo del lote de despacho a voluntarios sin coordenadas "
            "validas en capacidades: %s",
            descartados,
        )

    return [vid for vid in voluntario_ids if vid in con_coordenadas]


def _cargar_urgency_scores(reporte_ids: list[str]) -> dict[str, float | None]:
    resultado = (
        supabase_admin.table("reportes")
        .select("id, urgency_score")
        .in_("id", reporte_ids)
        .execute()
    )
    return {
        fila["id"]: fila.get("urgency_score")
        for fila in (resultado.data or [])
    }


def _construir_request_vroom(
    reporte_ids: list[str],
    candidatos_por_reporte: dict[str, list[dict]],
    voluntario_ids_validos: list[str],
    matrix: list[list[float | None]],
) -> VroomOptimizationRequest:
    job_index_by_reporte = {rid: i for i, rid in enumerate(reporte_ids)}
    skill_id_by_reporte = {rid: i + 1 for i, rid in enumerate(reporte_ids)}
    vehicle_index_by_voluntario = {
        vid: i for i, vid in enumerate(voluntario_ids_validos)
    }

    skills_by_voluntario: dict[str, set[int]] = {
        vid: set() for vid in voluntario_ids_validos
    }
    for reporte_id, candidatos in candidatos_por_reporte.items():
        skill_id = skill_id_by_reporte[reporte_id]
        for candidato in candidatos:
            vid = candidato["voluntario_id"]
            if vid in skills_by_voluntario:
                skills_by_voluntario[vid].add(skill_id)

    urgencias = _cargar_urgency_scores(reporte_ids)

    vehicles = [
        VroomVehicle(
            id=vehicle_index_by_voluntario[vid] + 1,
            start_index=vehicle_index_by_voluntario[vid],
            capacity=[1],
            skills=sorted(skills_by_voluntario[vid]),
        )
        for vid in voluntario_ids_validos
    ]
    jobs = [
        VroomJob(
            id=job_index_by_reporte[rid] + 1,
            location_index=job_index_by_reporte[rid],
            priority=int(urgencias.get(rid) or 0),
            delivery=[1],
            skills=[skill_id_by_reporte[rid]],
        )
        for rid in reporte_ids
    ]
    return VroomOptimizationRequest(vehicles=vehicles, jobs=jobs, matrix=matrix)


def _traducir_resultado_vroom(
    vroom_result,
    matrix_result,
    reporte_ids: list[str],
    voluntario_ids_validos: list[str],
) -> DispatchOptimizationResult:
    job_id_a_reporte = {i + 1: rid for i, rid in enumerate(reporte_ids)}
    vehicle_id_a_voluntario = {
        i + 1: vid for i, vid in enumerate(voluntario_ids_validos)
    }
    indice_por_voluntario = {
        vid: i for i, vid in enumerate(voluntario_ids_validos)
    }
    indice_por_reporte = {rid: i for i, rid in enumerate(reporte_ids)}

    assignments = []
    for route in vroom_result.routes:
        voluntario_id = vehicle_id_a_voluntario.get(route.vehicle_id)
        if voluntario_id is None:
            continue
        origen = indice_por_voluntario[voluntario_id]
        for step in route.steps:
            if step.type != "job" or step.job_id is None:
                continue
            reporte_id = job_id_a_reporte.get(step.job_id)
            if reporte_id is None:
                continue
            destino = indice_por_reporte[reporte_id]
            distancia = matrix_result.distances_meters[origen][destino]
            assignments.append(
                DispatchAssignment(
                    report_id=reporte_id,
                    volunteer_id=voluntario_id,
                    arrival_seconds=step.arrival,
                    distance_meters=distancia or 0.0,
                )
            )

    unassigned_report_ids = [
        job_id_a_reporte[job_id]
        for job_id in vroom_result.unassigned_job_ids
        if job_id in job_id_a_reporte
    ]

    return DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="vroom",
        calculated_at=datetime.now(timezone.utc),
    )


def _fallback_local(
    reporte_ids: list[str],
) -> tuple[DispatchOptimizationResult, VoluntarioInfo]:
    """Ranking simple reporte por reporte (candidatos[0]), sin agrupar ni
    optimizar rutas. A diferencia del loop original de escalamiento.py, si
    procesa varios reportes en la misma corrida evita repetir voluntario
    entre ellos -- aqui no hay reserva inmediata entre reportes que lo evite
    por si sola como en el flujo secuencial anterior."""
    voluntarios_info: VoluntarioInfo = {}
    assignments: list[DispatchAssignment] = []
    unassigned_report_ids: list[str] = []
    usados: set[str] = set()

    for reporte_id in reporte_ids:
        try:
            candidatos = matching.obtener_candidatos(reporte_id)["candidatos"]
        except Exception:
            logger.exception(
                "Fallback local: no se pudo evaluar candidatos para el "
                "reporte %s",
                reporte_id,
            )
            unassigned_report_ids.append(reporte_id)
            continue

        for candidato in candidatos:
            voluntarios_info[candidato["voluntario_id"]] = {
                "usuario_id": candidato["usuario_id"],
                "nombre": candidato["nombre"],
            }

        elegido = next(
            (c for c in candidatos if c["voluntario_id"] not in usados), None
        )
        if elegido is None:
            unassigned_report_ids.append(reporte_id)
            continue

        usados.add(elegido["voluntario_id"])
        assignments.append(
            DispatchAssignment(
                report_id=reporte_id,
                volunteer_id=elegido["voluntario_id"],
                arrival_seconds=0,
                distance_meters=0.0,
            )
        )

    resultado = DispatchOptimizationResult(
        assignments=assignments,
        unassigned_report_ids=unassigned_report_ids,
        source="local_fallback",
        calculated_at=datetime.now(timezone.utc),
    )
    return resultado, voluntarios_info
