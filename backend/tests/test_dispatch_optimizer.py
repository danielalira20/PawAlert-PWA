import logging
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.models.dispatch import RouteMatrixResult, RoutingErrorCode, RoutingStatus
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
