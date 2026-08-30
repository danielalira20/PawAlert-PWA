from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "0100_eventos_ciclo_vida_recordatorios.sql"
).read_text(encoding="utf-8")


def test_migracion_reutiliza_runs_y_claims_con_concurrencia_segura():
    assert "operaciones_modulo_runs" in MIGRATION
    assert "eventos_asociacion_claims" in MIGRATION
    assert "FOR UPDATE OF evento SKIP LOCKED" in MIGRATION
    assert "interval '10 minutes'" in MIGRATION


def test_migracion_finaliza_y_archiva_segun_contrato():
    assert "SET estado = 'finalizado'" in MIGRATION
    assert "SET estado = 'archivado'" in MIGRATION
    assert "interval '30 days'" in MIGRATION
    assert "'evento_finalizado'" in MIGRATION
    assert "'evento_archivado'" in MIGRATION


def test_recordatorio_es_de_24h_idempotente_y_no_reserva_cupo():
    assert "interval '24 hours'" in MIGRATION
    assert "'evento_recordatorio_24h'" in MIGRATION
    assert "'evento:recordatorio:24h:'" in MIGRATION
    assert "ON CONFLICT (usuario_id, idempotency_key) DO NOTHING" in MIGRATION
    assert "'reserva_cupo', false" in MIGRATION


def test_archivado_no_encola_notificacion():
    archive_block = MIGRATION.split(
        "ELSIF v_evento.estado = 'finalizado'", 1
    )[1].split("ELSIF v_evento.estado = 'publicado'", 1)[0]
    assert "INSERT INTO public.notificaciones_push" not in archive_block
