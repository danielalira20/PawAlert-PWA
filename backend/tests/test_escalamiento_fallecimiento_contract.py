from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0083_escalar_seguimientos_fallecimiento.sql"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_escalamiento_tiene_plazos_estados_y_bloqueo_concurrente() -> None:
    sql = _sql()

    assert "asociacion_deadline_at <= now()" in sql
    assert "administracion_deadline_at <= now()" in sql
    assert "'pendiente_asociacion'" in sql
    assert "'escalado_administracion'" in sql
    assert "FOR UPDATE OF seguimiento SKIP LOCKED" in sql


def test_escalamiento_registra_historial_y_outbox_idempotente() -> None:
    sql = _sql()

    assert "'seguimiento_fallecimiento_escalado'" in sql
    assert "INSERT INTO public.notificaciones_push" in sql
    assert "ON CONFLICT (usuario_id, idempotency_key) DO NOTHING" in sql
    assert "seguimiento_fallecimiento:24h:" in sql
    assert "seguimiento_fallecimiento:48h:" in sql


def test_escalamiento_no_cierra_ni_expone_evidencia_sensible() -> None:
    sql = _sql().lower()

    assert "estado = 'cerrado'" not in sql
    assert "estado_reporte = 'muerto'" not in sql
    assert "foto_url" not in sql
    assert "latitud" not in sql
    assert "longitud" not in sql


def test_escalamiento_sin_coordinadora_pasa_a_administracion() -> None:
    sql = _sql()

    assert "v_seguimiento.asociacion_coordinadora_id IS NULL" in sql
    assert "rol.nombre = 'admin'" in sql
    assert "rol.nombre IN ('asociacion', 'staff')" in sql


def test_funcion_solo_es_ejecutable_por_service_role() -> None:
    sql = _sql()

    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "TO service_role" in sql
