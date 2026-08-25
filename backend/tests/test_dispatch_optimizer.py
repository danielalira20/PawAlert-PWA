import logging
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.models.dispatch import (
    CandidateRouteTier,
    DispatchCandidate,
    DispatchJob,
    DispatchOptimizationPass,
    DispatchOptimizationRequest,
    DispatchRoutingPolicy,
    DispatchUrgency,
    DispatchVolunteer,
    RouteMatrixResult,
    RoutingErrorCode,
    RoutingPoint,
    RoutingStatus,
)
from app.services import dispatch_optimizer
from app.services.vroom_service import (
    VroomOptimizationResult,
    VroomRoute,
    VroomRouteStep,
)


def candidato(voluntario_id, usuario_id=None, nombre=None):
    return {
        "voluntario_id": voluntario_id,
        "usuario_id": usuario_id or f"user-{voluntario_id}",
        "nombre": nombre or f"Nombre {voluntario_id}",
        "score": {"total": 90},
    }


def matriz_completa(origin_ids, destination_ids, durations, distances):
    return RouteMatrixResult(
        origin_ids=origin_ids,
        destination_ids=destination_ids,
        durations_seconds=durations,
        distances_meters=distances,
        status=RoutingStatus.complete,
        calculated_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
    )


def matriz_no_disponible(origin_ids, destination_ids):
    return RouteMatrixResult(
        origin_ids=origin_ids,
        destination_ids=destination_ids,
        durations_seconds=[],
        distances_meters=[],
        status=RoutingStatus.unavailable,
        error_code=RoutingErrorCode.missing_coordinates,
        calculated_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
    )


def vroom_completo(routes, unassigned=None):
    return VroomOptimizationResult(
        status="complete",
        routes=routes,
        unassigned_job_ids=unassigned or [],
        calculated_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
    )


def vroom_no_disponible():
    return VroomOptimizationResult(
        status="unavailable",
        error_code="provider_error",
        calculated_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
    )


def ruta(vehicle_id, job_id, location_index, arrival):
    return VroomRoute(
        vehicle_id=vehicle_id,
        steps=[
            VroomRouteStep(type="start", location_index=0, arrival=0),
            VroomRouteStep(
                type="job",
                location_index=location_index,
                job_id=job_id,
                arrival=arrival,
            ),
            VroomRouteStep(type="end", location_index=0, arrival=arrival + 60),
        ],
    )


def db_admin(make_query, capacidades=None, reportes=None):
    tables = {
        "capacidades": make_query(data=capacidades or []),
        "reportes": make_query(data=reportes or []),
    }
    admin = MagicMock()
    admin.table.side_effect = lambda nombre: tables[nombre]
    return admin


def coordenadas(*voluntario_ids):
    return [
        {"voluntario_id": vid, "latitud": 19.0, "longitud": -98.0}
        for vid in voluntario_ids
    ]


def test_dos_reportes_sin_overlap_asignan_voluntarios_distintos(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    admin = db_admin(make_query, capacidades=coordenadas("vol-1", "vol-2"))
    matriz = matriz_completa(
        ["vol-1", "vol-2"], ["rep-1", "rep-2"],
        durations=[[100, 500], [500, 100]],
        distances=[[900, 4500], [4500, 900]],
    )
    resultado_vroom = vroom_completo([
        ruta(vehicle_id=1, job_id=1, location_index=0, arrival=300),
        ruta(vehicle_id=2, job_id=2, location_index=1, arrival=400),
    ])

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer, "calculate_dispatch_route_matrix", return_value=matriz
        ),
        patch.object(
            dispatch_optimizer, "get_optimization", return_value=resultado_vroom
        ),
    ):
        resultado, info = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    assert resultado.source == "vroom"
    assert resultado.unassigned_report_ids == []
    asignados = {(a.report_id, a.volunteer_id) for a in resultado.assignments}
    assert asignados == {("rep-1", "vol-1"), ("rep-2", "vol-2")}
    assert info["vol-1"]["usuario_id"] == "user-vol-1"
    assert info["vol-2"]["nombre"] == "Nombre vol-2"


