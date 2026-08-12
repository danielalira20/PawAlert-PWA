from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0059_urgency_score.sql"
).read_text(encoding="utf-8")


def test_migracion_persiste_resultado_vigente_e_historial_explicable():
    for columna in (
        "urgency_score",
        "urgency_nivel",
        "urgency_calculado_at",
        "urgency_proximo_recalculo_at",
        "urgency_formula_version",
        "urgency_excluido",
        "urgency_razones_exclusion",
    ):
        assert columna in MIGRACION

    assert "CREATE TABLE IF NOT EXISTS public.reporte_urgency_evaluaciones" in MIGRACION
    assert "componentes_aplicados" in MIGRACION
    assert "formula_version" in MIGRACION


def test_migracion_fija_componentes_y_rangos_de_la_formula_v1():
    assert "condicion_ia_score" in MIGRACION
    assert "IN (20, 70, 100)" in MIGRACION
    assert "condicion_declarada_score" in MIGRACION
    assert "IN (20, 60, 100)" in MIGRACION
    assert "tiempo_score" in MIGRACION
    assert "clima_score" in MIGRACION
    assert "IN (0, 50, 100)" in MIGRACION
    assert "riesgo_vial_score" in MIGRACION
    assert "IN (0, 100)" in MIGRACION


def test_migracion_impide_nivel_incompatible_con_score():
    assert "score < 40 AND nivel = 'verde'" in MIGRACION
    assert "score >= 40 AND score < 70 AND nivel = 'amarillo'" in MIGRACION
    assert "score >= 70 AND nivel = 'rojo'" in MIGRACION
    assert "reportes_urgency_resultado_coherente_check" in MIGRACION
    assert "reporte_urgency_resultado_coherente_check" in MIGRACION


def test_migracion_distingue_senal_ausente_de_score_cero():
    assert "clima_score IS NULL OR clima_score IN (0, 50, 100)" in MIGRACION
    assert "riesgo_vial_score IS NULL OR riesgo_vial_score IN (0, 100)" in MIGRACION
    assert "'unavailable'" in MIGRACION
    assert "componentes_aplicados jsonb" in MIGRACION
    assert "reporte_urgency_clima_coherente_check" in MIGRACION
    assert "reporte_urgency_riesgo_vial_coherente_check" in MIGRACION


def test_migracion_exige_motivo_al_excluir_urgencia():
    assert "excluido" in MIGRACION
    assert "score IS NULL" in MIGRACION
    assert "jsonb_array_length(razones_exclusion) > 0" in MIGRACION
    assert "jsonb_typeof(urgency_razones_exclusion) = 'array'" in MIGRACION


def test_historial_de_urgencia_es_privado_para_clientes():
    assert "ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
