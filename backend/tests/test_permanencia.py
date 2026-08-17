import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

os.environ["SUPABASE_URL"] = "http://localhost:8000"
JWT_DUMMY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ."
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
)
os.environ["SUPABASE_KEY"] = JWT_DUMMY
os.environ["SUPABASE_SERVICE_KEY"] = JWT_DUMMY

from app.api import permanencia as api
from app.services import permanencia_service as scheduler
from app.services import revision_manual_service as revision


def _pendiente(**cambios):
    datos = {
        "usuario_id": "usuario-reportante",
        "confirmacion_permanencia_respuesta": None,
        "confirmacion_permanencia_solicitada_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "confirmacion_permanencia_deadline_at": (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).isoformat(),
    }
    datos.update(cambios)
    return datos


def test_ruta_invitada_no_compite_con_reporte_id_dinamico():
    rutas = {route.path for route in api.router.routes}
    assert "/confirmacion-permanencia/invitado" in rutas
    assert "/invitados/confirmacion-permanencia" not in rutas


def test_transicion_revision_traduce_conflicto(monkeypatch):
    rpc = MagicMock()
    rpc.execute.side_effect = Exception("atencion_en_curso")
    db = MagicMock()
    db.rpc.return_value = rpc
    monkeypatch.setattr(revision, "supabase_admin", db)

    with pytest.raises(revision.AtencionEnCursoError):
        revision.transicionar_a_revision_manual("reporte-1", "timeout")

    db.rpc.assert_called_once_with(
        "transicion_revision_manual",
        {"p_reporte_id": "reporte-1", "p_motivo": "timeout"},
    )


def test_respuesta_autenticada_exige_propiedad(monkeypatch, make_query):
    reportes = make_query(data=[_pendiente(usuario_id="otro-usuario")])
    db = MagicMock()
    db.table.return_value = reportes
    monkeypatch.setattr(api, "supabase_admin", db)

    with pytest.raises(HTTPException) as error:
        api.procesar_respuesta_permanencia(
            "reporte-1", "sigue_ahi", "usuario-reportante"
        )

    assert error.value.status_code == 403
    reportes.update.assert_not_called()


def test_ya_no_esta_usa_transicion_y_destinatarios_reales(
    monkeypatch, make_query
):
    reportes = make_query(data=[_pendiente()])
    usuarios = make_query(
        data=[
            {"id": "staff-1", "roles": {"nombre": "staff"}},
            {"id": "vol-externo", "roles": {"nombre": "voluntario_externo"}},
        ]
    )
    db = MagicMock()
    db.table.side_effect = lambda tabla: {
        "reportes": reportes,
        "usuarios": usuarios,
    }[tabla]
    transicion = MagicMock(
        return_value={
            "estado": "revision_manual",
            "reporte_id": "reporte-1",
            "reportante_id": "usuario-reportante",
            "asociacion_coordinadora_id": "asociacion-1",
            "usuarios_propuesta": ["voluntario-1"],
        }
    )
    push = MagicMock()
    monkeypatch.setattr(api, "supabase_admin", db)
    monkeypatch.setattr(api, "transicionar_a_revision_manual", transicion)
    monkeypatch.setattr(api, "queue_and_send_push", push)

    resultado = api.procesar_respuesta_permanencia(
        "reporte-1", "ya_no_esta", "usuario-reportante"
    )

    assert "pasó a revisión" in resultado["mensaje"]
    transicion.assert_called_once_with(
        "reporte-1", "confirmacion_permanencia_ya_no_esta"
    )
    assert {llamada.kwargs["usuario_id"] for llamada in push.call_args_list} == {
        "usuario-reportante",
        "voluntario-1",
        "staff-1",
    }