def test_overlap_nunca_duplica_voluntario_en_assignments(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1"), candidato("vol-2")],
        "rep-2": [candidato("vol-1")],
    }
    admin = db_admin(make_query, capacidades=coordenadas("vol-1", "vol-2"))
    matriz = matriz_completa(
        ["vol-1", "vol-2"], ["rep-1", "rep-2"],
        durations=[[100, 200], [300, 400]],
        distances=[[900, 1800], [2700, 3600]],
    )
    # VROOM decide: vol-1 (vehicle 1) atiende rep-2 (job 2), vol-2 (vehicle 2)
    # atiende rep-1 (job 1) -- nadie se repite aunque vol-1 calificaba para
    # ambos reportes.
    resultado_vroom = vroom_completo([
        ruta(vehicle_id=1, job_id=2, location_index=1, arrival=400),
        ruta(vehicle_id=2, job_id=1, location_index=0, arrival=300),
    ])

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer, "calculate_dispatch_route_matrix", return_value=matriz
        ),
        patch.object(
            dispatch_optimizer, "get_optimization", return_value=resultado_vroom
        ),
    ):
        resultado, _ = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    voluntarios_usados = [a.volunteer_id for a in resultado.assignments]
    assert len(voluntarios_usados) == len(set(voluntarios_usados))
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-2", "vol-1"),
        ("rep-1", "vol-2"),
    }


def test_matriz_no_disponible_cae_a_fallback_local(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    admin = db_admin(make_query, capacidades=coordenadas("vol-1", "vol-2"))

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer,
            "calculate_dispatch_route_matrix",
            return_value=matriz_no_disponible(["vol-1", "vol-2"], ["rep-1", "rep-2"]),
        ),
        patch.object(dispatch_optimizer, "get_optimization") as get_optimization,
    ):
        resultado, info = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    get_optimization.assert_not_called()
    assert resultado.source == "local_fallback"
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1"),
        ("rep-2", "vol-2"),
    }
    assert info["vol-1"]["usuario_id"] == "user-vol-1"


def test_vroom_no_disponible_cae_a_fallback_local(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    admin = db_admin(make_query, capacidades=coordenadas("vol-1", "vol-2"))
    matriz = matriz_completa(
        ["vol-1", "vol-2"], ["rep-1", "rep-2"],
        durations=[[100, 200], [300, 400]],
        distances=[[900, 1800], [2700, 3600]],
    )

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer, "calculate_dispatch_route_matrix", return_value=matriz
        ),
        patch.object(
            dispatch_optimizer, "get_optimization", return_value=vroom_no_disponible()
        ),
    ):
        resultado, _ = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    assert resultado.source == "local_fallback"
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1"),
        ("rep-2", "vol-2"),
    }


def test_excepcion_inesperada_cae_a_fallback_sin_propagar(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    admin = db_admin(make_query, capacidades=coordenadas("vol-1", "vol-2"))

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer,
            "calculate_dispatch_route_matrix",
            side_effect=RuntimeError("boom inesperado"),
        ),
    ):
        resultado, _ = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    assert resultado.source == "local_fallback"
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1"),
        ("rep-2", "vol-2"),
    }


def test_voluntario_sin_coordenadas_se_excluye_sin_tumbar_el_batch(make_query, caplog):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    # vol-2 no tiene fila en capacidades con coordenadas -- solo vol-1 califica.
    admin = db_admin(make_query, capacidades=coordenadas("vol-1"))
    matriz = matriz_completa(
        ["vol-1"], ["rep-1", "rep-2"],
        durations=[[100, 200]],
        distances=[[900, 1800]],
    )
    resultado_vroom = vroom_completo(
        [ruta(vehicle_id=1, job_id=1, location_index=0, arrival=300)],
        unassigned=[2],
    )

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer, "calculate_dispatch_route_matrix", return_value=matriz
        ) as calcular_matriz,
        patch.object(
            dispatch_optimizer, "get_optimization", return_value=resultado_vroom
        ),
        caplog.at_level(logging.WARNING, logger="app.services.dispatch_optimizer"),
    ):
        resultado, _ = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    assert calcular_matriz.call_args.args[0] == ["vol-1"]
    assert resultado.source == "vroom"
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1")
    }
    assert resultado.unassigned_report_ids == ["rep-2"]
    assert any("vol-2" in mensaje for mensaje in caplog.messages)


