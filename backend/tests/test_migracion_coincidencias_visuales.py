from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0071_coincidencias_visuales.sql"
).read_text(encoding="utf-8")


def test_coincidences_keep_both_reports_and_embeddings():
    assert "CREATE TABLE IF NOT EXISTS public.reporte_imagen_coincidencias" in MIGRACION
    for column in (
        "embedding_consulta_id",
        "reporte_id",
        "animal_foto_id",
        "embedding_coincidente_id",
        "reporte_coincidente_id",
        "animal_foto_coincidente_id",
    ):
        assert column in MIGRACION
    assert "UNIQUE (embedding_consulta_id, embedding_coincidente_id)" in MIGRACION


def test_coincidences_validate_score_level_and_distinct_reports():
    assert "CHECK (reporte_id <> reporte_coincidente_id)" in MIGRACION
    assert "CHECK (similitud BETWEEN 0 AND 1)" in MIGRACION
    assert "CHECK (nivel IN ('low', 'gray', 'high'))" in MIGRACION


def test_coincidences_are_private():
    assert "ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
