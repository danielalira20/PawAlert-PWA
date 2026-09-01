from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0093_adopciones_plantillas_requisitos_operaciones.sql"
).read_text(encoding="utf-8")


def test_historial_admite_plantillas_sin_relacion_ficticia():
    assert "ADD COLUMN IF NOT EXISTS plantilla_requisitos_id uuid" in MIGRACION
    assert "OR plantilla_requisitos_id IS NOT NULL" in MIGRACION
    assert "historial_adopcion_plantilla_fecha_idx" in MIGRACION


def test_preguntas_tienen_contrato_cerrado_y_limites():
    assert "preguntas_plantilla_adopcion_validas" in MIGRACION
    assert "jsonb_array_length(p_preguntas) <= 25" in MIGRACION
    assert "FROM jsonb_object_keys(CASE" in MIGRACION
    assert "'^[a-z0-9_]{1,80}$'" in MIGRACION
    assert "NOT BETWEEN 1 AND 20" in MIGRACION
    assert "tipo_respuesta' = 'documento'" in MIGRACION
    assert "<> 'true'::jsonb" in MIGRACION
    assert "GROUP BY pregunta->>'clave'" in MIGRACION


def test_creacion_asigna_version_con_bloqueo_y_es_idempotente():
    block = MIGRACION.split(
        "CREATE OR REPLACE FUNCTION public.crear_plantilla_requisitos_adopcion",
        1,
    )[1].split("CREATE OR REPLACE FUNCTION", 1)[0]
    assert "PERFORM public.validar_actor_asociacion_operativa" in block
    assert "pg_advisory_xact_lock" in block
    assert "COALESCE(max(version), 0) + 1" in block
    assert "'plantilla:crear:'" in block
    assert "payload_hash" in block
    assert "plantilla_requisitos_adopcion_creada" in block


def test_actualizacion_reemplaza_preguntas_solo_en_borrador():
    block = MIGRACION.split(
        "CREATE OR REPLACE FUNCTION public.actualizar_plantilla_requisitos_adopcion",
        1,
    )[1].split("CREATE OR REPLACE FUNCTION", 1)[0]
    assert "v_plantilla.estado <> 'borrador'" in block
    assert "DELETE FROM public.preguntas_requisito_adopcion" in block
    assert "insertar_preguntas_plantilla_adopcion" in block
    assert "'plantilla:actualizar:'" in block
    assert "idempotency_key_plantilla_actualizacion_en_conflicto" in block


def test_activar_retira_anterior_y_activa_nueva_atomicamente():
    block = MIGRACION.split(
        "CREATE OR REPLACE FUNCTION public.activar_plantilla_requisitos_adopcion",
        1,
    )[1].split("CREATE OR REPLACE FUNCTION", 1)[0]
    assert "pg_advisory_xact_lock" in block
    assert "SET estado = 'retirada'" in block
    assert "AND estado = 'activa'" in block
    assert "SET estado = 'activa'" in block
    assert "v_plantilla.estado <> 'borrador'" in block
    assert "plantilla_requisitos_adopcion_activada" in block


def test_retiro_no_elimina_requisitos_base_ni_versiones_previas():
    block = MIGRACION.split(
        "CREATE OR REPLACE FUNCTION public.retirar_plantilla_requisitos_adopcion",
        1,
    )[1].split("REVOKE ALL ON FUNCTION", 1)[0]
    assert "v_plantilla.estado <> 'activa'" in block
    assert "SET estado = 'retirada'" in block
    assert "DELETE FROM public.plantillas_requisitos_adopcion" not in block
    assert "DELETE FROM public.requisitos_base_adopcion" not in MIGRACION
    assert "'plantilla:retirar:'" in block


def test_operaciones_solo_pueden_ejecutarse_con_service_role():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    for function_name in (
        "crear_plantilla_requisitos_adopcion",
        "actualizar_plantilla_requisitos_adopcion",
        "activar_plantilla_requisitos_adopcion",
        "retirar_plantilla_requisitos_adopcion",
    ):
        assert function_name in MIGRACION


def test_plantillas_no_alteran_rescate_perfiles_o_solicitudes():
    for forbidden_statement in (
        "UPDATE public.reportes",
        "UPDATE public.custodias_temporales",
        "UPDATE public.perfiles_adopcion",
        "UPDATE public.solicitudes_adopcion",
    ):
        assert forbidden_statement not in MIGRACION
