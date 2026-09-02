import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://localhost:8000")
JWT_DUMMY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ."
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
)
os.environ.setdefault("SUPABASE_KEY", JWT_DUMMY)
os.environ.setdefault("SUPABASE_SERVICE_KEY", JWT_DUMMY)

from app.models.dispatch import AvistamientoCreate, LocationSource
from app.models.urgency import DuplicateCandidate
from app.services import avistamiento_service as svc
from app.services import avistamiento_vision_service
from app.services import assignment_route_service
from app.services import duplicate_service
from app.services import push_notification_service
from app.services import urgency_service


@pytest.fixture(autouse=True)
def _stub_push(monkeypatch):
    """_confirmar_avistamiento encola un push al voluntario asignado (Fase 5)
    via import diferido de push_notification_service. Se neutraliza por
    defecto en todo el modulo -- los tests que verifican el push toman este
    fixture como parametro y assertean sobre el MagicMock."""
    stub = MagicMock(return_value={"status": "queued", "id": "push-1"})
    monkeypatch.setattr(push_notification_service, "queue_and_send_push", stub)
    return stub


def _reporte(**cambios):
    datos = {
        "id": "rep-1",
        "usuario_id": "user-reportante",
        "staff_asignado_id": "user-staff",
        "asociacion_asignada_id": "aso-1",
        "latitud": 19.0,
        "longitud": -98.0,
        "ultima_ubicacion_confirmada_id": None,
        "ultima_latitud_confirmada": None,
        "ultima_longitud_confirmada": None,
    }
    datos.update(cambios)
    return datos


def _reporte_con_animales(**cambios):
    """Igual que _reporte(), pero con lo que _datos_para_duplicados() necesita
    (created_at + animal embed) para no salir temprano con None."""
    datos = _reporte()
    datos.update(
        {
            "created_at": "2026-08-20T10:00:00+00:00",
            "animal": [{"tipo_animal_catalogo": {"clave": "perro"}, "cantidad": 1}],
        }
    )
    datos.update(cambios)
    return datos


def _usuario(**cambios):
    datos = {"id": "user-x", "asociacion_id": None, "roles": {"nombre": "reportante"}}
    datos.update(cambios)
    return datos


def _armar_db(tablas: dict) -> MagicMock:
    db = MagicMock()
    db.table.side_effect = lambda nombre: tablas[nombre]
    return db


def _avistamiento_create(**cambios):
    datos = {
        "animal_id": "animal-1",
        "latitud": 19.0001,
        "longitud": -98.0001,
        "observado_at": datetime.now(timezone.utc),
    }
    datos.update(cambios)
    return AvistamientoCreate(**datos)


def _fila_insertada(**cambios):
    datos = {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "confirmacion_reportante",
        "estado_validacion": "pendiente",
        "registrado_at": datetime.now(timezone.utc).isoformat(),
    }
    datos.update(cambios)
    return datos


# --- registrar_avistamiento: resolucion de fuente por rol -----------------


def test_registrar_avistamiento_fuente_reportante_del_caso(monkeypatch, make_query):
    reporte = _reporte(usuario_id="user-reportante")
    fila = _fila_insertada(fuente="confirmacion_reportante")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create()
    )

    assert resultado.fuente == LocationSource.confirmacion_reportante
    assert resultado.estado_validacion == "pendiente"
    db.table("reportes").update.assert_not_called()


def test_registrar_avistamiento_fuente_voluntario_asignado(monkeypatch, make_query):
    reporte = _reporte(usuario_id="user-reportante", staff_asignado_id="user-vol")
    fila = _fila_insertada(fuente="voluntario_asignado")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(data=[_usuario(id="user-vol")]),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-vol", _avistamiento_create()
    )

    assert resultado.fuente == LocationSource.voluntario_asignado
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_fuente_asociacion_se_autovalida(
    monkeypatch, make_query
):
    reporte = _reporte()
    fila = _fila_insertada(fuente="asociacion", estado_validacion="validado")
    reportes_mock = make_query(execute_results=[[reporte], [{"id": "rep-1"}]])
    historial_mock = make_query(data=[{"id": "hist-1"}])
    db = _armar_db(
        {
            "reportes": reportes_mock,
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-aso", asociacion_id="aso-1", roles={"nombre": "asociacion"}
                    )
                ]
            ),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
            "historial_reporte": historial_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-aso", _avistamiento_create()
    )

    assert resultado.fuente == LocationSource.asociacion
    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0001,
            "ultima_longitud_confirmada": -98.0001,
        }
    )
    historial_mock.insert.assert_called_once()
    datos_evento = historial_mock.insert.call_args[0][0]
    assert datos_evento["tipo_evento"] == "ubicacion_confirmada"
    assert datos_evento["datos_extra"]["avistamiento_id"] == "av-1"
    assert datos_evento["datos_extra"]["fuente"] == "asociacion"


def test_registrar_avistamiento_fuente_voluntario_verificado_dentro_de_radio(
    monkeypatch, make_query
):
    reporte = _reporte(usuario_id="user-reportante", staff_asignado_id="user-staff")
    fila = _fila_insertada(fuente="voluntario_verificado")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-ext", asociacion_id=None, roles={"nombre": "voluntario_externo"}
                    )
                ]
            ),
            "voluntarios": make_query(
                data=[
                    {
                        "estado": "activo_nivel_2",
                        "capacidades": {
                            "latitud": 19.001,
                            "longitud": -98.001,
                            "radio_max_km": 5,
                        },
                    }
                ]
            ),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-ext", _avistamiento_create()
    )

    assert resultado.fuente == LocationSource.voluntario_verificado
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_voluntario_verificado_radio_null_usa_maximo_plataforma(
    monkeypatch, make_query
):
    """Antes, radio_max_km NULL producia radio=0 y `if radio <= 0: return
    False` descartaba siempre al voluntario. Ahora NULL significa "sin
    limite configurado, usar el maximo de la plataforma"
    (matching.MAX_RADIO_KM = 30km) -- ~15km de distancia debe calificar."""
    reporte = _reporte(usuario_id="user-reportante", staff_asignado_id="user-staff")
    fila = _fila_insertada(fuente="voluntario_verificado")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-ext", asociacion_id=None, roles={"nombre": "voluntario_externo"}
                    )
                ]
            ),
            "voluntarios": make_query(
                data=[
                    {
                        "estado": "activo_nivel_2",
                        "capacidades": {
                            "latitud": 19.135,
                            "longitud": -98.0,
                            "radio_max_km": None,
                        },
                    }
                ]
            ),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-ext", _avistamiento_create()
    )

    assert resultado.fuente == LocationSource.voluntario_verificado
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_voluntario_verificado_radio_null_sigue_topado(
    monkeypatch, make_query
):
    """El fallback a NULL no es "sin limite real": sigue topado al maximo
    de la plataforma (30km) -- ~35km de distancia sigue quedando fuera."""
    reporte = _reporte(usuario_id="user-reportante", staff_asignado_id="user-staff")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-ext", asociacion_id=None, roles={"nombre": "voluntario_externo"}
                    )
                ]
            ),
            "voluntarios": make_query(
                data=[
                    {
                        "estado": "activo_nivel_2",
                        "capacidades": {
                            "latitud": 19.315,
                            "longitud": -98.0,
                            "radio_max_km": None,
                        },
                    }
                ]
            ),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-ext", _avistamiento_create())

    assert error.value.status_code == 403


def test_registrar_avistamiento_rechaza_usuario_sin_rol_calificado(
    monkeypatch, make_query
):
    reporte = _reporte(usuario_id="user-reportante", staff_asignado_id="user-staff")
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-ajeno", asociacion_id="aso-2", roles={"nombre": "voluntario_externo"}
                    )
                ]
            ),
            "voluntarios": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-ajeno", _avistamiento_create())

    assert error.value.status_code == 403


# --- validar_avistamiento ---------------------------------------------------


