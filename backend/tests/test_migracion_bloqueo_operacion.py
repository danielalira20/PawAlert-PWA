from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0061_bloquear_operacion_sin_validacion.sql"
).read_text(encoding="utf-8")


def test_migracion_exige_validacion_para_datos_operativos():
    assert "reportes_operacion_requiere_validacion_check" in MIGRACION
    assert "estado_validacion_reporte = 'aprobado'" in MIGRACION
    assert "estado_reporte::text = 'pendiente'" in MIGRACION
    assert "estado_cobertura IS NULL" in MIGRACION
    assert "asociacion_asignada_id IS NULL" in MIGRACION
    assert "staff_asignado_id IS NULL" in MIGRACION