def test_urgency_score_nulo_no_rompe_el_batch(make_query):
    candidatos_por_reporte = {
        "rep-1": [candidato("vol-1")],
        "rep-2": [candidato("vol-2")],
    }
    admin = db_admin(
        make_query,
        capacidades=coordenadas("vol-1", "vol-2"),
        # rep-1 trae urgency_score; rep-2 no aparece -> None -> priority 0.
        reportes=[{"id": "rep-1", "urgency_score": 80}],
    )
    matriz = matriz_completa(
        ["vol-1", "vol-2"], ["rep-1", "rep-2"],
        durations=[[100, 200], [300, 400]],
        distances=[[900, 1800], [2700, 3600]],
    )
    resultado_vroom = vroom_completo([
        ruta(vehicle_id=1, job_id=1, location_index=0, arrival=300),
        ruta(vehicle_id=2, job_id=2, location_index=1, arrival=400),
    ])

    with (
        patch.object(dispatch_optimizer, "supabase_admin", admin),
        patch.object(
            dispatch_optimizer.matching,
            "obtener_candidatos",
            side_effect=lambda rid: {"candidatos": candidatos_por_reporte[rid]},
        ),
        patch.object(
            dispatch_optimizer, "calculate_dispatch_route_matrix", return_value=matriz
        ),
        patch.object(
            dispatch_optimizer, "get_optimization", return_value=resultado_vroom
        ) as get_optimization,
    ):
        resultado, _ = dispatch_optimizer.optimizar_lote_reportes(["rep-1", "rep-2"])

    request = get_optimization.call_args.args[0]
    prioridad_por_job = {job.id: job.priority for job in request.jobs}
    assert prioridad_por_job == {1: 80, 2: 0}
    assert resultado.source == "vroom"


# ---------------------------------------------------------------------------
# Fase 3: optimize_dispatch(request) -- pruebas sobre la funcion pura que
# recibe un DispatchOptimizationRequest ya armado. No tocan Supabase/matching
# (no aplica: optimize_dispatch no las consulta), y no duplican las pruebas
# de test_vroom_service.py (matrices.car, validate_square_matrices,
# validate_references, VROOM_MAX_LOCATIONS -- esas ya estan cubiertas ahi).
# ---------------------------------------------------------------------------

NOW = datetime(2026, 8, 24, 12, 0, tzinfo=timezone.utc)


def _tier_for(duration, minimum_duration, policy):
    if duration > policy.secondary_max_eta_minutes * 60:
        return CandidateRouteTier.manual_only
    if duration <= minimum_duration + policy.candidate_window_minutes * 60:
        return CandidateRouteTier.primary
    return CandidateRouteTier.secondary


def _point(entity_id, seed):
    return RoutingPoint(
        id=entity_id, latitude=19.0 + seed * 0.001, longitude=-98.0 + seed * 0.001
    )


