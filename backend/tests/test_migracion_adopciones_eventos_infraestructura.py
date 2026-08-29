from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0090_adopciones_eventos_infraestructura_operativa.sql"
).read_text(encoding="utf-8")


def test_outbox_se_amplia_sin_reemplazar_referencias_existentes():
    assert "ADD COLUMN IF NOT EXISTS perfil_adopcion_id uuid" in MIGRACION
    assert "ADD COLUMN IF NOT EXISTS evento_id uuid" in MIGRACION
    assert "ALTER TABLE public.notificaciones_push" in MIGRACION
    assert "DROP TABLE" not in MIGRACION
    assert "notificaciones_push_payload_objeto" in MIGRACION
    assert ") NOT VALID;" in MIGRACION


def test_crea_runs_y_claims_separados_por_recurso():
    for tabla in (
        "operaciones_modulo_runs",
        "seguimientos_adopcion_claims",
        "alertas_bienestar_adopcion_claims",
        "eventos_asociacion_claims",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabla}" in MIGRACION
    assert "expires_at > claimed_at" in MIGRACION
    assert "ciclo_vida_eventos" in MIGRACION


def test_run_exige_cierre_y_contadores_consistentes():
    assert "operaciones_modulo_runs_cierre_consistente" in MIGRACION
    assert "estado IN ('en_progreso', 'completado', 'error')" in MIGRACION
    assert "finalizado_at IS NOT NULL" in MIGRACION
    assert "duracion_ms IS NOT NULL" in MIGRACION
    for contador in (
        "examinados",
        "actualizados",
        "notificaciones_encoladas",
        "fallidos",
        "omitidos",
    ):
        assert f"{contador} integer NOT NULL DEFAULT 0" in MIGRACION


def test_actor_asociacion_valida_rol_pertenencia_y_estado():
    assert "validar_actor_asociacion_operativa" in MIGRACION
    assert "v_rol NOT IN ('asociacion', 'staff')" in MIGRACION
    assert "v_rol IS NULL" in MIGRACION
    assert "v_asociacion_usuario_id IS DISTINCT FROM p_asociacion_id" in MIGRACION
    assert "COALESCE(verificado, false), COALESCE(activo, false)" in MIGRACION
    assert "asociacion_no_operativa" in MIGRACION
    assert "ERRCODE = '42501'" in MIGRACION


def test_actor_admin_se_valida_en_base_y_no_por_frontend():
    assert "validar_actor_administrador" in MIGRACION
    assert "rol.nombre = 'admin'" in MIGRACION
    assert "actor_no_es_administrador" in MIGRACION


def test_outbox_de_modulos_es_idempotente_y_de_una_sola_entidad():
    assert "encolar_notificacion_modulo" in MIGRACION
    assert "ON CONFLICT (usuario_id, idempotency_key) DO NOTHING" in MIGRACION
    assert "p_perfil_adopcion_id IS NOT NULL" in MIGRACION
    assert "p_evento_id IS NOT NULL" in MIGRACION
    assert "<> 1" in MIGRACION
    assert "'insertada', v_insertada" in MIGRACION
    assert "notificacion_idempotency_key_en_conflicto" in MIGRACION
    assert "v_existente_payload IS DISTINCT FROM p_payload" in MIGRACION


def test_outbox_rechaza_localizadores_y_notas_privadas():
    for campo in (
        "documento_storage_path",
        "evidencia_storage_path",
        "acuerdo_storage_path",
        "lugar_privado",
        "instrucciones_privadas",
        "motivo_rechazo_interno",
    ):
        assert f"'{campo}'" in MIGRACION
    assert "payload_notificacion_contiene_datos_privados" in MIGRACION


def test_claims_nacen_backend_only():
    for tabla in (
        "operaciones_modulo_runs",
        "seguimientos_adopcion_claims",
        "alertas_bienestar_adopcion_claims",
        "eventos_asociacion_claims",
    ):
        assert f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION


def test_funciones_solo_son_ejecutables_por_service_role():
    assert "REVOKE ALL ON FUNCTION" in MIGRACION
    assert "GRANT EXECUTE ON FUNCTION" in MIGRACION
    assert "validar_actor_asociacion_operativa(uuid, uuid)" in MIGRACION
    assert "validar_actor_administrador(uuid)" in MIGRACION


def test_infraestructura_no_cambia_estados_de_dominio():
    for tabla in (
        "perfiles_adopcion",
        "solicitudes_adopcion",
        "entregas_adopcion",
        "seguimientos_adopcion",
        "alertas_bienestar_adopcion",
        "eventos_asociacion",
        "custodias_temporales",
        "reportes",
    ):
        assert f"UPDATE public.{tabla}" not in MIGRACION
