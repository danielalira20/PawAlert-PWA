from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0058_estado_validacion_reportes.sql"
).read_text(encoding="utf-8")


def test_migracion_define_estados_de_validacion_sin_ampliar_moderacion():
    for estado in ("procesando", "aprobado", "revision_manual", "rechazado"):
        assert f"'{estado}'" in MIGRACION

    assert "reportes_estado_validacion_reporte_check" in MIGRACION
    assert "DROP CONSTRAINT IF EXISTS reportes_estado_moderacion_check" not in MIGRACION
    assert "ADD CONSTRAINT reportes_estado_moderacion_check" not in MIGRACION


def test_migracion_preserva_reportes_historicos_y_es_reaplicable():
    assert "WHERE estado_validacion_reporte IS NULL" in MIGRACION
    assert "WHEN estado_moderacion = 'en_revision' THEN 'revision_manual'" in MIGRACION
    assert "WHEN estado_moderacion = 'rechazado' THEN 'rechazado'" in MIGRACION
    assert "ELSE 'aprobado'" in MIGRACION
    assert "ADD COLUMN IF NOT EXISTS" in MIGRACION
    assert "CREATE INDEX IF NOT EXISTS" in MIGRACION


def test_migracion_exige_razones_estructuradas_como_lista():
    assert "razones_validacion jsonb NOT NULL DEFAULT '[]'::jsonb" in MIGRACION
    assert "jsonb_typeof(razones_validacion) = 'array'" in MIGRACION