def build_request(pairs, urgency_by_report=None, policy=None):
    """pairs: lista de dicts con volunteer_id, report_id, duration (s),
    distance (m), score, role ('voluntario_interno' por defecto). Deriva
    route_tier/automatic_eligible/matching_score/offered_report_ids
    exactamente como lo exige el validador de DispatchOptimizationRequest,
    para no tener que repetir esa aritmetica en cada prueba."""
    policy = policy or DispatchRoutingPolicy()
    urgency_by_report = urgency_by_report or {}

    report_ids = sorted({p["report_id"] for p in pairs})
    volunteer_ids = sorted({p["volunteer_id"] for p in pairs})

    durations_by_report = {}
    distances_by_report = {}
    for p in pairs:
        durations_by_report.setdefault(p["report_id"], {})[p["volunteer_id"]] = p[
            "duration"
        ]
        distances_by_report.setdefault(p["report_id"], {})[p["volunteer_id"]] = p[
            "distance"
        ]
    minimum_by_report = {
        rid: min(d.values()) for rid, d in durations_by_report.items()
    }

    candidates = []
    for p in pairs:
        role = p.get("role", "voluntario_interno")
        tier = p.get("tier") or _tier_for(
            p["duration"], minimum_by_report[p["report_id"]], policy
        )
        automatic_eligible = (
            role == "voluntario_interno" and tier != CandidateRouteTier.manual_only
        )
        candidates.append(
            DispatchCandidate(
                report_id=p["report_id"],
                volunteer_id=p["volunteer_id"],
                matching_score=p["score"],
                offered=(role == "voluntario_externo"),
                route_tier=tier,
                automatic_eligible=automatic_eligible,
            )
        )

    role_by_volunteer = {}
    score_by_volunteer = {}
    offered_by_volunteer = {}
    for p in pairs:
        vid = p["volunteer_id"]
        role_by_volunteer[vid] = p.get("role", "voluntario_interno")
        score_by_volunteer[vid] = max(score_by_volunteer.get(vid, 0.0), p["score"])
        if role_by_volunteer[vid] == "voluntario_externo":
            offered_by_volunteer.setdefault(vid, set()).add(p["report_id"])

    volunteers = [
        DispatchVolunteer(
            volunteer_id=vid,
            location=_point(vid, index),
            matching_score=score_by_volunteer[vid],
            capacity=5,
            current_load=0,
            role=role_by_volunteer[vid],
            offered_report_ids=sorted(offered_by_volunteer.get(vid, set())),
        )
        for index, vid in enumerate(volunteer_ids)
    ]

    jobs = [
        DispatchJob(
            report_id=rid,
            location=_point(rid, index + 100),
            urgency=DispatchUrgency(
                score=urgency_by_report.get(rid, 50.0),
                level="amarillo",
                calculated_at=NOW,
            ),
        )
        for index, rid in enumerate(report_ids)
    ]

    durations_matrix = [
        [durations_by_report.get(rid, {}).get(vid) for rid in report_ids]
        for vid in volunteer_ids
    ]
    distances_matrix = [
        [distances_by_report.get(rid, {}).get(vid) for rid in report_ids]
        for vid in volunteer_ids
    ]
    travel_matrix = matriz_completa(
        volunteer_ids, report_ids, durations_matrix, distances_matrix
    )

    return DispatchOptimizationRequest(
        jobs=jobs,
        volunteers=volunteers,
        candidates=candidates,
        travel_matrix=travel_matrix,
        routing_policy=policy,
    )


def vroom_result_for(*asignaciones, unassigned_job_ids=None):
    """asignaciones: tuplas (vehicle_id, job_id, arrival_seconds)."""
    return VroomOptimizationResult(
        status="complete",
        routes=[
            VroomRoute(
                vehicle_id=vehicle_id,
                steps=[
                    VroomRouteStep(type="start", location_index=0, arrival=0),
                    VroomRouteStep(
                        type="job",
                        location_index=1,
                        job_id=job_id,
                        arrival=arrival,
                    ),
                ],
            )
            for vehicle_id, job_id, arrival in asignaciones
        ],
        unassigned_job_ids=unassigned_job_ids or [],
        calculated_at=NOW,
    )


def vroom_unavailable(error_code="provider_error"):
    return VroomOptimizationResult(
        status="unavailable", error_code=error_code, calculated_at=NOW
    )


