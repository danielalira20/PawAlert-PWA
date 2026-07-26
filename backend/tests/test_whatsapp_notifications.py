from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.config import settings
from app.services import whatsapp_notification_service as whatsapp


def test_normaliza_telefono_mexicano_para_whatsapp():
    assert (
        whatsapp.normalizar_telefono_whatsapp("241 115 8375")
        == "whatsapp:+522411158375"
    )
    assert (
        whatsapp.normalizar_telefono_whatsapp("+52 241 115 8375")
        == "whatsapp:+522411158375"
    )
    assert whatsapp.normalizar_telefono_whatsapp("123") is None


def test_envio_desactivado_conserva_aviso_pendiente(make_query):
    avisos = make_query(data=[{
        "id": "aviso-1",
        "estado": "pendiente",
        "intentos": 0,
    }])
    cliente = MagicMock()
    cliente.table.return_value = avisos

    with (
        patch.object(whatsapp, "supabase_admin", cliente),
        patch.object(settings, "whatsapp_notifications_enabled", False),
    ):
        resultado = whatsapp.procesar_notificacion("aviso-1")

    assert resultado == {
        "estado": "pendiente",
        "motivo": "whatsapp_no_configurado",
    }
    avisos.update.assert_not_called()


def test_encolado_es_idempotente_por_dedupe_key(make_query):
    avisos = make_query(execute_results=[
        [],
        [{
            "id": "aviso-1",
            "estado": "pendiente",
        }],
        [{
            "id": "aviso-1",
            "estado": "pendiente",
        }],
    ])
    cliente = MagicMock()
    cliente.table.return_value = avisos
    destinatario = {
        "tipo": "voluntario",
        "id": "vol-1",
        "telefono": "whatsapp:+522411158375",
        "mensaje": "Tienes una actualización.",
        "enlace": "https://pawalert.test/profile",
    }

    with patch.object(whatsapp, "supabase_admin", cliente):
        primero = whatsapp.encolar_notificacion(
            "propuesta_verificador",
            "evento:asig-1:vol-1",
            destinatario,
        )
        segundo = whatsapp.encolar_notificacion(
            "propuesta_verificador",
            "evento:asig-1:vol-1",
            destinatario,
        )

    assert primero["id"] == "aviso-1"
    assert segundo["id"] == "aviso-1"
    avisos.insert.assert_called_once()


def test_seguridad_genera_recordatorio_y_alerta_a_los_60_minutos():
    query = MagicMock()
    for metodo in ("select", "eq", "is_"):
        getattr(query, metodo).return_value = query
    query.not_.is_.return_value = query
    query.execute.return_value = SimpleNamespace(data=[{
        "id": "asig-1",
        "verificacion_hogar_id": "ver-1",
        "check_in_at": (
            datetime.now(timezone.utc) - timedelta(minutes=61)
        ).isoformat(),
    }])
    cliente = MagicMock()
    cliente.table.return_value = query

    with (
        patch.object(whatsapp, "supabase_admin", cliente),
        patch.object(
            whatsapp,
            "notificar_evento_verificacion",
            return_value={"encoladas": 1},
        ) as notificar,
    ):
        resultado = whatsapp.evaluar_recordatorios_seguridad()

    assert resultado["visitas_revisadas"] == 1
    assert resultado["avisos_generados"] == 2
    assert [llamada.args[0] for llamada in notificar.call_args_list] == [
        "recordatorio_seguridad_50",
        "alerta_seguridad_60",
    ]
