from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0060_duplicados_geograficos.sql"
).read_text(encoding="utf-8")


def test_migracion_define_la_funcion_de_busqueda_geoespacial():
    assert "CREATE OR REPLACE FUNCTION public.buscar_duplicados_geograficos" in MIGRACION
    assert "p_latitud numeric" in MIGRACION
    assert "p_longitud numeric" in MIGRACION
    assert "p_created_at timestamp with time zone" in MIGRACION
    assert "p_tipo_animal_ids uuid[]" in MIGRACION
    assert "p_reporte_id uuid DEFAULT NULL" in MIGRACION


def test_migracion_devuelve_las_columnas_del_contrato_pydantic():
    for columna in (
        "existing_report_id uuid",
        "distance_m numeric",
        "time_difference_minutes numeric",
        "shared_species text[]",
    ):
        assert columna in MIGRACION


def test_migracion_fija_radio_de_150_metros():
    assert "ST_DistanceSphere" in MIGRACION
    assert "<= 150" in MIGRACION


def test_migracion_fija_ventana_de_120_minutos():
    assert "INTERVAL '120 minutes'" in MIGRACION


def test_migracion_excluye_los_estados_confirmados_tras_el_bug_22p02():
    # Mismos 7 valores documentados en reputacion_service.py como
    # confirmados contra la base real tras el incidente 22P02 -- ninguno
    # inventado, todos parte del enum real de estado_reporte.
    for estado in (
        "cerrado", "cancelado_por_reportante", "duplicado",
        "duplicado_vinculable", "duplicado_informativo",
        "rescatado", "muerto",
    ):
        assert f"'{estado}'" in MIGRACION


def test_migracion_filtra_moderacion_por_columna_separada_no_por_el_enum():
    # 'rechazado' nunca existio en el enum real de estado_reporte -- vive
    # en estado_moderacion (columna de texto aparte). Debe filtrarse con
    # su propia condicion, nunca mezclado en el NOT IN de estado_reporte.
    assert "estado_moderacion != 'rechazado'" in MIGRACION

    bloque_not_in = MIGRACION.split("estado_reporte NOT IN (")[1].split(")")[0]
    assert "rechazado" not in bloque_not_in