def test_diferencia_7_minutos_gana_el_mas_cercano_fuera_de_ventana():
    """rep-1: vol-1 a 5 min (score bajo), vol-2 a 12 min (score alto). La
    ventana primaria es de 5 min -> vol-2 cae en secondary, fuera del pass A.
    El score de vol-2 no lo salva: solo vol-1 recibe el skill en pass A."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 60,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-1",
                "duration": 300 + 7 * 60,
                "distance": 9000,
                "score": 95,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        return_value=vroom_result_for((1, 1, 300)),
    ) as get_optimization:
        resultado = dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    skills_vol1 = next(v.skills for v in primary_request.vehicles if v.id == 1)
    skills_vol2 = next(v.skills for v in primary_request.vehicles if v.id == 2)
    assert skills_vol1 != []
    assert skills_vol2 == []
    assert get_optimization.call_count == 1
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1")
    }


def test_diferencia_3_minutos_gana_mejor_matching_score_dentro_de_ventana():
    """rep-1: vol-1 a 5 min (score 60), vol-2 a 8 min (score 95) -- ambos
    caen dentro de la ventana primaria de 5 min (8-5=3 <= 5), mismo tier. El
    costo que ve VROOM debe preferir a vol-2 pese a ser mas lejano."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 60,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-1",
                "duration": 300 + 3 * 60,
                "distance": 5000,
                "score": 95,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        return_value=vroom_result_for((2, 1, 480)),
    ) as get_optimization:
        dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    matrix = primary_request.matrices["car"]
    cost_vol1 = matrix.costs[0][2]
    cost_vol2 = matrix.costs[1][2]
    assert cost_vol2 < cost_vol1


def test_mismo_score_gana_el_menor_tiempo():
    """rep-1: vol-1 y vol-2 con el mismo score pero distinta duracion, ambos
    primary. El termino de score es identico -> el costo debe decidirse por
    duracion real, favoreciendo al mas cercano."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-1",
                "duration": 500,
                "distance": 3500,
                "score": 80,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        return_value=vroom_result_for((1, 1, 300)),
    ) as get_optimization:
        dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    matrix = primary_request.matrices["car"]
    cost_vol1 = matrix.costs[0][2]
    cost_vol2 = matrix.costs[1][2]
    assert cost_vol1 < cost_vol2


def test_voluntario_candidato_a_dos_reportes_nunca_recibe_ambos():
    """Respuesta de VROOM adversaria: el mismo vehicle_id aparece asignado a
    dos jobs distintos (violacion de capacity=1). Debe rechazarse por
    completo y caer a fallback -- nunca producir una asignacion duplicada."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-2",
                "duration": 320,
                "distance": 2100,
                "score": 80,
            },
        ]
    )
    resultado_fallback = MagicMock()
    with (
        patch.object(
            dispatch_optimizer,
            "get_optimization",
            return_value=vroom_result_for((1, 1, 300), (1, 2, 320)),
        ),
        patch.object(
            dispatch_optimizer,
            "optimize_dispatch_fallback",
            return_value=resultado_fallback,
        ) as fallback,
    ):
        resultado = dispatch_optimizer.optimize_dispatch(request)

    fallback.assert_called_once_with(request)
    assert resultado is resultado_fallback


def test_mas_reportes_que_voluntarios_deja_sobrantes_sin_asignar():
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": rid,
                "duration": 300,
                "distance": 2000,
                "score": 80,
            }
            for rid in ("rep-1", "rep-2", "rep-3")
        ]
    )
    # VROOM (capacity=1 por vehiculo) solo puede atender un reporte con el
    # unico voluntario disponible.
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        side_effect=[
            vroom_result_for((1, 1, 300), unassigned_job_ids=[2, 3]),
            vroom_result_for((1, 1, 300), unassigned_job_ids=[2, 3]),
        ],
    ):
        resultado = dispatch_optimizer.optimize_dispatch(request)

    assert set(resultado.unassigned_report_ids) == {"rep-2", "rep-3"}
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1")
    }


