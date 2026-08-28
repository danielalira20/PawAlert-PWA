from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0084_notificar_resultados_fallecimiento.sql"
).read_text(encoding="utf-8").lower()


def test_trigger_only_observes_sensitive_result_events():
    assert "after insert on public.historial_reporte" in MIGRATION
    assert "reporte_pendiente_seguimiento_fallecimiento" in MIGRATION
    assert "reporte_cerrado_fallecimiento" in MIGRATION


def test_authenticated_reporter_uses_idempotent_push_outbox():
    assert "insert into public.notificaciones_push" in MIGRATION
    assert "resultado_rescate:revision:" in MIGRATION
    assert "resultado_rescate:conclusion:" in MIGRATION
    assert "on conflict (usuario_id, idempotency_key) do nothing" in MIGRATION


def test_guest_reporter_uses_existing_whatsapp_outbox():
    assert "insert into public.notificaciones_whatsapp" in MIGRATION
    assert "'reportante_invitado'" in MIGRATION
    assert "on conflict (dedupe_key) do nothing" in MIGRATION


def test_notification_payload_excludes_sensitive_evidence():
    payload_start = MIGRATION.index("jsonb_build_object(")
    payload_end = MIGRATION.index("),", payload_start)
    payload = MIGRATION[payload_start:payload_end]

    assert "mensaje" in payload
    assert "destino" in payload
    assert "foto" not in payload
    assert "evidencia" not in payload
    assert "latitud" not in payload
    assert "longitud" not in payload
