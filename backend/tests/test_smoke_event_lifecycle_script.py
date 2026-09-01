from pathlib import Path


SCRIPT = (
    Path(__file__).parents[1] / "scripts" / "smoke_event_lifecycle.sql"
).read_text(encoding="utf-8")


def test_smoke_es_transaccional_y_revierte_fixtures():
    assert SCRIPT.lstrip().startswith("-- Smoke test transaccional")
    assert "BEGIN;" in SCRIPT
    assert "\nROLLBACK;\n\nSELECT jsonb_build_object(" in SCRIPT
    assert SCRIPT.rstrip().endswith(") AS smoke_result;")
    assert "DELETE FROM public.eventos_asociacion" not in SCRIPT


def test_smoke_cubre_claims_y_tres_acciones_de_negocio():
    assert "claim_due_eventos_asociacion" in SCRIPT
    assert "'recordatorio_24h'" in SCRIPT
    assert "'finalizado'" in SCRIPT
    assert "'archivado'" in SCRIPT


def test_smoke_valida_idempotencia_y_archivo_silencioso():
    assert "smoke_recordatorio_no_idempotente" in SCRIPT
    assert "smoke_finalizacion_no_idempotente" in SCRIPT
    assert "smoke_archivo_genero_notificacion" in SCRIPT
    assert "payload @> '{\"reserva_cupo\": false}'::jsonb" in SCRIPT
