from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0094_adopciones_claves_requisitos_reservadas.sql"
).read_text(encoding="utf-8")


def test_migracion_detecta_colisiones_existentes_sin_borrarlas():
    assert "plantillas_adopcion_con_claves_base_duplicadas" in MIGRACION
    assert "requisito.clave = pregunta.clave" in MIGRACION
    assert "DELETE FROM" not in MIGRACION


def test_trigger_reserva_claves_base_en_cualquier_escritura():
    assert "validar_clave_personalizada_adopcion" in MIGRACION
    assert "BEFORE INSERT OR UPDATE OF clave, plantilla_id" in MIGRACION
    assert "clave_requisito_adopcion_reservada" in MIGRACION
    assert "requisito.version = v_version_base" in MIGRACION


def test_trigger_es_backend_only():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