def test_prioridad_rojo_sobre_verde_en_job_priority():
    """Con un solo voluntario para dos reportes, la unica palanca que tiene
    dispatch_optimizer para que VROOM prefiera el mas urgente es el campo
    `priority` del job -- confirma que rojo (mayor urgency.score) produce una
    prioridad mayor que verde."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-rojo",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-verde",
                "duration": 320,
                "distance": 2100,
                "score": 80,
            },
        ],
        urgency_by_report={"rep-rojo": 90.0, "rep-verde": 20.0},
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        return_value=vroom_result_for((1, 1, 300), unassigned_job_ids=[2]),
    ) as get_optimization:
        dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    priority_by_job = {job.id: job.priority for job in primary_request.jobs}
    report_by_job_id = {1: "rep-rojo", 2: "rep-verde"}
    assert (
        priority_by_job[1] > priority_by_job[2]
        if report_by_job_id[1] == "rep-rojo"
        else priority_by_job[2] > priority_by_job[1]
    )


def test_pareja_no_autorizada_recibe_costo_alto_finito_determinista():
    """vol-1 solo tiene candidato para rep-1, no para rep-2 -- el cruce
    (vol-1, rep-2) en la matriz cuadrada debe llevar el costo prohibido, no 0
    ni la duracion real (que ni siquiera existe para ese par)."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-2",
                "duration": 400,
                "distance": 2500,
                "score": 80,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        return_value=vroom_result_for((1, 1, 300), (2, 2, 400)),
    ) as get_optimization:
        dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    matrix = primary_request.matrices["car"]
    # size = 2 voluntarios + 2 reportes = 4; indices: vol-1=0, vol-2=1,
    # rep-1=2, rep-2=3. (vol-1, rep-2) = [0][3] no esta autorizado.
    forbidden = matrix.durations[0][3]
    assert forbidden > 0
    assert forbidden != 0
    assert forbidden == matrix.distances[0][3] == matrix.costs[0][3]
    # nunca cero ni negativo, y mucho mayor que cualquier duracion real
    assert forbidden > 400 * dispatch_optimizer._FORBIDDEN_PAIR_COST_MULTIPLIER / 2


def test_externo_ofrecido_nunca_recibe_skill_automatico():
    """Un externo con ofrecimiento vigente aparece en candidates pero
    automatic_eligible=False siempre -- nunca debe recibir el skill del
    reporte en ningun pass, primary ni expanded."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-int",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 60,
            },
            {
                "volunteer_id": "vol-ext",
                "report_id": "rep-1",
                "duration": 320,
                "distance": 2100,
                "score": 99,
                "role": "voluntario_externo",
                "tier": CandidateRouteTier.primary,
            },
        ]
    )
    externo = next(
        c for c in request.candidates if c.volunteer_id == "vol-ext"
    )
    assert externo.automatic_eligible is False

    sorted_volunteers = sorted(["vol-ext", "vol-int"])
    vehicle_id_int = sorted_volunteers.index("vol-int") + 1
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        side_effect=[vroom_result_for((vehicle_id_int, 1, 300))],
    ) as get_optimization:
        resultado = dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    vol_ext_index = sorted_volunteers.index("vol-ext")
    skills_ext = next(
        v.skills for v in primary_request.vehicles if v.start_index == vol_ext_index
    )
    assert skills_ext == []
    assert "vol-ext" not in {a.volunteer_id for a in resultado.assignments}


def test_expanded_mejora_cobertura_se_acepta_used_secondary_true():
    """primary deja rep-2 sin cubrir (su unico candidato interno, vol-2, cae
    en secondary); expanded lo cubre con esa pareja secondary -- debe
    aceptarse. rep-2 tambien lleva un externo mas cercano (vol-2-closer,
    nunca automatic_eligible) solo para que la ventana primaria de rep-2 se
    calcule contra un minimo real y vol-2 caiga en secondary de forma
    natural -- con un solo candidato para un reporte, ese candidato siempre
    seria primary por comparacion consigo mismo."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-2",
                "duration": 1200,
                "distance": 8000,
                "score": 70,
            },
            {
                "volunteer_id": "vol-2-closer",
                "report_id": "rep-2",
                "duration": 200,
                "distance": 1000,
                "score": 50,
                "role": "voluntario_externo",
            },
        ],
        urgency_by_report={"rep-1": 50.0, "rep-2": 50.0},
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        side_effect=[
            vroom_result_for((1, 1, 300), unassigned_job_ids=[2]),
            vroom_result_for((1, 1, 300), (2, 2, 1200)),
        ],
    ) as get_optimization:
        resultado = dispatch_optimizer.optimize_dispatch(request)

    assert get_optimization.call_count == 2
    assert resultado.source == "vroom"
    assert resultado.optimization_pass == DispatchOptimizationPass.expanded
    assert resultado.used_secondary is True
    assert {(a.report_id, a.volunteer_id) for a in resultado.assignments} == {
        ("rep-1", "vol-1"),
        ("rep-2", "vol-2"),
    }