def _armar_validar(monkeypatch, make_query, *, reporte=None, usuario=None, avistamiento=None):
    reporte = reporte or _reporte()
    usuario = usuario or _usuario(
        id=reporte["staff_asignado_id"], roles={"nombre": "staff"}
    )
    avistamiento = avistamiento or {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "confirmacion_reportante",
        "estado_validacion": "pendiente",
        "latitud": 19.0,
        "longitud": -98.0,
        "registrado_at": datetime.now(timezone.utc).isoformat(),
    }
    avistamientos_mock = make_query(
        execute_results=[
            [avistamiento],
            [{**avistamiento, "estado_validacion": "validado"}],
            # Tercera ejecucion: el UPDATE de _superar_pendientes_del_caso,
            # que corre tras aprobar. Vacia = no habia otros pendientes.
            [],
        ]
    )
    reportes_mock = make_query(data=[reporte])
    historial_mock = make_query(data=[{"id": "hist-1"}])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": reportes_mock,
            "usuarios": make_query(data=[usuario]),
            "historial_reporte": historial_mock,
            "animal": make_query(data=[{"id": "animal-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    return db, avistamientos_mock, reportes_mock, historial_mock, usuario["id"]


def test_validar_avistamiento_aprobar_confirma_ubicacion(monkeypatch, make_query):
    db, avistamientos_mock, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    historial_mock.insert.assert_called_once()
    datos_evento = historial_mock.insert.call_args[0][0]
    assert datos_evento["tipo_evento"] == "ubicacion_confirmada"
    assert datos_evento["datos_extra"] == {
        "avistamiento_id": "av-1",
        "latitud": 19.0,
        "longitud": -98.0,
        "fuente": "confirmacion_reportante",
    }


def test_confirmar_ubicacion_recalcula_ruta_confirmada(monkeypatch, make_query):
    db, _, _, _, usuario_id = _armar_validar(monkeypatch, make_query)
    recalcular = MagicMock()
    monkeypatch.setattr(
        assignment_route_service,
        "recalculate_confirmed_assignment_route",
        recalcular,
    )

    svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    recalcular.assert_called_once_with("rep-1")


def test_fallo_de_ruta_no_revierte_confirmacion(monkeypatch, make_query):
    _, _, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query
    )
    monkeypatch.setattr(
        assignment_route_service,
        "recalculate_confirmed_assignment_route",
        MagicMock(side_effect=RuntimeError("OSRM no disponible")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    historial_mock.insert.assert_called_once()


def test_validar_avistamiento_rechazar_no_toca_ultima_ubicacion(monkeypatch, make_query):
    db, avistamientos_mock, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=False)

    assert resultado.estado_validacion == "rechazado"
    reportes_mock.update.assert_not_called()
    historial_mock.insert.assert_not_called()


def test_validar_avistamiento_rechaza_usuario_no_asignado(monkeypatch, make_query):
    reporte = _reporte()
    usuario_ajeno = _usuario(id="user-ajeno", asociacion_id="aso-2", roles={"nombre": "voluntario_externo"})
    avistamiento = {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "confirmacion_reportante",
        "estado_validacion": "pendiente",
        "latitud": 19.0,
        "longitud": -98.0,
        "registrado_at": datetime.now(timezone.utc).isoformat(),
    }
    avistamientos_mock = make_query(data=[avistamiento])
    reportes_mock = make_query(data=[reporte])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": reportes_mock,
            "usuarios": make_query(data=[usuario_ajeno]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.validar_avistamiento("av-1", "user-ajeno", aprobar=True)

    assert error.value.status_code == 403
    avistamientos_mock.update.assert_not_called()


# --- _confirmar_avistamiento: duplicados + urgency --------------------------


def test_confirmar_ubicacion_detecta_posible_duplicado(monkeypatch, make_query):
    _, _, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    candidato = DuplicateCandidate(
        existing_report_id="rep-2",
        distance_m=80.5,
        time_difference_minutes=15.0,
        shared_species=["perro"],
    )
    monkeypatch.setattr(
        duplicate_service,
        "find_geographic_duplicates",
        MagicMock(return_value=[candidato]),
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    eventos = [
        llamada.args[0]["tipo_evento"] for llamada in historial_mock.insert.call_args_list
    ]
    assert "posible_duplicado_detectado" in eventos

    evento_duplicado = next(
        llamada.args[0]
        for llamada in historial_mock.insert.call_args_list
        if llamada.args[0]["tipo_evento"] == "posible_duplicado_detectado"
    )
    assert evento_duplicado["datos_extra"]["avistamiento_id"] == "av-1"
    assert evento_duplicado["datos_extra"]["candidatos"] == [
        {
            "reporte_id": "rep-2",
            "distancia_m": 80.5,
            "diferencia_minutos": 15.0,
            "especies_compartidas": ["perro"],
        }
    ]
    # Nunca archiva ni fusiona: la única escritura sobre reportes es la de
    # ultima_ubicacion_confirmada_id (+ coordenadas) que ya hacia
    # _confirmar_avistamiento.
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )


def test_confirmar_ubicacion_sin_duplicados_no_registra_evento(monkeypatch, make_query):
    _, _, _, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    eventos = [
        llamada.args[0]["tipo_evento"] for llamada in historial_mock.insert.call_args_list
    ]
    assert "posible_duplicado_detectado" not in eventos


def test_confirmar_ubicacion_duplicados_falla_no_bloquea(monkeypatch, make_query):
    _, _, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    monkeypatch.setattr(
        duplicate_service,
        "find_geographic_duplicates",
        MagicMock(side_effect=RuntimeError("RPC no disponible")),
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    eventos = [
        llamada.args[0]["tipo_evento"] for llamada in historial_mock.insert.call_args_list
    ]
    assert "ubicacion_confirmada" in eventos


def test_confirmar_ubicacion_recalcula_urgency_con_reporte_id(monkeypatch, make_query):
    _, _, _, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    evaluar = MagicMock(return_value=SimpleNamespace(score=72.5, level="rojo"))
    monkeypatch.setattr(urgency_service, "evaluate_report_urgency", evaluar)

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    evaluar.assert_called_once_with("rep-1")
    evento_urgency = next(
        llamada.args[0]
        for llamada in historial_mock.insert.call_args_list
        if llamada.args[0]["tipo_evento"] == "urgency_recalculada"
    )
    assert evento_urgency["datos_extra"] == {
        "avistamiento_id": "av-1",
        "score": 72.5,
        "nivel": "rojo",
    }


def test_confirmar_ubicacion_urgency_falla_no_bloquea(monkeypatch, make_query):
    _, _, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=ValueError("Report is excluded from urgency calculation")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    eventos = [
        llamada.args[0]["tipo_evento"] for llamada in historial_mock.insert.call_args_list
    ]
    assert "ubicacion_confirmada" in eventos
    assert "urgency_recalculada" not in eventos


def test_confirmar_ubicacion_duplicados_antes_que_urgency(monkeypatch, make_query):
    _, _, _, _, usuario_id = _armar_validar(
        monkeypatch, make_query, reporte=_reporte_con_animales()
    )
    orden = []
    monkeypatch.setattr(
        duplicate_service,
        "find_geographic_duplicates",
        MagicMock(side_effect=lambda *a, **k: orden.append("duplicados") or []),
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(
            side_effect=lambda *a, **k: orden.append("urgency")
            or SimpleNamespace(score=1, level="verde")
        ),
    )

    svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    assert orden == ["duplicados", "urgency"]


def test_ubicacion_referencia_prefiere_coordenadas_operativas():
    reporte = _reporte(
        ultima_ubicacion_confirmada_id="av-1",
        ultima_latitud_confirmada=19.5,
        ultima_longitud_confirmada=-98.5,
    )

    assert svc._ubicacion_referencia(reporte) == (19.5, -98.5)


# --- registrar_avistamiento_desde_hito --------------------------------------


def test_registrar_avistamiento_desde_hito_se_valida_de_inmediato(monkeypatch, make_query):
    fila = _fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")
    avistamientos_mock = make_query(data=[fila])
    reportes_mock = make_query(data=[{"id": "rep-1"}])
    historial_mock = make_query(data=[{"id": "hist-1"}])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": reportes_mock,
            "historial_reporte": historial_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_encontrado",
    )

    assert resultado.estado_validacion == "validado"
    datos_insertados = avistamientos_mock.insert.call_args[0][0]
    assert datos_insertados["estado_validacion"] == "validado"
    assert datos_insertados["fuente"] == "voluntario_asignado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    historial_mock.insert.assert_called_once()


# --- integracion con registrar_hito() ---------------------------------------
# registrar_hito() es async y tiene mucha logica inline propia (no relacionada
# con avistamientos); en vez de mockear cada tabla que toca de punta a punta,
# se monkeypatchea avistamiento_service.registrar_avistamiento_desde_hito
# directamente -- el limite de integracion real que interesa aqui es "se
# llama con los datos correctos" y "si truena, el hito igual se registra",
# no reprobar el resto del endpoint (eso ya lo cubre test_reports.py).

import asyncio

from app.api import reports as reports_api
from app.services import avistamiento_service as avs_module
from app.services import report_service as report_service_module
from app.services import red_aliados_service as red_aliados_module


class HitoRequestFake:
    """Doble simple de HitoRequest -- evita depender de validacion Pydantic
    para construir cuerpos de request en estos tests de integracion."""

    def __init__(self, **campos):
        base = {
            "tipo_hito": None,
            "condicion_observada": None,
            "comentario": None,
            "destino": None,
            "foto_url": None,
            "evidencia_id": None,
            "foto_entorno_url": None,
            "latitud": None,
            "longitud": None,
            "tiempo_busqueda_minutos": None,
            "ruta_resguardo": None,
            "fecha_limite_resguardo": None,
            "direccion_movimiento_observada": None,
        }
        base.update(campos)
        for clave, valor in base.items():
            setattr(self, clave, valor)


def _reporte_para_hito(**cambios):
    datos = {
        "id": "rep-1",
        "estado_reporte": "en_camino",
        "estado_cobertura": "abierto",
        "staff_asignado_id": "user-vol",
        "asociacion_asignada_id": "aso-1",
        "latitud": 19.0,
        "longitud": -98.0,
    }
    datos.update(cambios)
    return datos


def _armar_reports_db(tablas: dict) -> MagicMock:
    db = MagicMock()
    db.table.side_effect = lambda nombre: tablas[nombre]
    return db


def test_registrar_hito_crea_avistamiento_derivado_en_animal_encontrado(
    monkeypatch, make_query
):
    reporte = _reporte_para_hito()
    reportes_mock = make_query(
        execute_results=[
            [reporte],
            [{"id": "rep-1"}],
            [{"animal": [{"orden": 1, "condicion_catalogo": {"clave": "estable"}}]}],
        ]
    )
    db = _armar_reports_db(
        {
            "usuarios": make_query(
                data=[{"id": "user-vol", "asociacion_id": None, "roles": {"nombre": "voluntario_interno"}}]
            ),
            "reportes": reportes_mock,
            "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
            "animal": make_query(data=[{"id": "animal-1"}]),
        }
    )
    db.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-uid-1"))
    monkeypatch.setattr(reports_api, "supabase", db)
    monkeypatch.setattr(reports_api, "supabase_admin", MagicMock())
    monkeypatch.setattr(report_service_module, "registrar_historial", MagicMock())
    monkeypatch.setattr(red_aliados_module, "_nivel_urgencia_efectivo", MagicMock(return_value=None))

    derivado = MagicMock(return_value=SimpleNamespace(id="av-derivado"))
    monkeypatch.setattr(avs_module, "registrar_avistamiento_desde_hito", derivado)

    body = HitoRequestFake(
        tipo_hito="animal_encontrado",
        latitud=19.0001,
        longitud=-98.0001,
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_encontrado"
    derivado.assert_called_once_with(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0001,
        longitud=-98.0001,
        tipo_hito="animal_encontrado",
        evidencia_id=None,
    )


def test_registrar_hito_multi_animal_loguea_advertencia(monkeypatch, make_query, capsys):
    """orden=1 es una heuristica, no una resolucion real: en un reporte
    multi-animal, esto debe quedar visible en logs de produccion (no solo
    documentado en un comentario) para poder contar cuantas veces pasa."""
    reporte = _reporte_para_hito()
    reportes_mock = make_query(
        execute_results=[
            [reporte],
            [{"id": "rep-1"}],
            [{"animal": [{"orden": 1, "condicion_catalogo": {"clave": "estable"}}]}],
        ]
    )
    db = _armar_reports_db(
        {
            "usuarios": make_query(
                data=[{"id": "user-vol", "asociacion_id": None, "roles": {"nombre": "voluntario_interno"}}]
            ),
            "reportes": reportes_mock,
            "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
            "animal": make_query(
                data=[{"id": "animal-1"}, {"id": "animal-2"}]
            ),
        }
    )
    db.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-uid-1"))
    monkeypatch.setattr(reports_api, "supabase", db)
    monkeypatch.setattr(reports_api, "supabase_admin", MagicMock())
    monkeypatch.setattr(report_service_module, "registrar_historial", MagicMock())
    monkeypatch.setattr(red_aliados_module, "_nivel_urgencia_efectivo", MagicMock(return_value=None))

    derivado = MagicMock(return_value=SimpleNamespace(id="av-derivado"))
    monkeypatch.setattr(avs_module, "registrar_avistamiento_desde_hito", derivado)

    body = HitoRequestFake(
        tipo_hito="animal_encontrado",
        latitud=19.0001,
        longitud=-98.0001,
    )

    asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    salida = capsys.readouterr().out
    assert "multi-animal" in salida
    assert "reporte=rep-1" in salida
    assert "hito=animal_encontrado" in salida
    derivado.assert_called_once_with(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0001,
        longitud=-98.0001,
        tipo_hito="animal_encontrado",
        evidencia_id=None,
    )


def test_registrar_hito_no_bloquea_si_avistamiento_falla(monkeypatch, make_query):
    reporte = _reporte_para_hito()
    reportes_mock = make_query(
        execute_results=[
            [reporte],
            [{"id": "rep-1"}],
            [{"animal": [{"orden": 1, "condicion_catalogo": {"clave": "estable"}}]}],
        ]
    )
    db = _armar_reports_db(
        {
            "usuarios": make_query(
                data=[{"id": "user-vol", "asociacion_id": None, "roles": {"nombre": "voluntario_interno"}}]
            ),
            "reportes": reportes_mock,
            "reporte_estados": make_query(data=[{"id": "estado-en-atencion"}]),
            "animal": make_query(data=[{"id": "animal-1"}]),
        }
    )
    db.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-uid-1"))
    monkeypatch.setattr(reports_api, "supabase", db)
    monkeypatch.setattr(reports_api, "supabase_admin", MagicMock())
    monkeypatch.setattr(report_service_module, "registrar_historial", MagicMock())
    monkeypatch.setattr(red_aliados_module, "_nivel_urgencia_efectivo", MagicMock(return_value=None))

    derivado = MagicMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr(avs_module, "registrar_avistamiento_desde_hito", derivado)

    body = HitoRequestFake(
        tipo_hito="animal_encontrado",
        latitud=19.0001,
        longitud=-98.0001,
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_encontrado"
    derivado.assert_called_once()


def test_registrar_hito_animal_no_localizado_no_crea_avistamiento(
    monkeypatch, make_query
):
    reporte = _reporte_para_hito()
    reportes_mock = make_query(data=[reporte])
    db = _armar_reports_db(
        {
            "usuarios": make_query(
                data=[{"id": "user-vol", "asociacion_id": None, "roles": {"nombre": "voluntario_interno"}}]
            ),
            "reportes": reportes_mock,
        }
    )
    db.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-uid-1"))
    rpc_mock = MagicMock()
    rpc_mock.execute.return_value = SimpleNamespace(data={"intento": 1})
    db_admin = MagicMock()
    db_admin.rpc.return_value = rpc_mock
    monkeypatch.setattr(reports_api, "supabase", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db_admin)

    derivado = MagicMock()
    monkeypatch.setattr(avs_module, "registrar_avistamiento_desde_hito", derivado)

    body = HitoRequestFake(
        tipo_hito="animal_no_localizado",
        latitud=19.0001,
        longitud=-98.0001,
        tiempo_busqueda_minutos=15,
        comentario="Recorrí la cuadra, no lo encontré.",
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_no_localizado"
    derivado.assert_not_called()


# --- Fase 4: animal_no_localizado con direccion observada ------------------


def test_registrar_avistamiento_desde_hito_pasa_direccion_observada(
    monkeypatch, make_query
):
    """2b: la firma acepta direccion_observada opcional y la escribe en la
    columna. animal_encontrado no la pasa y sigue quedando NULL."""
    fila = _fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")
    avistamientos_mock = make_query(data=[fila])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": make_query(data=[{"id": "rep-1"}]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_no_localizado",
        direccion_observada="Se fue corriendo hacia el norte, por la avenida.",
    )

    datos = avistamientos_mock.insert.call_args[0][0]
    assert datos["direccion_observada"] == (
        "Se fue corriendo hacia el norte, por la avenida."
    )
    assert datos["fuente"] == "voluntario_asignado"
    assert datos["estado_validacion"] == "validado"


def test_registrar_avistamiento_desde_hito_sin_direccion_deja_columna_none(
    monkeypatch, make_query
):
    """Regresion del llamador de Fase 1 (animal_encontrado): sin el nuevo
    parametro, direccion_observada debe seguir entrando como None."""
    fila = _fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")
    avistamientos_mock = make_query(data=[fila])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": make_query(data=[{"id": "rep-1"}]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_encontrado",
    )

    assert avistamientos_mock.insert.call_args[0][0]["direccion_observada"] is None


def _db_no_localizado(monkeypatch, make_query, *, con_animal=False):
    reporte = _reporte_para_hito()
    tablas = {
        "usuarios": make_query(
            data=[
                {
                    "id": "user-vol",
                    "asociacion_id": None,
                    "roles": {"nombre": "voluntario_interno"},
                }
            ]
        ),
        "reportes": make_query(data=[reporte]),
    }
    if con_animal:
        tablas["animal"] = make_query(data=[{"id": "animal-1"}])
    db = _armar_reports_db(tablas)
    db.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-uid-1")
    )
    rpc_mock = MagicMock()
    rpc_mock.execute.return_value = SimpleNamespace(data={"intento": 1})
    db_admin = MagicMock()
    db_admin.rpc.return_value = rpc_mock
    monkeypatch.setattr(reports_api, "supabase", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db_admin)

    derivado = MagicMock(return_value=SimpleNamespace(id="av-derivado"))
    monkeypatch.setattr(avs_module, "registrar_avistamiento_desde_hito", derivado)
    return db_admin, derivado


def test_no_localizado_sin_direccion_no_genera_avistamiento(monkeypatch, make_query):
    """Fase 4, test 1: regresion explicita. Sin el campo de direccion, una
    busqueda sin resultado sigue sin generar ningun avistamiento."""
    db_admin, derivado = _db_no_localizado(monkeypatch, make_query)

    body = HitoRequestFake(
        tipo_hito="animal_no_localizado",
        latitud=19.0001,
        longitud=-98.0001,
        tiempo_busqueda_minutos=15,
        comentario="Recorri la cuadra, no lo encontre.",
        direccion_movimiento_observada=None,
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_no_localizado"
    derivado.assert_not_called()
    # La RPC de la busqueda si corre igual.
    db_admin.rpc.assert_called_once()
    assert db_admin.rpc.call_args[0][0] == "registrar_busqueda_no_localizado"


def test_no_localizado_con_direccion_solo_espacios_no_genera_avistamiento(
    monkeypatch, make_query
):
    db_admin, derivado = _db_no_localizado(monkeypatch, make_query)

    body = HitoRequestFake(
        tipo_hito="animal_no_localizado",
        latitud=19.0001,
        longitud=-98.0001,
        tiempo_busqueda_minutos=15,
        comentario="Recorri la cuadra, no lo encontre.",
        direccion_movimiento_observada="   ",
    )

    asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    derivado.assert_not_called()


def test_no_localizado_con_direccion_genera_avistamiento_oficial(
    monkeypatch, make_query
):
    """Fase 4, tests 2 y 3: con el campo lleno se genera el avistamiento con
    fuente voluntario_asignado, auto-validado, direccion correcta y las
    coordenadas del cuerpo del hito."""
    db_admin, derivado = _db_no_localizado(monkeypatch, make_query, con_animal=True)

    # ~157m del pin del reporte (19.0, -98.0): dentro del radio que
    # voluntario_interno debe respetar para el hito, pero distinto tanto
    # del pin como de las coords de los otros tests -> prueba que se usan
    # body.latitud/body.longitud, no otras.
    body = HitoRequestFake(
        tipo_hito="animal_no_localizado",
        latitud=19.001,
        longitud=-98.001,
        tiempo_busqueda_minutos=20,
        comentario="Lo vi alejarse pero lo perdi.",
        direccion_movimiento_observada="Cruzo hacia el parque, rumbo sur.",
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_no_localizado"
    derivado.assert_called_once_with(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.001,
        longitud=-98.001,
        tipo_hito="animal_no_localizado",
        direccion_observada="Cruzo hacia el parque, rumbo sur.",
        evidencia_id=None,
    )
    # Fase 4, test 4: la RPC de la busqueda tambien corrio, en la misma llamada.
    db_admin.rpc.assert_called_once()
    assert db_admin.rpc.call_args[0][0] == "registrar_busqueda_no_localizado"


def test_no_localizado_con_direccion_no_bloquea_hito_si_avistamiento_falla(
    monkeypatch, make_query
):
    """El bloque nuevo es fail-open, igual que el de animal_encontrado."""
    db_admin, derivado = _db_no_localizado(monkeypatch, make_query, con_animal=True)
    derivado.side_effect = RuntimeError("boom")

    body = HitoRequestFake(
        tipo_hito="animal_no_localizado",
        latitud=19.0001,
        longitud=-98.0001,
        tiempo_busqueda_minutos=15,
        comentario="Recorri la cuadra.",
        direccion_movimiento_observada="Hacia el norte.",
    )

    resultado = asyncio.run(
        reports_api.registrar_hito("rep-1", body, authorization="Bearer token-valido")
    )

    assert resultado["tipo_hito"] == "animal_no_localizado"
    derivado.assert_called_once()
    db_admin.rpc.assert_called_once()


# --- filtro de entrada por cercania (RADIO_ENTRADA_AVISTAMIENTO_METROS) -----
#
# El pin del reporte de prueba esta en (19.0, -98.0). El radio por defecto es
# 500 m. _avistamiento_create(latitud=19.0001, longitud=-98.0001) cae a ~14 m
# del pin (dentro); (19.05, -98.0) cae a ~5.5 km (fuera).


def _db_entrada(make_query, *, reporte, usuario, voluntarios=None, fila=None):
    tablas = {
        "reportes": make_query(data=[reporte]),
        "usuarios": make_query(data=[usuario]),
        "animal": make_query(data=[{"id": "animal-1"}]),
        "avistamientos_animal": make_query(data=[fila or _fila_insertada()]),
    }
    if voluntarios is not None:
        tablas["voluntarios"] = make_query(data=voluntarios)
    return _armar_db(tablas)


def test_entrada_reportante_dentro_del_radio_pasa(monkeypatch, make_query):
    db = _db_entrada(
        make_query,
        reporte=_reporte(usuario_id="user-reportante"),
        usuario=_usuario(id="user-reportante"),
        fila=_fila_insertada(fuente="confirmacion_reportante"),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1",
        "user-reportante",
        _avistamiento_create(latitud=19.0001, longitud=-98.0001),
    )

    assert resultado.estado_validacion == "pendiente"


def test_entrada_reportante_fuera_del_radio_es_422(monkeypatch, make_query):
    db = _db_entrada(
        make_query,
        reporte=_reporte(usuario_id="user-reportante"),
        usuario=_usuario(id="user-reportante"),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1",
            "user-reportante",
            _avistamiento_create(latitud=19.05, longitud=-98.0),
        )

    assert error.value.status_code == 422
    assert "metros del caso" in error.value.detail
    db.table("avistamientos_animal").insert.assert_not_called()


def test_entrada_voluntario_verificado_dentro_del_radio_pasa(monkeypatch, make_query):
    db = _db_entrada(
        make_query,
        reporte=_reporte(usuario_id="user-reportante", staff_asignado_id="user-staff"),
        usuario=_usuario(id="user-ext", roles={"nombre": "voluntario_externo"}),
        voluntarios=[
            {
                "estado": "activo_nivel_2",
                "capacidades": {"latitud": 19.001, "longitud": -98.001, "radio_max_km": 5},
            }
        ],
        fila=_fila_insertada(fuente="voluntario_verificado"),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-ext", _avistamiento_create(latitud=19.0001, longitud=-98.0001)
    )

    assert resultado.fuente == LocationSource.voluntario_verificado


def test_entrada_voluntario_verificado_fuera_del_radio_es_422(monkeypatch, make_query):
    db = _db_entrada(
        make_query,
        reporte=_reporte(usuario_id="user-reportante", staff_asignado_id="user-staff"),
        usuario=_usuario(id="user-ext", roles={"nombre": "voluntario_externo"}),
        voluntarios=[
            {
                "estado": "activo_nivel_2",
                "capacidades": {"latitud": 19.001, "longitud": -98.001, "radio_max_km": 5},
            }
        ],
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1", "user-ext", _avistamiento_create(latitud=19.05, longitud=-98.0)
        )

    assert error.value.status_code == 422
    db.table("avistamientos_animal").insert.assert_not_called()


def test_entrada_asociacion_lejos_no_se_rechaza_por_distancia(monkeypatch, make_query):
    reporte = _reporte()
    fila = _fila_insertada(fuente="asociacion", estado_validacion="validado")
    reportes_mock = make_query(execute_results=[[reporte], [{"id": "rep-1"}]])
    db = _armar_db(
        {
            "reportes": reportes_mock,
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-aso",
                        asociacion_id="aso-1",
                        roles={"nombre": "asociacion"},
                    )
                ]
            ),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": make_query(data=[fila]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    # GPS a cientos de km del caso: para asociacion no aplica el filtro.
    resultado = svc.registrar_avistamiento(
        "rep-1", "user-aso", _avistamiento_create(latitud=21.5, longitud=-100.5)
    )

    assert resultado.fuente == LocationSource.asociacion
    assert resultado.estado_validacion == "validado"


# --- evaluar_elegibilidad -------------------------------------------------------


def _animales_catalogo():
    """Filas de `animal` con el catálogo embebido, como las devuelve
    _animales_del_reporte() para poblar el selector de la Pantalla A."""
    return [
        {"id": "animal-1", "orden": 1, "tipo_animal_catalogo": {"clave": "perro"}},
        {"id": "animal-2", "orden": 2, "tipo_animal_catalogo": {"clave": "gato"}},
    ]


def test_elegibilidad_asociacion_es_true_sin_calcular_distancia(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte()]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-aso",
                        asociacion_id="aso-1",
                        roles={"nombre": "asociacion"},
                    )
                ]
            ),
            "animal": make_query(data=_animales_catalogo()),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    # coordenadas absurdas: si calculara distancia, no serian "elegibles".
    resultado = svc.evaluar_elegibilidad("rep-1", "user-aso", 1.0, 1.0)

    assert resultado == {
        "elegible": True,
        "motivo": None,
        "fuente": "asociacion",
        "animales": [
            {"id": "animal-1", "tipo_animal": "perro", "orden": 1},
            {"id": "animal-2", "tipo_animal": "gato", "orden": 2},
        ],
    }


def test_elegibilidad_reportante_dentro_y_fuera(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte(usuario_id="user-reportante")]),
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
            "animal": make_query(data=_animales_catalogo()),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    dentro = svc.evaluar_elegibilidad("rep-1", "user-reportante", 19.0001, -98.0001)
    assert dentro["elegible"] is True
    assert dentro["distancia_metros"] < 500
    assert dentro["radio_metros"] == 500
    assert [a["id"] for a in dentro["animales"]] == ["animal-1", "animal-2"]

    fuera = svc.evaluar_elegibilidad("rep-1", "user-reportante", 19.05, -98.0)
    assert fuera["elegible"] is False
    assert fuera["distancia_metros"] > 500
    # el selector se puebla igual aunque el punto de entrada esté fuera de radio
    assert [a["id"] for a in fuera["animales"]] == ["animal-1", "animal-2"]


def test_elegibilidad_mide_contra_ultima_ubicacion_confirmada_no_el_pin(
    monkeypatch, make_query
):
    reporte = _reporte(
        usuario_id="user-reportante", ultima_ubicacion_confirmada_id="av-previo"
    )
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
            "animal": make_query(data=_animales_catalogo()),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    # _resolver_punto_referencia() (reports.py) consulta avistamientos_animal
    # con SU propio supabase_admin: la ubicacion confirmada esta en (19.05, -98.0),
    # lejos del pin original (19.0, -98.0).
    db_reports = MagicMock()
    db_reports.table.return_value = make_query(
        data=[{"latitud": 19.05, "longitud": -98.0}]
    )
    monkeypatch.setattr(reports_api, "supabase_admin", db_reports)

    # GPS pegado al PIN ORIGINAL -> lejos de la ubicacion confirmada -> no elegible
    contra_pin = svc.evaluar_elegibilidad("rep-1", "user-reportante", 19.0, -98.0)
    assert contra_pin["elegible"] is False
    assert contra_pin["distancia_metros"] > 5000

    # GPS pegado a la UBICACION CONFIRMADA -> elegible
    contra_confirmada = svc.evaluar_elegibilidad(
        "rep-1", "user-reportante", 19.0501, -98.0
    )
    assert contra_confirmada["elegible"] is True


def test_elegibilidad_sin_animales_devuelve_lista_vacia(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte()]),
            "usuarios": make_query(
                data=[
                    _usuario(
                        id="user-aso",
                        asociacion_id="aso-1",
                        roles={"nombre": "asociacion"},
                    )
                ]
            ),
            "animal": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    resultado = svc.evaluar_elegibilidad("rep-1", "user-aso", 1.0, 1.0)

    assert resultado["elegible"] is True
    assert resultado["animales"] == []


