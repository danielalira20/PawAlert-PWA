from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0062_capacidad_operativa_asociaciones.sql"
).read_text(encoding="utf-8")


def test_migracion_agrega_capacidad_y_disponibilidad_operativa():
    for columna in (
        "capacidad_reportes_simultaneos",
        "capacidad_reportes_criticos",
        "recepcion_reportes_activa",
        "recepcion_reportes_24h",
        "dias_recepcion",
        "hora_inicio_recepcion",
        "hora_fin_recepcion",
    ):
        assert f"ADD COLUMN IF NOT EXISTS {columna}" in MIGRACION


def test_defaults_conservan_recepcion_actual_sin_limitar_horario():
    assert "recepcion_reportes_activa boolean NOT NULL DEFAULT true" in MIGRACION
    assert "recepcion_reportes_24h boolean NOT NULL DEFAULT true" in MIGRACION
    assert "DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]" in MIGRACION


def test_capacidad_critica_no_puede_superar_capacidad_total():
    assert "capacidad_reportes_simultaneos BETWEEN 1 AND 100" in MIGRACION
    assert (
        "capacidad_reportes_criticos BETWEEN 0 AND capacidad_reportes_simultaneos"
        in MIGRACION
    )


def test_dias_de_recepcion_solo_admiten_semana_iso():
    assert "cardinality(dias_recepcion) BETWEEN 1 AND 7" in MIGRACION
    assert "dias_recepcion <@ ARRAY[1, 2, 3, 4, 5, 6, 7]" in MIGRACION
