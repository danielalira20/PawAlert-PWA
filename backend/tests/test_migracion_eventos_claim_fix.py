from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "0101_eventos_claim_ambiguity_fix.sql"
).read_text(encoding="utf-8")


def test_fix_reemplaza_funcion_sin_cambiar_su_contrato():
    assert "CREATE OR REPLACE FUNCTION public.claim_due_eventos_asociacion" in MIGRATION
    assert "RETURNS TABLE(evento_id uuid)" in MIGRATION
    assert "FOR UPDATE OF evento SKIP LOCKED" in MIGRATION


def test_fix_resuelve_on_conflict_por_constraint_sin_referencia_ambigua():
    assert (
        "ON CONFLICT ON CONSTRAINT eventos_asociacion_claims_pkey DO NOTHING"
        in MIGRATION
    )
    assert "ON CONFLICT (evento_id)" not in MIGRATION