# --- Fase 3: auto-validacion combinada -------------------------------------
#
# Geometria de referencia: el pin de _reporte() esta en (19.0, -98.0) y
# 1 grado de latitud = 111194.9 m, asi que los desplazamientos usados abajo
# son: 0.00027 -> 30m, 0.0004 -> 44m, 0.0007 -> 78m, 0.005 -> 556m,
# 0.01 -> 1112m. Radios de la fase: coherencia 800m, corroboracion 50m,
# ventana 5min.

from app.services import reputacion_service  # noqa: E402

OBSERVADO_BASE = "2026-08-27T12:00:00+00:00"


def _fila_completa(**cambios):
    """Fila tal como la devuelve el INSERT real de avistamientos_animal,
    con las columnas que la logica de auto-validacion necesita leer
    (a diferencia de _fila_insertada(), que es el minimo del contrato)."""
    datos = {
        "id": "av-nuevo",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "confirmacion_reportante",
        "usuario_id": "user-reportante",
        "latitud": 19.0,
        "longitud": -98.0,
        "observado_at": OBSERVADO_BASE,
        "estado_validacion": "pendiente",
        "registrado_at": datetime.now(timezone.utc).isoformat(),
    }
    datos.update(cambios)
    return datos


def _mockear_trust(monkeypatch, puntaje: int):
    monkeypatch.setattr(
        reputacion_service,
        "consultar_restricciones",
        lambda usuario_id, rol: {"puntaje": puntaje, "rol": rol},
    )


