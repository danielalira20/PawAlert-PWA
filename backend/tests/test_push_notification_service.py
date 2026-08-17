from unittest.mock import patch, MagicMock

import pytest

from app.services import push_notification_service as push_service
from app.services.push_notification_service import queue_and_send_push

def test_queue_and_send_push_success():
    with patch("app.services.push_notification_service.supabase_admin.table") as mock_table:
        mock_execute = MagicMock()
        mock_execute.execute.return_value.data = [{"id": "uuid-123"}]
        mock_table.return_value.insert.return_value = mock_execute
        
        result = queue_and_send_push(
            usuario_id="user1",
            tipo_evento="test_event",
            idempotency_key="key1",
            payload={"route": "/home"}
        )
        assert result["status"] == "queued"
        assert result["id"] == "uuid-123"

def test_queue_and_send_push_unsafe_payload():
    with pytest.raises(ValueError, match="Payload contains unsafe key"):
        queue_and_send_push(
            usuario_id="user1",
            tipo_evento="test_event",
            idempotency_key="key2",
            payload={"latitud": 12.34}
        )

def test_queue_and_send_push_idempotency_conflict():
    with patch("app.services.push_notification_service.supabase_admin.table") as mock_table:
        mock_execute = MagicMock()
        # Simulate unique constraint violation
        mock_execute.execute.side_effect = Exception("duplicate key value violates unique constraint")
        mock_table.return_value.insert.return_value = mock_execute
        
        result = queue_and_send_push(
            usuario_id="user1",
            tipo_evento="test_event",
            idempotency_key="key3",
            payload={"route": "/home"}
        )
        assert result["status"] == "omitida"
        assert result["reason"] == "idempotency_key exists"


def test_queue_error_no_expone_detalle_de_base_de_datos():
    with patch(
        "app.services.push_notification_service.supabase_admin.table"
    ) as mock_table:
        mock_table.return_value.insert.return_value.execute.side_effect = Exception(
            "password=secreto"
        )
        result = queue_and_send_push(
            usuario_id="user1",
            tipo_evento="test_event",
            idempotency_key="key4",
            payload={"route": "/home"},
        )

    assert result == {
        "status": "error_queueing",
        "reason": "outbox_no_disponible",
    }
    assert "secreto" not in str(result)


def test_firebase_acepta_service_account_desde_entorno(monkeypatch):
    firebase = MagicMock()
    firebase._apps = {}
    certificado = object()
    monkeypatch.setattr(push_service, "firebase_admin", firebase)
    monkeypatch.setattr(push_service, "credentials", MagicMock(), raising=False)
    push_service.credentials.Certificate.return_value = certificado
    monkeypatch.setattr(
        push_service.settings,
        "firebase_service_account_json",
        '{"project_id":"pawalert"}',
    )

    assert push_service._init_firebase() is True
    push_service.credentials.Certificate.assert_called_once_with(
        {"project_id": "pawalert"}
    )
    firebase.initialize_app.assert_called_once_with(certificado)


def test_estado_enviado_usa_timestamp_real(monkeypatch, make_query):
    outbox = make_query(data=[{"id": "push-1"}])
    db = MagicMock()
    db.table.return_value = outbox
    monkeypatch.setattr(push_service, "supabase_admin", db)

    push_service._update_push_status("push-1", "enviada", 1)

    cambio = outbox.update.call_args.args[0]
    assert cambio["enviada_at"] != "now()"
    assert "+00:00" in cambio["enviada_at"]
