import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import custody, reports
from app.main import app
from app.services import report_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer token"}


def _usuario_externo():
    return {"id": "user-ext", "rol": "voluntario_externo", "asociacion_id": None}


def _custodia():
    return {
        "id": "cust-1",
        "reporte_id": "rep-1",
        "voluntario_id": "vol-1",
        "asociacion_coordinadora_id": "aso-1",
        "estado": "activo",
        "inicio_at": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
        "seguimiento_inicial_at": None,
    }


def test_seguimiento_inicial_exige_foto_entorno(make_query):
    tablas = {"custodias_temporales": make_query(data=[_custodia()])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "_usuario", return_value=_usuario_externo()),
        patch.object(custody, "_voluntario_externo", return_value={"id": "vol-1"}),
    ):
        response = client.post(
            "/custody/cust-1/followups",
            headers=AUTH,
            json={
                "condicion_actual": "Estable",
                "salud": "Sin cambios visibles",
                "alimentacion": "Comió correctamente",
                "comportamiento": "Tranquilo",
                "foto_url": "https://pawalert.test/animal.jpg",
            },
        )

    assert response.status_code == 422
    assert "foto del entorno" in response.json()["detail"]


def test_seguimiento_inicial_programa_siguiente_revision(make_query):
    tablas = {
        "custodias_temporales": make_query(data=[_custodia()]),
        "seguimientos_resguardo": make_query(data=[{"id": "seg-1"}]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "_usuario", return_value=_usuario_externo()),
        patch.object(custody, "_voluntario_externo", return_value={"id": "vol-1"}),
        patch.object(custody, "registrar_historial") as historial,
    ):
        response = client.post(
            "/custody/cust-1/followups",
            headers=AUTH,
            json={
                "condicion_actual": "Estable",
                "salud": "Sin cambios visibles",
                "alimentacion": "Comió y tomó agua",
                "comportamiento": "Tranquilo",
                "foto_url": "https://pawalert.test/animal.jpg",
                "entorno_foto_url": "https://pawalert.test/entorno.jpg",
            },
        )

    assert response.status_code == 201
    payload = tablas["seguimientos_resguardo"].insert.call_args.args[0]
    assert payload["tipo"] == "inicial"
    assert payload["estado_validacion"] == "pendiente"
    assert payload["gemini_analisis"]["estado"] == "revision_manual"
    assert tablas["custodias_temporales"].update.call_args.args[0]["frecuencia_horas"] == 72
    assert historial.call_args.kwargs["tipo_evento"] == "seguimiento_inicial"


def test_solicitud_relevo_no_transfiere_custodia(make_query):
    solicitudes = make_query(
        execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "sol-1"}], count=None),
        ]
    )
    tablas = {
        "custodias_temporales": make_query(data=[_custodia()]),
        "solicitudes_relevo": solicitudes,
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "_usuario", return_value=_usuario_externo()),
        patch.object(custody, "_voluntario_externo", return_value={"id": "vol-1"}),
        patch.object(custody, "registrar_historial"),
    ):
        response = client.post(
            "/custody/cust-1/relief",
            headers=AUTH,
            json={"motivo": "Ya no podré continuar después del viernes."},
        )

    assert response.status_code == 201
    tablas["custodias_temporales"].update.assert_called_once_with(
        {"estado": "buscando_relevo"}
    )


def test_aceptar_relevo_usa_reserva_transaccional():
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[{
            "custodia_id": "cust-1",
            "radio_actual_km": 50,
            "custodias_temporales": {"voluntario_id": "vol-1", "reporte_id": "rep-1"},
        }]
    )
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data="transfer-1")
    usuario = {"id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-2"}

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "supabase_admin", supabase),
        patch.object(custody, "_usuario", return_value=usuario),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-2"}),
        patch.object(custody, "_en_radio_regional", return_value=True),
        patch.object(custody, "registrar_historial"),
    ):
        response = client.post(
            "/custody/relief/sol-1/accept",
            headers=AUTH,
            json={"fecha_programada": "2026-08-05T18:00:00Z"},
        )

    assert response.status_code == 200
    assert response.json()["transferencia_id"] == "transfer-1"
    supabase.rpc.assert_called_once()