def _db_auto(monkeypatch, make_query, *, fila, resultados_avistamientos):
    """Escenario de registrar_avistamiento para el reportante del caso,
    parametrizado por lo que devuelve cada ejecucion sobre
    avistamientos_animal (INSERT, luego SELECT/UPDATE segun la condicion)."""
    reportes_mock = make_query(data=[_reporte(usuario_id="user-reportante")])
    avistamientos_mock = make_query(execute_results=resultados_avistamientos)
    db = _armar_db(
        {
            "reportes": reportes_mock,
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "avistamientos_animal": avistamientos_mock,
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    return db, reportes_mock, avistamientos_mock


def _crear(latitud=19.0, longitud=-98.0, observado_at=OBSERVADO_BASE):
    return _avistamiento_create(
        latitud=latitud,
        longitud=longitud,
        observado_at=datetime.fromisoformat(observado_at),
    )


def _estados_actualizados(avistamientos_mock) -> list[str]:
    return [
        llamada[0][0]["estado_validacion"]
        for llamada in avistamientos_mock.update.call_args_list
    ]


def _args_eq(mock) -> list[tuple]:
    return [llamada[0] for llamada in mock.eq.call_args_list]


# 1. Trust score en el umbral + dentro del radio -> auto-valida.


def test_auto_valida_por_trust_en_umbral_dentro_del_radio(monkeypatch, make_query):
    _mockear_trust(monkeypatch, 60)
    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _, reportes_mock, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], [{**fila, "estado_validacion": "validado"}]],
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _crear(latitud=19.003)
    )

    assert resultado.estado_validacion == "validado"
    assert _estados_actualizados(avistamientos_mock) == ["validado"]
    # La ubicacion confirmada se movio al avistamiento nuevo.
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-nuevo",
            "ultima_latitud_confirmada": 19.003,
            "ultima_longitud_confirmada": -98.0,
        }
    )


def test_condiciones_reportan_motivo_trust_y_radio(monkeypatch, make_query):
    """El motivo viaja para logging/auditoria, no solo el booleano."""
    _mockear_trust(monkeypatch, 60)
    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _db_auto(monkeypatch, make_query, fila=fila, resultados_avistamientos=[[fila]])

    se_auto_valida, motivo = svc._validar_condiciones_auto_validacion(
        _reporte(usuario_id="user-reportante"), fila
    )

    assert se_auto_valida is True
    assert motivo == svc.MOTIVO_TRUST_Y_RADIO


# 2. Trust score justo debajo del umbral -> no auto-valida.


def test_no_auto_valida_con_trust_59_aunque_este_dentro_del_radio(
    monkeypatch, make_query
):
    _mockear_trust(monkeypatch, 59)
    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _, reportes_mock, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        # 2a ejecucion: SELECT de corroboracion, sin candidatos.
        resultados_avistamientos=[[fila], []],
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _crear(latitud=19.003)
    )

    assert resultado.estado_validacion == "pendiente"
    avistamientos_mock.update.assert_not_called()
    reportes_mock.update.assert_not_called()


# 3. Trust suficiente pero fuera del radio de coherencia -> no auto-valida.


def test_no_auto_valida_con_trust_60_fuera_del_radio_de_coherencia(
    monkeypatch, make_query
):
    """Se prueba la condicion 2 directamente, no via registrar_avistamiento:
    para reportante/voluntario_verificado el filtro de ENTRADA de Fase 2
    (500m) es mas estricto que el radio de coherencia de Fase 3 (800m), asi
    que por el endpoint es imposible llegar aqui a 1112m -- se rechaza antes
    con 422. Ver test_radio_de_entrada_fase2_corta_antes_que_la_coherencia."""
    _mockear_trust(monkeypatch, 60)
    # 0.01 grados = ~1112m, por encima de los 800m de coherencia.
    fila = _fila_completa(latitud=19.01, longitud=-98.0)
    db = _armar_db({"avistamientos_animal": make_query(data=[])})
    monkeypatch.setattr(svc, "supabase_admin", db)

    se_auto_valida, motivo = svc._validar_condiciones_auto_validacion(
        _reporte(usuario_id="user-reportante"), fila
    )

    assert se_auto_valida is False
    assert motivo is None


def test_radio_de_entrada_fase2_corta_antes_que_la_coherencia(
    monkeypatch, make_query
):
    """Documenta la interaccion entre fases: con entrada=500m y
    coherencia=800m, la franja 500-800m nunca llega a evaluarse por este
    camino. Si algun dia se sube el radio de entrada, este test cambia."""
    _mockear_trust(monkeypatch, 100)
    fila = _fila_completa(latitud=19.006, longitud=-98.0)  # ~667m
    _db_auto(monkeypatch, make_query, fila=fila, resultados_avistamientos=[[fila]])

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1", "user-reportante", _crear(latitud=19.006)
        )

    assert error.value.status_code == 422
    assert "metros del caso" in error.value.detail


# 4. Reportante sin fila en trust_score -> el default 60 SI califica.


