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
from app.services import avistamiento_service as svc


def _reporte(**cambios):
    datos = {
        "id": "rep-1",
        "usuario_id": "user-reportante",
        "staff_asignado_id": "user-staff",
        "asociacion_asignada_id": "aso-1",
        "latitud": 19.0,
        "longitud": -98.0,
        "ultima_ubicacion_confirmada_id": None,
    }
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
        {"ultima_ubicacion_confirmada_id": "av-1"}
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
        {"ultima_ubicacion_confirmada_id": "av-1"}
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
        {"ultima_ubicacion_confirmada_id": "av-1"}
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