def test_transferencia_no_finaliza_con_una_sola_confirmacion(make_query):
    tablas = {
        "transferencias_custodia": make_query(
            data=[{
                "id": "transfer-1",
                "asociacion_receptora_id": "aso-2",
                "custodias_temporales": {"voluntario_id": "vol-1", "reporte_id": "rep-1"},
            }]
        )
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data="en_curso")

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "supabase_admin", supabase),
        patch.object(custody, "_usuario", return_value=_usuario_externo()),
        patch.object(custody, "_voluntario_externo", return_value={"id": "vol-1"}),
        patch.object(custody, "registrar_historial"),
    ):
        response = client.post(
            "/custody/transfers/transfer-1/confirm",
            headers=AUTH,
            json={
                "foto_url": "https://pawalert.test/entrega.jpg",
                "latitud": 19.43,
                "longitud": -99.13,
            },
        )

    assert response.status_code == 200
    assert response.json() == {"estado": "en_curso", "confirmacion": "entrega"}


def test_reportante_recibe_estado_general_sin_datos_del_hogar(make_query):
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1",
            "estado_reporte": "rescatado",
            "estado_cobertura": "finalizado",
            "latitud": 19.43,
            "longitud": -99.13,
            "municipio": "Puebla",
            "colonia": "Centro",
            "calle": "Calle del reporte",
            "created_at": "2026-08-01T10:00:00Z",
            "asociacion_asignada_id": "aso-1",
            "staff_asignado_id": "user-ext",
            "animal": [],
            "asociaciones": {"nombre": "Patitas"},
        }]),
        "historial_reporte": make_query(
            data=[{"reporte_id": "rep-1", "tipo_evento": "seguimiento_inicial"}]
        ),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(report_service, "supabase", supabase):
        resultado = asyncio.run(report_service.obtener_reportes_usuario("reportante-1"))

    assert resultado[0]["estado_publico"] == "En seguimiento"
    assert resultado[0]["asociacion_nombre"] == "Patitas"
    assert "direccion_hogar" not in resultado[0]


def test_reportante_cancela_antes_de_confirmacion_y_expira_interes(make_query):
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1",
            "usuario_id": "reportante-1",
            "estado_reporte": "asignado",
            "estado_cobertura": "abierto",
            "staff_asignado_id": None,
        }]),
        "propuestas_asignacion": make_query(data=[]),
        "voluntario_ofrecimientos": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value={"id": "reportante-1", "rol": "reportante"},
        ),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post("/reports/rep-1/cancel", headers=AUTH, json={})

    assert response.status_code == 200
    assert response.json()["cancelado"] is True
    tablas["propuestas_asignacion"].update.assert_called_once()
    tablas["voluntario_ofrecimientos"].update.assert_called_once()
    assert tablas["reportes"].update.call_args.args[0]["estado_cobertura"] == "finalizado"
    assert historial.call_args.kwargs["tipo_evento"] == "reporte_cancelado"