def test_reportante_sin_fila_en_trust_score_usa_default_60_y_auto_valida(
    monkeypatch, make_query
):
    """El caso mas comun en la practica. Se ejercita la consultar_restricciones
    REAL con trust_score vacio, no un mock del puntaje -- lo que se esta
    verificando es justamente que la ausencia de fila vale 60."""
    trust_db = MagicMock()
    trust_db.table.return_value = make_query(data=[])
    monkeypatch.setattr(reputacion_service, "supabase", trust_db)

    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _, reportes_mock, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], [{**fila, "estado_validacion": "validado"}]],
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _crear(latitud=19.003)
    )

    assert resultado.estado_validacion == "validado"
    assert _estados_actualizados(avistamientos_mock) == ["validado"]


def test_fallo_consultando_trust_score_deja_pendiente_sin_romper(
    monkeypatch, make_query
):
    """consultar_restricciones no atrapa sus excepciones; el avistamiento no
    puede caerse por un problema del motor de reputacion."""

    def _explota(usuario_id, rol):
        raise RuntimeError("trust_score no disponible")

    monkeypatch.setattr(reputacion_service, "consultar_restricciones", _explota)
    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _, _, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], []],
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _crear(latitud=19.003)
    )

    assert resultado.estado_validacion == "pendiente"
    avistamientos_mock.update.assert_not_called()


# 5. Corroboracion: 44m y 4min -> ambos se validan.


def test_corroboracion_dentro_de_ambas_ventanas_valida_los_dos(
    monkeypatch, make_query
):
    _mockear_trust(monkeypatch, 59)  # cond. 2 descartada: decide la 3.
    fila = _fila_completa(latitud=19.0, longitud=-98.0)
    previo = {
        "id": "av-previo",
        "latitud": 19.0004,  # ~44m
        "longitud": -98.0,
        "observado_at": "2026-08-27T12:04:00+00:00",  # 4 min
        "estado_validacion": "pendiente",
    }
    _, reportes_mock, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[
            [fila],  # INSERT
            [previo],  # SELECT candidatos
            [{**previo, "estado_validacion": "validado"}],  # UPDATE corroborante
            [{**fila, "estado_validacion": "validado"}],  # UPDATE nuevo
        ],
    )

    resultado = svc.registrar_avistamiento("rep-1", "user-reportante", _crear())

    assert resultado.estado_validacion == "validado"
    # Los DOS pasaron a validado, no solo el nuevo.
    assert _estados_actualizados(avistamientos_mock) == ["validado", "validado"]
    assert ("id", "av-previo") in _args_eq(avistamientos_mock)
    assert ("id", "av-nuevo") in _args_eq(avistamientos_mock)


def test_corroboracion_reporta_motivo_corroboracion(monkeypatch, make_query):
    _mockear_trust(monkeypatch, 59)
    fila = _fila_completa()
    previo = {
        "id": "av-previo",
        "latitud": 19.0004,
        "longitud": -98.0,
        "observado_at": "2026-08-27T12:04:00+00:00",
        "estado_validacion": "validado",
    }
    _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], [previo]],
    )

    se_auto_valida, motivo = svc._validar_condiciones_auto_validacion(
        _reporte(usuario_id="user-reportante"), fila
    )

    assert se_auto_valida is True
    assert motivo == svc.MOTIVO_CORROBORACION


# 6. Fuera del radio de corroboracion aunque el tiempo si califique.


def test_no_corrobora_si_la_distancia_excede_aunque_el_tiempo_califique(
    monkeypatch, make_query
):
    _mockear_trust(monkeypatch, 59)
    fila = _fila_completa()
    previo = {
        "id": "av-previo",
        "latitud": 19.0007,  # ~78m, por encima de los 50m
        "longitud": -98.0,
        "observado_at": "2026-08-27T12:01:00+00:00",  # 1 min: si califica
        "estado_validacion": "pendiente",
    }
    _, _, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], [previo]],
    )

    resultado = svc.registrar_avistamiento("rep-1", "user-reportante", _crear())

    assert resultado.estado_validacion == "pendiente"
    avistamientos_mock.update.assert_not_called()


# 7. Fuera de la ventana de tiempo aunque la distancia si califique.


def test_no_corrobora_si_el_tiempo_excede_aunque_la_distancia_califique(
    monkeypatch, make_query
):
    _mockear_trust(monkeypatch, 59)
    fila = _fila_completa()
    previo = {
        "id": "av-previo",
        "latitud": 19.00027,  # ~30m: si califica
        "longitud": -98.0,
        "observado_at": "2026-08-27T12:06:00+00:00",  # 6 min, ventana de 5
        "estado_validacion": "pendiente",
    }
    _, _, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], [previo]],
    )

    resultado = svc.registrar_avistamiento("rep-1", "user-reportante", _crear())

    assert resultado.estado_validacion == "pendiente"
    avistamientos_mock.update.assert_not_called()


def test_corroboracion_solo_considera_estados_vigentes(monkeypatch, make_query):
    """El filtro de rechazados/superados se aplica en la consulta, no despues."""
    _mockear_trust(monkeypatch, 59)
    fila = _fila_completa()
    _, _, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], []],
    )

    svc.registrar_avistamiento("rep-1", "user-reportante", _crear())

    avistamientos_mock.in_.assert_called_once_with(
        "estado_validacion", ["pendiente", "validado"]
    )


# 8. Ninguna de las 3 condiciones -> queda pendiente.


def test_sin_ninguna_condicion_queda_pendiente(monkeypatch, make_query):
    _mockear_trust(monkeypatch, 30)
    # Trust por debajo del umbral y sin ningun avistamiento previo con que
    # corroborar. La distancia si califica: lo que falla son las 3 condiciones.
    fila = _fila_completa(latitud=19.003, longitud=-98.0)
    _, reportes_mock, avistamientos_mock = _db_auto(
        monkeypatch,
        make_query,
        fila=fila,
        resultados_avistamientos=[[fila], []],
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _crear(latitud=19.003)
    )

    assert resultado.estado_validacion == "pendiente"
    avistamientos_mock.update.assert_not_called()
    reportes_mock.update.assert_not_called()


# 9/10. Conflictos: aprobacion manual y superado_por_otro.


def _armar_conflicto(monkeypatch, make_query, *, animales, superados):
    avistamiento = {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "confirmacion_reportante",
        "estado_validacion": "pendiente",
        "latitud": 19.0,
        "longitud": -98.0,
        "registrado_at": datetime.now(timezone.utc).isoformat(),
    }
    avistamientos_mock = make_query(
        execute_results=[
            [avistamiento],  # SELECT
            [{**avistamiento, "estado_validacion": "validado"}],  # UPDATE aprobar
            superados,  # UPDATE superar
        ]
    )
    animal_mock = make_query(data=animales)
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": make_query(data=[_reporte()]),
            "usuarios": make_query(
                data=[_usuario(id="user-staff", roles={"nombre": "staff"})]
            ),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
            "animal": animal_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    return avistamientos_mock, animal_mock


def test_aprobar_marca_los_demas_pendientes_como_superado_por_otro(
    monkeypatch, make_query
):
    """3 pendientes del mismo reporte, se aprueba uno: los otros 2 salen de
    'pendiente' hacia 'superado_por_otro'."""
    avistamientos_mock, _ = _armar_conflicto(
        monkeypatch,
        make_query,
        animales=[{"id": "animal-1"}],
        superados=[{"id": "av-2"}, {"id": "av-3"}],
    )

    svc.validar_avistamiento("av-1", "user-staff", aprobar=True)

    estados = _estados_actualizados(avistamientos_mock)
    assert estados == ["validado", "superado_por_otro"]
    # El barrido apunta a los pendientes del reporte distintos del aprobado.
    assert ("estado_validacion", "pendiente") in _args_eq(avistamientos_mock)
    assert ("reporte_id", "rep-1") in _args_eq(avistamientos_mock)
    avistamientos_mock.neq.assert_called_with("id", "av-1")


def test_aprobado_manualmente_termina_en_validado(monkeypatch, make_query):
    """El que se aprueba no debe contagiarse del barrido de superados."""
    avistamientos_mock, _ = _armar_conflicto(
        monkeypatch,
        make_query,
        animales=[{"id": "animal-1"}],
        superados=[{"id": "av-2"}, {"id": "av-3"}],
    )

    resultado = svc.validar_avistamiento("av-1", "user-staff", aprobar=True)

    assert resultado.estado_validacion == "validado"
    assert resultado.id == "av-1"


def test_superado_por_otro_no_cruza_animales_en_reporte_multi_animal(
    monkeypatch, make_query
):
    """Aprobar un avistamiento del perro no puede descartar en silencio los
    del gato: con 2+ animales el barrido se limita al mismo animal_id."""
    avistamientos_mock, _ = _armar_conflicto(
        monkeypatch,
        make_query,
        animales=[{"id": "animal-1"}, {"id": "animal-2"}],
        superados=[{"id": "av-2"}],
    )

    svc.validar_avistamiento("av-1", "user-staff", aprobar=True)

    assert ("animal_id", "animal-1") in _args_eq(avistamientos_mock)


def test_superado_por_otro_barre_todo_el_reporte_si_es_mono_animal(
    monkeypatch, make_query
):
    avistamientos_mock, _ = _armar_conflicto(
        monkeypatch,
        make_query,
        animales=[{"id": "animal-1"}],
        superados=[{"id": "av-2"}],
    )

    svc.validar_avistamiento("av-1", "user-staff", aprobar=True)

    assert ("animal_id", "animal-1") not in _args_eq(avistamientos_mock)


def test_rechazar_no_supera_a_nadie(monkeypatch, make_query):
    avistamientos_mock, _ = _armar_conflicto(
        monkeypatch,
        make_query,
        animales=[{"id": "animal-1"}],
        superados=[],
    )

    resultado = svc.validar_avistamiento("av-1", "user-staff", aprobar=False)

    assert resultado.estado_validacion == "rechazado"
    assert _estados_actualizados(avistamientos_mock) == ["rechazado"]


# --- Fase 5: notificacion push al voluntario asignado --------------------------
#
# _confirmar_avistamiento encola un push "ubicacion_actualizada" para el
# voluntario asignado cuando ALGUIEN MAS confirma una nueva ubicacion. El
# push real lo dispara /internal/push/run; aqui solo se verifica el encolado.


def test_confirmar_con_voluntario_asignado_encola_push(
    monkeypatch, make_query, _stub_push
):
    # _armar_validar usa _reporte(), que trae staff_asignado_id="user-staff".
    _, _, _, _, usuario_id = _armar_validar(monkeypatch, make_query)
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    _stub_push.assert_called_once()
    kwargs = _stub_push.call_args.kwargs
    assert kwargs["usuario_id"] == "user-staff"
    assert kwargs["tipo_evento"] == "ubicacion_actualizada"
    assert kwargs["reporte_id"] == "rep-1"
    assert kwargs["idempotency_key"] == "ubicacion_actualizada:av-1:user-staff"
    assert kwargs["payload"]["reporte_id"] == "rep-1"
    assert "cambió" in kwargs["payload"]["mensaje"]
    # payload sin coordenadas (lo prohibe _assert_safe_payload)
    assert "latitud" not in kwargs["payload"]
    assert "longitud" not in kwargs["payload"]


