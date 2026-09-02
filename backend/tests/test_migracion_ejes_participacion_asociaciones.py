from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0103_ejes_participacion_asociaciones.sql"
).read_text(encoding="utf-8")


def test_migracion_agrega_columnas_de_eje():
    for columna in ("participa_rescates", "participa_adopciones"):
        assert f"ADD COLUMN IF NOT EXISTS {columna} boolean NOT NULL DEFAULT true" in MIGRACION


def test_defaults_conservan_comportamiento_actual():
    # Ninguna asociación existente debe ver un cambio: ambos ejes nacen
    # activos, igual que el comportamiento antes de esta migración.
    assert "participa_rescates boolean NOT NULL DEFAULT true" in MIGRACION
    assert "participa_adopciones boolean NOT NULL DEFAULT true" in MIGRACION


def test_no_permite_los_dos_ejes_apagados():
    assert "asociaciones_al_menos_un_eje_check" in MIGRACION
    assert "CHECK (\n    participa_rescates OR participa_adopciones\n  )" in MIGRACION
