from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0076_compuerta_urgency_inicial.sql"
).read_text()


def test_migracion_agrega_estado_intermedio_no_operativo():
    assert "'urgency_pendiente'" in MIGRACION
    assert "estado_validacion_reporte = 'urgency_pendiente'" in MIGRACION
    assert "claim_due_urgency_reports" in MIGRACION


def test_cron_prioriza_urgency_inicial_pendiente():
    assert (
        "CASE WHEN estado_validacion_reporte = 'urgency_pendiente' THEN 0 ELSE 1 END"
        in MIGRACION
    )


def test_rpc_privilegiada_solo_es_ejecutable_por_service_role():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
