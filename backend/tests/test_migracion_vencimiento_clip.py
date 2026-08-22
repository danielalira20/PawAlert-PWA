from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0072_vencimiento_zona_gris_clip.sql"
).read_text()


def test_migracion_agrega_deadline_e_indice_de_revision_clip():
    assert "validacion_revision_expira_at timestamptz" in MIGRACION
    assert "reportes_revision_clip_vencida_idx" in MIGRACION
    assert "estado_validacion_reporte = 'revision_manual'" in MIGRACION


def test_claim_solo_toma_zona_gris_sin_otro_bloqueo():
    assert "CREATE OR REPLACE FUNCTION public.claim_due_clip_gray_reports" in MIGRACION
    assert "razon->>'codigo' = 'clip_zona_gris'" in MIGRACION
    assert "razon->>'resultado' = 'revision_temporal'" in MIGRACION
    assert "razon->>'codigo' <> 'clip_zona_gris'" in MIGRACION
    assert "<> 'sin_bloqueo'" in MIGRACION
    assert "FOR UPDATE SKIP LOCKED" in MIGRACION


def test_claims_clip_son_privados_y_liberables():
    assert "ALTER TABLE public.clip_gray_validation_claims ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "REVOKE ALL ON public.clip_gray_validation_claims FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "CREATE OR REPLACE FUNCTION public.release_clip_gray_claim" in MIGRACION
    assert "TO service_role" in MIGRACION