def test_conflicto_no_finge_que_reporte_paso_a_revision(
    monkeypatch, make_query
):
    db = MagicMock()
    db.table.return_value = make_query(data=[_pendiente()])
    monkeypatch.setattr(api, "supabase_admin", db)
    monkeypatch.setattr(
        api,
        "transicionar_a_revision_manual",
        MagicMock(side_effect=api.AtencionEnCursoError("atencion_en_curso")),
    )
    push = MagicMock()
    monkeypatch.setattr(api, "queue_and_send_push", push)

    with pytest.raises(HTTPException) as error:
        api.procesar_respuesta_permanencia(
            "reporte-1", "ya_no_esta", "usuario-reportante"
        )

    assert error.value.status_code == 409
    push.assert_not_called()


def test_sigue_ahi_libera_solicitud_para_una_revision_futura(
    monkeypatch, make_query
):
    reportes = make_query(
        execute_results=[[_pendiente()], [{"id": "reporte-1"}]]
    )
    historial = make_query(data=[{"id": "evento-1"}])
    db = MagicMock()
    db.table.side_effect = lambda tabla: {
        "reportes": reportes,
        "historial_reporte": historial,
    }[tabla]
    monkeypatch.setattr(api, "supabase_admin", db)

    api.procesar_respuesta_permanencia(
        "reporte-1", "sigue_ahi", "usuario-reportante"
    )

    cambio = reportes.update.call_args.args[0]
    assert cambio["confirmacion_permanencia_solicitada_at"] is None
    assert cambio["confirmacion_permanencia_deadline_at"] is None
    assert cambio["confirmacion_permanencia_respuesta"] == "sigue_ahi"
    historial.insert.assert_called_once()


def test_invitado_recibe_enlace_por_whatsapp_sin_exponer_token(
    monkeypatch, make_query, caplog
):
    reportes = make_query(data=[{"id": "reporte-invitado"}])
    tokens = make_query(
        execute_results=[[], [{"id": "token-1"}]]
    )
    db = MagicMock()
    db.table.side_effect = lambda tabla: {
        "reportes": reportes,
        "tokens_confirmacion_permanencia": tokens,
    }[tabla]
    encolar = MagicMock(return_value={"id": "aviso-1"})
    enviar = MagicMock()
    monkeypatch.setattr(scheduler, "supabase_admin", db)
    monkeypatch.setattr(scheduler, "encolar_notificacion", encolar)
    monkeypatch.setattr(scheduler, "procesar_notificacion", enviar)
    monkeypatch.setattr(
        scheduler.secrets, "token_urlsafe", MagicMock(return_value="token-secreto")
    )

    creado = scheduler._crear_solicitud(
        {
            "reporte_id": "reporte-invitado",
            "usuario_id": None,
            "reportante_telefono": "5512345678",
        }
    )

    assert creado is True
    destinatario = encolar.call_args.args[2]
    assert destinatario["telefono"] == "whatsapp:+525512345678"
    assert "token=token-secreto" in destinatario["enlace"]
    assert "token-secreto" not in caplog.text
    enviar.assert_called_once_with("aviso-1")


def test_cron_reporta_por_separado_conflictos_y_errores(
    monkeypatch, make_query
):
    reportes = make_query(
        data=[{"id": "ok"}, {"id": "ocupado"}, {"id": "error"}]
    )
    reportes.lt.return_value = reportes
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(data=[])
    db = MagicMock()
    db.table.return_value = reportes
    db.rpc.return_value = rpc
    transicion = MagicMock(
        side_effect=[
            {"estado": "revision_manual"},
            scheduler.AtencionEnCursoError("atencion_en_curso"),
            scheduler.RevisionManualError("fallo"),
        ]
    )
    monkeypatch.setattr(scheduler, "supabase_admin", db)
    monkeypatch.setattr(scheduler, "transicionar_a_revision_manual", transicion)

    resultado = scheduler.procesar_confirmaciones_permanencia()

    assert resultado == {
        "caducados_procesados": 1,
        "caducados_con_atencion": 1,
        "caducados_con_error": 1,
        "solicitudes_creadas": 0,
    }