def test_cancelacion_con_voluntario_en_camino_solo_avisa(make_query):
    tablas = {
        "reportes": make_query(data=[{
            "id": "rep-1",
            "usuario_id": "reportante-1",
            "estado_reporte": "en_camino",
            "estado_cobertura": "confirmado",
            "staff_asignado_id": "user-ext",
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(reports, "supabase", supabase),
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value={"id": "reportante-1", "rol": "reportante"},
        ),
        patch.object(report_service, "registrar_historial") as historial,
    ):
        response = client.post("/reports/rep-1/cancel", headers=AUTH, json={})

    assert response.status_code == 200
    assert response.json()["cancelado"] is False
    tablas["reportes"].update.assert_not_called()
    assert historial.call_args.kwargs["tipo_evento"] == "cancelacion_reportante_avisada"


def test_coordinadora_finaliza_custodia_transferida(make_query):
    tablas = {
        "custodias_temporales": make_query(
            data=[{
                "id": "cust-1",
                "reporte_id": "rep-1",
                "estado": "transferido",
                "asociacion_coordinadora_id": "aso-2",
            }]
        ),
        "reporte_estados": make_query(data=[{"id": 6}]),
        "reportes": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(
            custody,
            "_usuario",
            return_value={"id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-2"},
        ),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-2"}),
        patch.object(custody, "registrar_historial") as historial,
    ):
        response = client.post(
            "/custody/cust-1/finish",
            headers=AUTH,
            json={
                "resolucion": "transferencia_confirmada",
                "referencia_proceso": "Entrega validada por ambas partes",
            },
        )

    assert response.status_code == 200
    assert response.json()["estado"] == "finalizado"
    assert tablas["custodias_temporales"].update.call_args.args[0]["estado"] == "finalizado"
    assert tablas["reportes"].update.call_args.args[0]["estado_reporte"] == "cerrado"
    assert historial.call_args.kwargs["tipo_evento"] == "custodia_finalizada"


def test_escalamiento_amplia_radio_sin_interrumpir_custodia(make_query):
    fecha_antigua = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    tablas = {
        "solicitudes_relevo": make_query(
            data=[{
                "id": "sol-1",
                "radio_actual_km": 50,
                "solicitada_at": fecha_antigua,
                "ultima_ampliacion_at": None,
            }]
        )
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(custody, "supabase", supabase):
        resultado = custody.escalar_relevos_sin_respuesta()

    assert resultado == {"radios_ampliados": 1, "escaladas_administracion": 0}
    assert tablas["solicitudes_relevo"].update.call_args.args[0]["radio_actual_km"] == 100


def test_domicilio_solo_se_comparte_con_coordinadora_o_receptora():
    custodia = {"asociacion_coordinadora_id": "aso-1"}
    transferencia = {"asociacion_receptora_id": "aso-2"}

    assert custody._puede_ver_ubicacion_hogar(custodia, transferencia, "aso-1")
    assert custody._puede_ver_ubicacion_hogar(custodia, transferencia, "aso-2")
    assert not custody._puede_ver_ubicacion_hogar(custodia, transferencia, "aso-3")


def test_revision_regional_se_reserva_por_rpc(make_query):
    tablas = {
        "seguimientos_resguardo": make_query(data=[{"id": "seg-1", "custodia_id": "cust-1"}]),
        "custodias_temporales": make_query(
            data=[{"asociacion_coordinadora_id": "aso-1", "voluntario_id": "vol-1"}]
        ),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"revision_id": "rev-1", "vence_at": "2026-08-02T21:00:00Z"}
    )
    usuario = {"id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-1"}

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "supabase_admin", supabase_admin),
        patch.object(custody, "_usuario", return_value=usuario),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-1"}),
    ):
        response = client.post(
            "/custody/followups/seg-1/review/reserve",
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json()["revision_id"] == "rev-1"
    supabase_admin.rpc.assert_called_once_with(
        "reservar_revision_seguimiento",
        {
            "p_seguimiento_id": "seg-1",
            "p_asociacion_id": "aso-1",
            "p_usuario_id": "user-aso",
        },
    )


def test_revision_regional_informa_conflicto_controlado(make_query):
    tablas = {
        "seguimientos_resguardo": make_query(data=[{"id": "seg-1", "custodia_id": "cust-1"}]),
        "custodias_temporales": make_query(
            data=[{"asociacion_coordinadora_id": "aso-1", "voluntario_id": "vol-1"}]
        ),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.side_effect = Exception("revision_reservada")
    usuario = {"id": "user-aso", "rol": "asociacion", "asociacion_id": "aso-1"}

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "supabase_admin", supabase_admin),
        patch.object(custody, "_usuario", return_value=usuario),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-1"}),
    ):
        response = client.post(
            "/custody/followups/seg-1/review/reserve",
            headers=AUTH,
        )

    assert response.status_code == 409
    assert "30 minutos" in response.json()["detail"]


