import pytest
from unittest.mock import patch, MagicMock
from app.services.push_notification_service import queue_and_send_push, dispatch_pending_pushes, _assert_safe_payload

def test_queue_and_send_push_success():
    with patch("app.services.push_notification_service.supabase.table") as mock_table:
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
    with patch("app.services.push_notification_service.supabase.table") as mock_table:
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
