from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0068_ciclo_vida_urgency.sql"
).read_text(encoding="utf-8")


def test_estados_terminales_limpian_y_excluyen_urgency():
    assert "reportes_excluir_urgency_terminal_trigger" in MIGRACION
    assert "urgency_score := NULL" in MIGRACION
    assert "urgency_proximo_recalculo_at := NULL" in MIGRACION
    assert "urgency_excluido := true" in MIGRACION
    assert "'estado_terminal'" in MIGRACION

    for estado in (
        "rescatado",
        "cerrado",
        "cancelado_por_reportante",
        "duplicado",
        "duplicado_vinculable",
        "duplicado_informativo",
        "muerto",
    ):
        assert f"'{estado}'" in MIGRACION


def test_scheduler_solo_reclama_estados_operativos():
    assert "CREATE OR REPLACE FUNCTION public.claim_due_urgency_reports" in MIGRACION
    assert "estado_reporte::text IN" in MIGRACION
    for estado in (
        "pendiente",
        "asignado",
        "en_camino",
        "en_atencion",
        "sin_cobertura",
    ):
        assert f"'{estado}'" in MIGRACION