def test_asociacion_regional_envia_duda_a_coordinadora(make_query):
    tablas = {
        "seguimientos_resguardo": make_query(data=[{"id": "seg-1", "custodia_id": "cust-1"}]),
        "custodias_temporales": make_query(data=[{
            "reporte_id": "rep-1", "asociacion_coordinadora_id": "aso-1", "voluntario_id": "vol-1"
        }]),
        "aclaraciones_seguimiento": make_query(data=[{"id": "acl-1"}]),
        "revisiones_seguimiento": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    usuario = {"id": "user-aso-2", "rol": "asociacion", "asociacion_id": "aso-2"}

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "_usuario", return_value=usuario),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-2"}),
        patch.object(custody, "_en_radio_regional", return_value=True),
        patch.object(custody, "registrar_historial") as historial,
    ):
        response = client.post(
            "/custody/followups/seg-1/questions",
            headers=AUTH,
            json={"pregunta": "La herida parece distinta, ¿pueden solicitar otra fotografía?"},
        )

    assert response.status_code == 201
    payload = tablas["aclaraciones_seguimiento"].insert.call_args.args[0]
    assert payload["estado"] == "pendiente_coordinadora"
    assert payload["asociacion_origen_id"] == "aso-2"
    assert historial.call_args.kwargs["tipo_evento"] == "duda_regional_formulada"


def test_solo_coordinadora_puede_solicitar_aclaracion_directa(make_query):
    tablas = {
        "seguimientos_resguardo": make_query(data=[{"id": "seg-1", "custodia_id": "cust-1"}]),
        "custodias_temporales": make_query(data=[{
            "reporte_id": "rep-1", "asociacion_coordinadora_id": "aso-1", "voluntario_id": "vol-1"
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    usuario = {"id": "user-aso-2", "rol": "asociacion", "asociacion_id": "aso-2"}

    with (
        patch.object(custody, "supabase", supabase),
        patch.object(custody, "_usuario", return_value=usuario),
        patch.object(custody, "_asociacion_verificada", return_value={"id": "aso-2"}),
        patch.object(custody, "_en_radio_regional", return_value=True),
    ):
        response = client.post(
            "/custody/followups/seg-1/validation",
            headers=AUTH,
            json={"decision": "aclaracion_solicitada", "comentario": "Envía otra foto"},
        )

    assert response.status_code == 403
    assert "coordinadora" in response.json()["detail"]


def test_coordinadora_resuelve_busqueda_no_localizado_con_rpc():
    supabase_admin = MagicMock()
    supabase_admin.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"busqueda_id": "bus-1", "decision": "repetir_busqueda"}
    )
    usuario = {
        "id": "user-aso",
        "rol": "asociacion",
        "asociacion_id": "aso-1",
    }

    with (
        patch.object(reports, "supabase_admin", supabase_admin),
        patch.object(reports, "_obtener_usuario_autenticado", return_value=usuario),
    ):
        response = client.post(
            "/reports/rep-1/busqueda-no-localizado/resolver",
            headers=AUTH,
            json={"decision": "repetir_busqueda"},
        )

    assert response.status_code == 200
    assert response.json()["decision"] == "repetir_busqueda"
    supabase_admin.rpc.assert_called_once_with(
        "resolver_busqueda_no_localizado",
        {
            "p_reporte_id": "rep-1",
            "p_asociacion_id": "aso-1",
            "p_usuario_id": "user-aso",
            "p_decision": "repetir_busqueda",
            "p_instrucciones": None,
            "p_programada_at": None,
        },
    )


def test_ampliar_busqueda_exige_instrucciones():
    usuario = {
        "id": "user-aso",
        "rol": "asociacion",
        "asociacion_id": "aso-1",
    }
    with patch.object(
        reports, "_obtener_usuario_autenticado", return_value=usuario
    ):
        response = client.post(
            "/reports/rep-1/busqueda-no-localizado/resolver",
            headers=AUTH,
            json={"decision": "ampliar_zona"},
        )

    assert response.status_code == 422
    assert "instrucciones" in response.json()["detail"]
