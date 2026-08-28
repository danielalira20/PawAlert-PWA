from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0070_similitud_visual_pgvector.sql"
).read_text(encoding="utf-8")


def test_migration_enables_vector_and_stores_512_dimensions():
    assert "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions" in MIGRACION
    assert "CREATE TABLE IF NOT EXISTS public.reporte_imagen_embeddings" in MIGRACION
    assert "embedding extensions.vector(512)" in MIGRACION
    assert "CHECK (dimensiones = 512)" in MIGRACION


def test_migration_keeps_one_result_per_photo_and_model():
    assert "UNIQUE (animal_foto_id, modelo)" in MIGRACION
    assert "estado IN ('complete', 'unavailable')" in MIGRACION
    assert "estado = 'complete' AND embedding IS NOT NULL AND error_codigo IS NULL" in MIGRACION
    assert "estado = 'unavailable' AND embedding IS NULL AND error_codigo IS NOT NULL" in MIGRACION


def test_migration_creates_cosine_search_with_same_model():
    assert "CREATE OR REPLACE FUNCTION public.buscar_similitud_visual" in MIGRACION
    assert "1 - (rie.embedding <=> p_embedding)" in MIGRACION
    assert "rie.modelo = p_modelo" in MIGRACION
    assert "rie.reporte_id IS DISTINCT FROM p_reporte_id" in MIGRACION
    assert "p_limite integer DEFAULT 5" in MIGRACION


def test_migration_adds_partial_hnsw_index():
    assert "USING hnsw (embedding extensions.vector_cosine_ops)" in MIGRACION
    assert "WHERE estado = 'complete'" in MIGRACION


def test_migration_validates_rpc_limits():
    assert "p_umbral < 0 OR p_umbral > 1" in MIGRACION
    assert "p_limite < 1 OR p_limite > 20" in MIGRACION


def test_embedding_table_and_rpc_are_backend_only():
    assert "ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
