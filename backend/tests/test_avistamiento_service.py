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
from app.services import assignment_route_service
from app.services import duplicate_service
from app.services import urgency_service


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
        execute_results=[[avistamiento], [{**avistamiento, "estado_validacion": "validado"}]]
    )
    reportes_mock = make_query(data=[reporte])
    historial_mock = make_query(data=[{"id": "hist-1"}])
    db = _armar_db(
        {
            "avistamientos_animal": avistamientos_mock,
            "reportes": reportes_mock,
            "usuarios": make_query(data=[usuario]),
            "historial_reporte": historial_mock,
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