def test_confirmar_sin_voluntario_asignado_no_encola_push(
    monkeypatch, make_query, _stub_push
):
    reporte_sin_vol = _reporte(staff_asignado_id=None)
    # El guard de rol de validar_avistamiento exige staff o asociacion; se usa
    # la asociacion asignada para poder aprobar sin staff_asignado_id.
    usuario_aso = _usuario(
        id="user-aso", asociacion_id="aso-1", roles={"nombre": "asociacion"}
    )
    _armar_validar(
        monkeypatch, make_query, reporte=reporte_sin_vol, usuario=usuario_aso
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    resultado = svc.validar_avistamiento("av-1", "user-aso", aprobar=True)

    assert resultado.estado_validacion == "validado"
    _stub_push.assert_not_called()


def test_confirmar_no_se_rompe_si_encolado_del_push_falla(
    monkeypatch, make_query, _stub_push
):
    _stub_push.side_effect = RuntimeError("outbox caido")
    _, _, reportes_mock, historial_mock, usuario_id = _armar_validar(
        monkeypatch, make_query
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica en este test")),
    )

    resultado = svc.validar_avistamiento("av-1", usuario_id, aprobar=True)

    # La confirmacion completa igual: estado, ultima_ubicacion y evento historial.
    assert resultado.estado_validacion == "validado"
    reportes_mock.update.assert_called_once_with(
        {
            "ultima_ubicacion_confirmada_id": "av-1",
            "ultima_latitud_confirmada": 19.0,
            "ultima_longitud_confirmada": -98.0,
        }
    )
    eventos = [
        llamada.args[0]["tipo_evento"]
        for llamada in historial_mock.insert.call_args_list
    ]
    assert "ubicacion_confirmada" in eventos
    _stub_push.assert_called_once()


def _db_confirmar_directo(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte()]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
            "avistamientos_animal": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(
        assignment_route_service,
        "recalculate_confirmed_assignment_route",
        MagicMock(),
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica")),
    )
    return db


def test_idempotency_key_es_unica_por_avistamiento_y_voluntario(
    monkeypatch, make_query, _stub_push
):
    """Dos avistamientos distintos del mismo reporte -> claves distintas, para
    que cada cambio de ubicacion notifique (no colisionan y se omiten)."""
    claves = []

    def _capturar(**kwargs):
        claves.append(kwargs["idempotency_key"])
        return {"status": "queued", "id": "push-x"}

    _stub_push.side_effect = _capturar

    for av_id in ("av-100", "av-200"):
        _db_confirmar_directo(monkeypatch, make_query)
        svc._confirmar_avistamiento(
            reporte_id="rep-1",
            avistamiento_id=av_id,
            latitud=19.0,
            longitud=-98.0,
            fuente=LocationSource.confirmacion_reportante,
            staff_asignado_id="user-staff",
        )

    assert claves == [
        "ubicacion_actualizada:av-100:user-staff",
        "ubicacion_actualizada:av-200:user-staff",
    ]
    assert claves[0] != claves[1]


def test_camino_hito_no_auto_notifica_al_voluntario(
    monkeypatch, make_query, _stub_push
):
    """registrar_avistamiento_desde_hito omite staff_asignado_id a proposito:
    el que dispara ES el voluntario asignado."""
    fila = _fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")
    db = _armar_db(
        {
            "avistamientos_animal": make_query(data=[fila]),
            "reportes": make_query(data=[{"id": "rep-1"}]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(
        assignment_route_service,
        "recalculate_confirmed_assignment_route",
        MagicMock(),
    )
    monkeypatch.setattr(
        duplicate_service, "find_geographic_duplicates", MagicMock(return_value=[])
    )
    monkeypatch.setattr(
        urgency_service,
        "evaluate_report_urgency",
        MagicMock(side_effect=RuntimeError("no aplica")),
    )

    svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_encontrado",
    )

    _stub_push.assert_not_called()


# --- Fase 6.5: foto de evidencia en avistamientos -------------------------


def _evidencia_row(**cambios):
    datos = {
        "id": "evi-1",
        "reporte_id": "rep-1",
        "usuario_id": "user-reportante",
        "foto_url": "https://pawalert.test/evi.jpg",
        "tipo_hito": None,
        "vinculada_at": None,
        "exif_latitud": None,
        "exif_longitud": None,
    }
    datos.update(cambios)
    return datos


def _db_con_evidencia(
    make_query, evidencias_query, avistamientos_query=None, animal_fotos_query=None
):
    return _armar_db(
        {
            "reportes": make_query(data=[_reporte(usuario_id="user-reportante")]),
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "reporte_evidencias": evidencias_query,
            "avistamientos_animal": avistamientos_query
            or make_query(data=[_fila_insertada()]),
            # Sin fotos de referencia por defecto: _verificar_coherencia_visual
            # se sale temprano ("sin_referencia") sin llamar a Gemini, asi
            # las pruebas que no les interesa esto no hacen red de verdad.
            "animal_fotos": animal_fotos_query or make_query(data=[]),
        }
    )


def test_autorizar_subida_evidencia_ok_para_reportante(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte(usuario_id="user-reportante")]),
            "usuarios": make_query(data=[_usuario(id="user-reportante")]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.autorizar_subida_evidencia("rep-1", "user-reportante")  # no levanta


def test_autorizar_subida_evidencia_403_para_ajeno(monkeypatch, make_query):
    db = _armar_db(
        {
            "reportes": make_query(data=[_reporte(usuario_id="otro")]),
            "usuarios": make_query(data=[_usuario(id="user-ajeno")]),
            "voluntarios": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.autorizar_subida_evidencia("rep-1", "user-ajeno")

    assert error.value.status_code == 403


def test_registrar_avistamiento_sin_evidencia_no_toca_reporte_evidencias(
    monkeypatch, make_query
):
    """Regresion Fases 1-5: sin evidencia_id el flujo es identico y no se
    consulta ni escribe reporte_evidencias."""
    evidencias_mock = make_query(data=[])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create()
    )

    evidencias_mock.select.assert_not_called()
    evidencias_mock.update.assert_not_called()
    assert avistamientos_mock.insert.call_args[0][0]["evidencia_id"] is None


def test_registrar_avistamiento_con_evidencia_valida_la_vincula_y_guarda(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    svc.registrar_avistamiento(
        "rep-1",
        "user-reportante",
        _avistamiento_create(evidencia_id="evi-1"),
    )

    vinculacion = evidencias_mock.update.call_args[0][0]
    assert vinculacion["vinculada_at"] is not None
    assert vinculacion["tipo_hito"] == "avistamiento"
    assert avistamientos_mock.insert.call_args[0][0]["evidencia_id"] == "evi-1"


# --- registrar_avistamiento: verificacion visual contra las fotos del
# animal reportado (Gemini) -----------------------------------------------


def test_registrar_avistamiento_bloquea_si_la_foto_no_es_animal(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    db = _db_con_evidencia(
        make_query,
        evidencias_mock,
        animal_fotos_query=make_query(data=[{"foto_url": "https://pawalert.test/original.jpg"}]),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    monkeypatch.setattr(
        avistamiento_vision_service,
        "verificar_coherencia_avistamiento",
        MagicMock(return_value={
            "estado": "completado",
            "es_animal_real": False,
            "probabilidad_mismo_animal": 0.0,
        }),
    )

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
        )

    assert error.value.status_code == 422
    db.table("avistamientos_animal").insert.assert_not_called()


def test_registrar_avistamiento_bloquea_si_la_especie_no_coincide(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    db = _db_con_evidencia(
        make_query,
        evidencias_mock,
        animal_fotos_query=make_query(data=[{"foto_url": "https://pawalert.test/original.jpg"}]),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    monkeypatch.setattr(
        avistamiento_vision_service,
        "verificar_coherencia_avistamiento",
        MagicMock(return_value={
            "estado": "completado",
            "es_animal_real": True,
            "especie_coincide": False,
            "probabilidad_mismo_animal": 0.1,
        }),
    )

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
        )

    assert error.value.status_code == 422
    db.table("avistamientos_animal").insert.assert_not_called()


def test_registrar_avistamiento_probabilidad_baja_advierte_pero_no_bloquea(
    monkeypatch, make_query
):
    """No es un bloqueo -- casos 'de coincidencia' solo dejan una
    advertencia para quien revise el caso (Fase 8)."""
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(
        make_query,
        evidencias_mock,
        avistamientos_mock,
        animal_fotos_query=make_query(data=[{"foto_url": "https://pawalert.test/original.jpg"}]),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    monkeypatch.setattr(
        avistamiento_vision_service,
        "verificar_coherencia_avistamiento",
        MagicMock(return_value={
            "estado": "completado",
            "es_animal_real": True,
            "especie_coincide": True,
            "probabilidad_mismo_animal": 0.2,
            "modelo": "gemini-3.5-flash-lite",
        }),
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
    )

    insertado = avistamientos_mock.insert.call_args[0][0]
    assert insertado["advertencia_visual"]
    assert insertado["analisis_ia_probabilidad_mismo_animal"] == 0.2
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_probabilidad_alta_no_advierte(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(
        make_query,
        evidencias_mock,
        avistamientos_mock,
        animal_fotos_query=make_query(data=[{"foto_url": "https://pawalert.test/original.jpg"}]),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    monkeypatch.setattr(
        avistamiento_vision_service,
        "verificar_coherencia_avistamiento",
        MagicMock(return_value={
            "estado": "completado",
            "es_animal_real": True,
            "especie_coincide": True,
            "probabilidad_mismo_animal": 0.95,
        }),
    )

    svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
    )

    insertado = avistamientos_mock.insert.call_args[0][0]
    assert insertado["advertencia_visual"] is None


def test_registrar_avistamiento_fallo_tecnico_de_vision_no_bloquea(
    monkeypatch, make_query
):
    """Mismo criterio fail-safe que el resto del modulo: un problema
    externo (Gemini caido, timeout) deja el avistamiento donde ya iba a
    quedar, nunca lo tumba ni le agrega una advertencia inventada."""
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row()])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(
        make_query,
        evidencias_mock,
        avistamientos_mock,
        animal_fotos_query=make_query(data=[{"foto_url": "https://pawalert.test/original.jpg"}]),
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    monkeypatch.setattr(
        avistamiento_vision_service,
        "verificar_coherencia_avistamiento",
        MagicMock(return_value={"estado": "error_tecnico", "detalle": "503"}),
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
    )

    insertado = avistamientos_mock.insert.call_args[0][0]
    assert "advertencia_visual" not in insertado
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_sin_fotos_de_referencia_no_llama_a_la_red(
    monkeypatch, make_query
):
    """Sin fotos del animal en el reporte no hay nada contra que comparar:
    verificar_coherencia_avistamiento (sin mockear) debe salir por
    'sin_referencia' antes de tocar la red -- animal_fotos vacio es el
    default de _db_con_evidencia."""
    from app.api import reports as reports_api

    def _falla_si_se_llama(*args, **kwargs):
        raise AssertionError("no deberia intentarse ninguna llamada de red")

    monkeypatch.setattr(avistamiento_vision_service.httpx, "get", _falla_si_se_llama)
    monkeypatch.setattr(avistamiento_vision_service.httpx, "post", _falla_si_se_llama)

    evidencias_mock = make_query(data=[_evidencia_row()])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-reportante", _avistamiento_create(evidencia_id="evi-1")
    )

    insertado = avistamientos_mock.insert.call_args[0][0]
    assert insertado.get("advertencia_visual") is None
    assert resultado.estado_validacion == "pendiente"


def test_registrar_avistamiento_evidencia_exif_discrepante_marca_revision(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    # EXIF muy lejos del GPS del avistamiento (~19.0001 / -98.0001).
    evidencias_mock = make_query(
        data=[_evidencia_row(exif_latitud=19.5, exif_longitud=-98.0)]
    )
    db = _db_con_evidencia(make_query, evidencias_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    svc.registrar_avistamiento(
        "rep-1",
        "user-reportante",
        _avistamiento_create(evidencia_id="evi-1"),
    )

    vinculacion = evidencias_mock.update.call_args[0][0]
    assert vinculacion["estado_verificacion"] == "discrepancia"
    assert vinculacion["requiere_revision"] is True


def test_registrar_avistamiento_evidencia_inexistente_es_422(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1",
            "user-reportante",
            _avistamiento_create(evidencia_id="evi-x"),
        )

    assert error.value.status_code == 422
    avistamientos_mock.insert.assert_not_called()


def test_registrar_avistamiento_evidencia_de_otro_reporte_es_403(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(data=[_evidencia_row(reporte_id="rep-OTRO")])
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1",
            "user-reportante",
            _avistamiento_create(evidencia_id="evi-1"),
        )

    assert error.value.status_code == 403
    avistamientos_mock.insert.assert_not_called()


def test_registrar_avistamiento_evidencia_ya_vinculada_es_409(
    monkeypatch, make_query
):
    from app.api import reports as reports_api

    evidencias_mock = make_query(
        data=[_evidencia_row(vinculada_at="2026-08-01T00:00:00+00:00")]
    )
    avistamientos_mock = make_query(data=[_fila_insertada()])
    db = _db_con_evidencia(make_query, evidencias_mock, avistamientos_mock)
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1",
            "user-reportante",
            _avistamiento_create(evidencia_id="evi-1"),
        )

    assert error.value.status_code == 409
    avistamientos_mock.insert.assert_not_called()


def test_registrar_avistamiento_desde_hito_propaga_evidencia_id(
    monkeypatch, make_query
):
    """El voluntario subio foto al registrar animal_encontrado /
    animal_no_localizado con direccion: esa evidencia queda vinculada al
    avistamiento derivado sin pedir una subida aparte."""
    avistamientos_mock = make_query(
        data=[_fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")]
    )
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": make_query(data=[{"id": "rep-1"}]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_no_localizado",
        direccion_observada="Rumbo al parque.",
        evidencia_id="evi-hito-1",
    )

    assert avistamientos_mock.insert.call_args[0][0]["evidencia_id"] == "evi-hito-1"


def test_registrar_avistamiento_desde_hito_sin_evidencia_id_queda_none(
    monkeypatch, make_query
):
    """Regresion del llamador de Fase 1: sin foto, la columna sigue en NULL."""
    avistamientos_mock = make_query(
        data=[_fila_insertada(fuente="voluntario_asignado", estado_validacion="validado")]
    )
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": make_query(data=[{"id": "rep-1"}]),
            "historial_reporte": make_query(data=[{"id": "hist-1"}]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.registrar_avistamiento_desde_hito(
        reporte_id="rep-1",
        animal_id="animal-1",
        usuario_id="user-vol",
        latitud=19.0,
        longitud=-98.0,
        tipo_hito="animal_encontrado",
    )

    assert avistamientos_mock.insert.call_args[0][0]["evidencia_id"] is None


# --- Fase 8: bandeja de pendientes de la asociacion -------------------------


def _pendiente(
    *,
    id: str,
    reporte_id: str = "rep-1",
    animal_id: str = "animal-1",
    observado_at: str = "2026-08-27T12:00:00+00:00",
    registrado_at: str = "2026-08-27T12:05:00+00:00",
    fuente: str = "confirmacion_reportante",
    evidencia_id: str | None = None,
    asociacion_asignada_id: str = "aso-1",
    tipo_animal: str = "perro",
) -> dict:
    """Fila tal como la devuelve el SELECT de listar_pendientes_asociacion,
    con los embeds de PostgREST ya anidados."""
    return {
        "id": id,
        "reporte_id": reporte_id,
        "animal_id": animal_id,
        "latitud": 19.0,
        "longitud": -98.0,
        "precision_metros": 12,
        "observado_at": observado_at,
        "registrado_at": registrado_at,
        "fuente": fuente,
        "movilidad_observada": "limitada",
        "direccion_observada": None,
        "comentario": None,
        "evidencia_id": evidencia_id,
        "usuario_id": "user-x",
        "usuarios": {"nombre": "Ana", "apellido_paterno": "Pérez"},
        "animal": {"orden": 1, "tipo_animal_catalogo": {"clave": tipo_animal}},
        "reportes": {
            "id": reporte_id,
            "estado_reporte": "asignado",
            "municipio": "Puebla",
            "colonia": "Centro",
            "calle": "Reforma",
            "created_at": "2026-08-27T10:00:00+00:00",
            "asociacion_asignada_id": asociacion_asignada_id,
        },
    }


def _db_pendientes(make_query, filas, evidencias=None):
    avistamientos = make_query(data=filas)
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos,
            "reporte_evidencias": make_query(data=evidencias or []),
        }
    )
    return db, avistamientos


def test_pendientes_filtra_por_la_asociacion_del_usuario(monkeypatch, make_query):
    """El !inner filtra en la base; ademas el service descarta cualquier fila
    de otra asociacion que llegara a colarse."""
    db, avistamientos = _db_pendientes(
        make_query,
        [
            _pendiente(id="av-mio", reporte_id="rep-1"),
            _pendiente(
                id="av-ajeno", reporte_id="rep-9", asociacion_asignada_id="aso-OTRA"
            ),
        ],
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    grupos = svc.listar_pendientes_asociacion("aso-1")

    ids = [a["id"] for g in grupos for a in g["avistamientos"]]
    assert ids == ["av-mio"]
    assert [g["reporte_id"] for g in grupos] == ["rep-1"]
    # el filtro tambien viaja a la consulta, no solo al post-procesado
    avistamientos.eq.assert_any_call("estado_validacion", "pendiente")
    avistamientos.eq.assert_any_call("reportes.asociacion_asignada_id", "aso-1")


def test_pendientes_agrupa_por_reporte_y_marca_conflicto(monkeypatch, make_query):
    """Un reporte con 1 pendiente y otro con 3 compitiendo: ambos casos
    presentes y diferenciados por `en_conflicto`."""
    db, _ = _db_pendientes(
        make_query,
        [
            _pendiente(id="av-solo", reporte_id="rep-solo"),
            _pendiente(
                id="av-a",
                reporte_id="rep-conflicto",
                observado_at="2026-08-27T11:00:00+00:00",
            ),
            _pendiente(
                id="av-b",
                reporte_id="rep-conflicto",
                observado_at="2026-08-27T13:00:00+00:00",
            ),
            _pendiente(
                id="av-c",
                reporte_id="rep-conflicto",
                observado_at="2026-08-27T12:00:00+00:00",
            ),
        ],
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    grupos = {g["reporte_id"]: g for g in svc.listar_pendientes_asociacion("aso-1")}

    assert len(grupos) == 2
    assert grupos["rep-solo"]["en_conflicto"] is False
    assert len(grupos["rep-solo"]["avistamientos"]) == 1

    conflicto = grupos["rep-conflicto"]
    assert conflicto["en_conflicto"] is True
    # dentro del grupo, el observado mas reciente va primero
    assert [a["id"] for a in conflicto["avistamientos"]] == ["av-b", "av-c", "av-a"]


def test_pendientes_incluye_lo_necesario_para_comparar(monkeypatch, make_query):
    db, _ = _db_pendientes(
        make_query,
        [_pendiente(id="av-1", evidencia_id="evi-1")],
        evidencias=[{"id": "evi-1", "foto_url": "https://x/evi.jpg"}],
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    grupo = svc.listar_pendientes_asociacion("aso-1")[0]
    avistamiento = grupo["avistamientos"][0]

    assert avistamiento["foto_url"] == "https://x/evi.jpg"
    assert avistamiento["registrado_por"] == "Ana Pérez"
    assert avistamiento["fuente"] == "confirmacion_reportante"
    assert avistamiento["observado_at"] == "2026-08-27T12:00:00+00:00"
    assert (avistamiento["latitud"], avistamiento["longitud"]) == (19.0, -98.0)
    assert avistamiento["animal"] == {"orden": 1, "tipo_animal": "perro"}
    assert grupo["reporte"]["municipio"] == "Puebla"


def test_pendientes_sin_evidencia_no_consulta_fotos(monkeypatch, make_query):
    evidencias = make_query(data=[])
    db = _armar_db(
        {
            "avistamientos_animal": make_query(data=[_pendiente(id="av-1")]),
            "reporte_evidencias": evidencias,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    grupo = svc.listar_pendientes_asociacion("aso-1")[0]

    assert grupo["avistamientos"][0]["foto_url"] is None
    evidencias.select.assert_not_called()


def test_pendientes_sin_resultados_devuelve_lista_vacia(monkeypatch, make_query):
    db, _ = _db_pendientes(make_query, [])
    monkeypatch.setattr(svc, "supabase_admin", db)

    assert svc.listar_pendientes_asociacion("aso-1") == []





# --- Entrega C: fuente testigo_cercano (rol + trust_score, sin auto-valida) -


def _reporte_ajeno(**cambios):
    """Reporte de alguien mas: ni usuario_id ni staff_asignado_id coinciden
    con quien intenta registrar el avistamiento como testigo_cercano, asi
    que _resolver_fuente tiene que llegar hasta el ultimo camino posible."""
    datos = _reporte(usuario_id="otro-reportante", staff_asignado_id="otro-staff")
    datos.update(cambios)
    return datos


def _db_testigo_cercano(monkeypatch, make_query, *, rol, cap_count=0):
    """Escenario minimo para que _resolver_fuente llegue a evaluar
    testigo_cercano: reporte ajeno, usuario con el rol dado, sin voluntario
    verificado (tabla voluntarios vacia), con la foto obligatoria ya
    vinculable y sin fotos de referencia (asi _verificar_coherencia_visual
    se sale temprano sin llamar a Gemini de verdad)."""
    from app.api import reports as reports_api

    reporte = _reporte_ajeno()
    evidencias_mock = make_query(data=[_evidencia_row(usuario_id="user-testigo")])
    avistamientos_mock = make_query(
        execute_results=[
            SimpleNamespace(data=[], count=cap_count),  # chequeo de cap
            [_fila_insertada(fuente="testigo_cercano", usuario_id="user-testigo")],  # INSERT
        ]
    )
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(data=[_usuario(id="user-testigo", roles={"nombre": rol})]),
            "voluntarios": make_query(data=[]),
            "animal": make_query(data=[{"id": "animal-1"}]),
            "reporte_evidencias": evidencias_mock,
            "animal_fotos": make_query(data=[]),
            "avistamientos_animal": avistamientos_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    monkeypatch.setattr(reports_api, "supabase_admin", db)
    return db, avistamientos_mock, evidencias_mock


def test_testigo_cercano_resuelve_por_rol_y_trust_score_suficiente(
    monkeypatch, make_query
):
    """voluntario_interno, sin ningun camino propio en _resolver_fuente y
    con trust_score en el umbral: se le resuelve testigo_cercano y el
    avistamiento entra pendiente."""
    _mockear_trust(monkeypatch, 60)
    _, avistamientos_mock, _ = _db_testigo_cercano(
        monkeypatch, make_query, rol="voluntario_interno"
    )

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-testigo", _avistamiento_create(evidencia_id="evi-1")
    )

    assert resultado.fuente == LocationSource.testigo_cercano
    assert resultado.estado_validacion == "pendiente"
    # Solo dos ejecuciones sobre avistamientos_animal: el chequeo de cap y
    # el INSERT -- nunca llega a evaluar condiciones de auto-validacion
    # (eso se prueba aparte, directo sobre la funcion).
    assert avistamientos_mock.execute.call_count == 2


def test_testigo_cercano_reportante_de_caso_ajeno_tambien_resuelve(
    monkeypatch, make_query
):
    """El reportante SI entra a testigo_cercano, pero solo para un caso que
    no es el suyo -- si lo fuera, ya habria salido por
    confirmacion_reportante antes de llegar aqui."""
    _mockear_trust(monkeypatch, 60)
    _, _, _ = _db_testigo_cercano(monkeypatch, make_query, rol="reportante")

    resultado = svc.registrar_avistamiento(
        "rep-1", "user-testigo", _avistamiento_create(evidencia_id="evi-1")
    )

    assert resultado.fuente == LocationSource.testigo_cercano


def test_testigo_cercano_rol_no_habilitado_no_resuelve_fuente(monkeypatch, make_query):
    """aliado_local no esta en ROLES_TESTIGO_CERCANO (decision explicita del
    equipo): sin ruta propia, se niega el acceso con 403 aunque el trust
    score fuera perfecto."""
    _mockear_trust(monkeypatch, 100)
    reporte = _reporte_ajeno()
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[_usuario(id="user-aliado", roles={"nombre": "aliado_local"})]
            ),
            "voluntarios": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-aliado", _avistamiento_create())

    assert error.value.status_code == 403


def test_testigo_cercano_trust_score_insuficiente_no_resuelve_fuente(
    monkeypatch, make_query
):
    """Rol habilitado pero trust_score bajo el umbral: a diferencia de
    _cumple_trust_y_radio (que solo afecta que tan rapido se auto-valida),
    aqui el trust bajo bloquea el registro en si mismo."""
    _mockear_trust(monkeypatch, 59)
    reporte = _reporte_ajeno()
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[_usuario(id="user-donante", roles={"nombre": "donante_comunitario"})]
            ),
            "voluntarios": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-donante", _avistamiento_create())

    assert error.value.status_code == 403


def test_testigo_cercano_fallo_consultando_trust_score_niega_acceso(
    monkeypatch, make_query
):
    """A diferencia del resto del modulo (fail-open cuando el motor de
    reputacion falla), aqui un fallo NIEGA el acceso: es un limite de
    seguridad de entrada, no una optimizacion de auto-validacion."""
    def _explota(usuario_id, rol):
        raise RuntimeError("trust_score no disponible")

    monkeypatch.setattr(reputacion_service, "consultar_restricciones", _explota)
    reporte = _reporte_ajeno()
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[_usuario(id="user-patro", roles={"nombre": "patrocinador_institucional"})]
            ),
            "voluntarios": make_query(data=[]),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-patro", _avistamiento_create())

    assert error.value.status_code == 403


def test_testigo_cercano_exige_foto_obligatoria(monkeypatch, make_query):
    """A diferencia de las demas fuentes (foto opcional), testigo_cercano
    la exige: sin evidencia_id el registro nunca llega a intentarse."""
    _mockear_trust(monkeypatch, 60)
    reporte = _reporte_ajeno()
    avistamientos_mock = make_query(data=[])
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[_usuario(id="user-testigo", roles={"nombre": "voluntario_interno"})]
            ),
            "voluntarios": make_query(data=[]),
            "avistamientos_animal": avistamientos_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento("rep-1", "user-testigo", _avistamiento_create())

    assert error.value.status_code == 422
    assert "fotografía" in error.value.detail
    avistamientos_mock.insert.assert_not_called()


def test_testigo_cercano_cap_de_pendientes_bloquea_nuevo_registro(
    monkeypatch, make_query
):
    """Anti-spam (Entrega C): al llegar al cap (3 por defecto) de
    pendientes propios de esta fuente, un nuevo intento se rechaza antes de
    tocar evidencia o el INSERT."""
    _mockear_trust(monkeypatch, 60)
    reporte = _reporte_ajeno()
    avistamientos_mock = make_query(data=[], count=3)
    db = _armar_db(
        {
            "reportes": make_query(data=[reporte]),
            "usuarios": make_query(
                data=[_usuario(id="user-testigo", roles={"nombre": "voluntario_interno"})]
            ),
            "voluntarios": make_query(data=[]),
            "avistamientos_animal": avistamientos_mock,
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        svc.registrar_avistamiento(
            "rep-1", "user-testigo", _avistamiento_create(evidencia_id="evi-1")
        )

    assert error.value.status_code == 422
    assert "esperando revisión" in error.value.detail
    avistamientos_mock.insert.assert_not_called()


def test_testigo_cercano_nunca_auto_valida_ni_por_corroboracion(monkeypatch, make_query):
    """Condicion central de la fuente: ni siquiera la corroboracion
    (condicion 3, fuente-agnostica por diseno) puede auto-validar un
    testigo_cercano. Se prueba la funcion directo y sin montar NINGUN mock
    de base de datos -- si el codigo intentara consultar trust_score o
    corroboracion igual, esta prueba fallaria al golpear una conexion real
    en vez de pasar limpiamente."""
    fila = _fila_completa(fuente="testigo_cercano")

    se_auto_valida, motivo = svc._validar_condiciones_auto_validacion(
        _reporte_ajeno(), fila
    )

    assert se_auto_valida is False
    assert motivo is None


# --- Entrega C: rechazar como falso -> incidente confirmado (trust_score) -


def _pendiente_testigo_cercano(**cambios):
    datos = {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": "testigo_cercano",
        "estado_validacion": "pendiente",
        "latitud": 19.0,
        "longitud": -98.0,
        "registrado_at": datetime.now(timezone.utc).isoformat(),
        "usuario_id": "user-testigo",
    }
    datos.update(cambios)
    return datos


def test_validar_avistamiento_es_falso_dispara_incidente_confirmado(
    monkeypatch, make_query
):
    from app.services import incidentes_service

    avistamiento = _pendiente_testigo_cercano()
    db = _armar_db(
        {
            "avistamientos_animal": make_query(
                execute_results=[[avistamiento], [{"id": "av-1"}]]
            ),
            "reportes": make_query(data=[_reporte(asociacion_asignada_id="aso-1")]),
            "usuarios": make_query(
                execute_results=[
                    [_usuario(id="user-aso", asociacion_id="aso-1", roles={"nombre": "asociacion"})],
                    [_usuario(id="user-testigo", roles={"nombre": "voluntario_interno"})],
                ]
            ),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    registrar_mock = MagicMock(return_value={"id": "inc-1"})
    confirmar_mock = MagicMock(return_value={"id": "inc-1", "estado": "confirmado"})
    monkeypatch.setattr(incidentes_service, "registrar_incidente", registrar_mock)
    monkeypatch.setattr(incidentes_service, "confirmar_incidente", confirmar_mock)

    resultado = svc.validar_avistamiento("av-1", "user-aso", False, True)

    assert resultado.estado_validacion == "rechazado"
    registrar_mock.assert_called_once()
    kwargs = registrar_mock.call_args.kwargs
    assert kwargs["usuario_id"] == "user-testigo"
    assert kwargs["rol"] == "voluntario_interno"
    assert kwargs["tipo_incidente"] == "avistamiento_falso"
    assert kwargs["registrado_por"] == "user-aso"
    assert kwargs["actor_tipo"] == "asociacion"
    assert kwargs["reporte_id"] == "rep-1"
    confirmar_mock.assert_called_once_with(
        incidente_id="inc-1", confirmado_por="user-aso", actor_tipo="asociacion"
    )


def test_validar_avistamiento_rechazo_normal_no_dispara_incidente(monkeypatch, make_query):
    """Sin es_falso=True (el default), rechazar sigue siendo pura
    transicion de estado -- ningun cambio de comportamiento para el resto
    de rechazos que ya existian."""
    from app.services import incidentes_service

    avistamiento = _pendiente_testigo_cercano()
    db = _armar_db(
        {
            "avistamientos_animal": make_query(
                execute_results=[[avistamiento], [{"id": "av-1"}]]
            ),
            "reportes": make_query(data=[_reporte(asociacion_asignada_id="aso-1")]),
            "usuarios": make_query(
                data=[_usuario(id="user-aso", asociacion_id="aso-1", roles={"nombre": "asociacion"})]
            ),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    registrar_mock = MagicMock()
    monkeypatch.setattr(incidentes_service, "registrar_incidente", registrar_mock)

    resultado = svc.validar_avistamiento("av-1", "user-aso", False)

    assert resultado.estado_validacion == "rechazado"
    registrar_mock.assert_not_called()


def test_validar_avistamiento_es_falso_ignorado_si_fuente_no_es_testigo_cercano(
    monkeypatch, make_query
):
    """El incidente es exclusivo de testigo_cercano: para las demas
    fuentes, es_falso=True no hace nada distinto de un rechazo normal."""
    from app.services import incidentes_service

    avistamiento = _pendiente_testigo_cercano(fuente="confirmacion_reportante")
    db = _armar_db(
        {
            "avistamientos_animal": make_query(
                execute_results=[[avistamiento], [{"id": "av-1"}]]
            ),
            "reportes": make_query(data=[_reporte(asociacion_asignada_id="aso-1")]),
            "usuarios": make_query(
                data=[_usuario(id="user-aso", asociacion_id="aso-1", roles={"nombre": "asociacion"})]
            ),
        }
    )
    monkeypatch.setattr(svc, "supabase_admin", db)
    registrar_mock = MagicMock()
    monkeypatch.setattr(incidentes_service, "registrar_incidente", registrar_mock)

    resultado = svc.validar_avistamiento("av-1", "user-aso", False, True)

    assert resultado.estado_validacion == "rechazado"
    registrar_mock.assert_not_called()


def test_pendientes_desambigua_la_fk_con_reportes(monkeypatch, make_query):
    """Regresion de un fallo que solo aparecio contra Supabase real (PGRST201):
    hay DOS relaciones entre avistamientos_animal y reportes (reporte_id ->
    reportes.id, y reportes.ultima_ubicacion_confirmada_id -> avistamientos.id,
    ambas de la migracion 0071). El embed debe nombrar la FK explicitamente o
    PostgREST rechaza la consulta."""
    db, avistamientos = _db_pendientes(make_query, [_pendiente(id="av-1")])
    monkeypatch.setattr(svc, "supabase_admin", db)

    svc.listar_pendientes_asociacion("aso-1")

    select = avistamientos.select.call_args.args[0]
    assert "reportes!avistamientos_animal_reporte_id_fkey!inner(" in select
