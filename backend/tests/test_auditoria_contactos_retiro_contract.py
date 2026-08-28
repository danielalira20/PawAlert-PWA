from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0085_auditar_contactos_retiro.sql"
).read_text(encoding="utf-8").lower()


def test_audit_is_unique_per_report_and_actor():
    assert "historial_contactos_retiro_actor_unico_idx" in MIGRATION
    assert "reporte_id, usuario_id, tipo_evento" in MIGRATION
    assert "on conflict (reporte_id, usuario_id, tipo_evento)" in MIGRATION


def test_audit_only_accepts_authorized_actor_types():
    assert "'voluntario', 'asociacion', 'administracion'" in MIGRATION
    assert "tipo_actor_contactos_invalido" in MIGRATION


def test_audit_requires_at_least_one_delivered_contact():
    assert "p_total_contactos < 1" in MIGRATION
    assert "'contactos_retiro_mostrados'" in MIGRATION


def test_audit_rpc_is_reserved_for_service_role():
    assert "from public, anon, authenticated" in MIGRATION
    assert "to service_role" in MIGRATION