def test_expanded_no_mejora_se_descarta_y_queda_primary():
    """primary deja rep-2 sin cubrir y NO existe ninguna pareja secondary
    para el (solo hay un candidato, ya primary, para rep-1) -- expanded no
    puede aportar nada nuevo, VROOM devuelve la misma cobertura sin
    secondary. Debe quedarse con A."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
        ]
    )
    # rep-2 no tiene ningun candidato -- espera, el contrato exige que TODO
    # job tenga al menos un candidato. Se usa un candidato manual_only para
    # rep-2 en su lugar, que nunca es automatic_eligible en ningun pass.
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-2",
                "duration": 3000,
                "distance": 20000,
                "score": 80,
                "tier": CandidateRouteTier.manual_only,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        side_effect=[
            vroom_result_for((1, 1, 300), unassigned_job_ids=[2]),
            vroom_result_for((1, 1, 300), unassigned_job_ids=[2]),
        ],
    ) as get_optimization:
        resultado = dispatch_optimizer.optimize_dispatch(request)

    assert get_optimization.call_count == 2
    assert resultado.source == "vroom"
    assert resultado.optimization_pass == DispatchOptimizationPass.primary
    assert resultado.used_secondary is False
    assert resultado.unassigned_report_ids == ["rep-2"]


def test_vroom_no_disponible_cae_a_optimize_dispatch_fallback():
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
        ]
    )
    resultado_fallback = MagicMock()
    with (
        patch.object(
            dispatch_optimizer,
            "get_optimization",
            return_value=vroom_unavailable(),
        ) as get_optimization,
        patch.object(
            dispatch_optimizer,
            "optimize_dispatch_fallback",
            return_value=resultado_fallback,
        ) as fallback,
    ):
        resultado = dispatch_optimizer.optimize_dispatch(request)

    assert get_optimization.call_count == 1
    fallback.assert_called_once_with(request)
    assert resultado is resultado_fallback


def test_respuesta_inconsistente_pareja_inventada_cae_a_fallback():
    """VROOM responde con un job_id valido pero devuelto en una ruta cuyo
    vehicle_id no corresponde a ningun candidato autorizado para ese
    reporte -- se rechaza por completo, no se arma ninguna asignacion
    parcial."""
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-2",
                "duration": 400,
                "distance": 2500,
                "score": 80,
            },
        ]
    )
    # vol-2 (vehicle_id=2) no es candidato de rep-1 (job_id=1) -- pareja
    # inventada.
    resultado_fallback = MagicMock()
    with (
        patch.object(
            dispatch_optimizer,
            "get_optimization",
            return_value=vroom_result_for((2, 1, 300)),
        ),
        patch.object(
            dispatch_optimizer,
            "optimize_dispatch_fallback",
            return_value=resultado_fallback,
        ) as fallback,
    ):
        resultado = dispatch_optimizer.optimize_dispatch(request)

    fallback.assert_called_once_with(request)
    assert resultado is resultado_fallback


def test_manual_only_nunca_recibe_skill_en_ningun_pass():
    request = build_request(
        [
            {
                "volunteer_id": "vol-1",
                "report_id": "rep-1",
                "duration": 300,
                "distance": 2000,
                "score": 80,
            },
            {
                "volunteer_id": "vol-2",
                "report_id": "rep-1",
                "duration": 3000,
                "distance": 20000,
                "score": 80,
                "tier": CandidateRouteTier.manual_only,
            },
        ]
    )
    with patch.object(
        dispatch_optimizer,
        "get_optimization",
        side_effect=[
            vroom_result_for((1, 1, 300)),
        ],
    ) as get_optimization:
        dispatch_optimizer.optimize_dispatch(request)

    primary_request = get_optimization.call_args_list[0].args[0]
    skills_manual_only = next(
        v.skills for v in primary_request.vehicles if v.start_index == 1
    )
    assert skills_manual_only == []
