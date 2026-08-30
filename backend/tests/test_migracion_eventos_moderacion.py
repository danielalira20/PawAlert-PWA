from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "0102_eventos_moderacion.sql"
).read_text(encoding="utf-8")


def _function_block(name: str, next_name: str | None = None) -> str:
    start = MIGRATION.index(f"CREATE OR REPLACE FUNCTION public.{name}")
    if next_name is None:
        return MIGRATION[start:]
    end = MIGRATION.index(
        f"CREATE OR REPLACE FUNCTION public.{next_name}", start + 1
    )
    return MIGRATION[start:end]


def test_rpc_moderacion_son_definer_restringidas_al_service_role():
    assert MIGRATION.count("SECURITY DEFINER") == 3
    assert MIGRATION.count("SET search_path = public, pg_temp") == 3
    assert "FROM PUBLIC, anon, authenticated" in MIGRATION
    assert "TO service_role" in MIGRATION


def test_reporte_no_revela_actor_en_historial():
    block = _function_block(
        "reportar_evento_asociacion",
        "suspender_evento_asociacion_admin",
    )
    assert "actor_usuario_id" in block
    assert "NULL,\n    'evento_reportado'" in block
    assert "jsonb_build_object('motivo', v_reporte.motivo)" in block
    assert "p_descripcion" not in block[block.index("INSERT INTO public.historial_evento") :]


def test_suspension_exige_admin_oculta_evento_y_no_notifica_motivo_privado():
    block = _function_block(
        "suspender_evento_asociacion_admin",
        "restaurar_evento_asociacion_admin",
    )
    assert "validar_actor_administrador" in block
    assert "v_evento.estado NOT IN ('publicado', 'pausado')" in block
    assert "SET estado = 'suspendido_admin'" in block
    payload = block[block.index("jsonb_build_object(\n      'evento_id'") :]
    assert "p_motivo" not in payload
    assert "motivo_suspension" not in payload


def test_restauracion_resuelve_reportes_y_exige_republicacion():
    block = _function_block("restaurar_evento_asociacion_admin")
    assert "validar_actor_administrador" in block
    assert "v_evento.estado <> 'suspendido_admin'" in block
    assert "SET estado = 'pausado'" in block
    assert "SET estado = 'resuelto'" in block
    assert "'requiere_republicacion', true" in block
