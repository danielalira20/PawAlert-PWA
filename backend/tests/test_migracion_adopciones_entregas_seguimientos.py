from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0088_adopciones_entregas_seguimientos.sql"
).read_text(encoding="utf-8")


def test_crea_entregas_confirmaciones_seguimientos_y_alertas():
    for tabla in (
        "entregas_adopcion",
        "confirmaciones_entrega_adopcion",
        "seguimientos_adopcion",
        "evidencias_seguimiento_adopcion",
        "alertas_bienestar_adopcion",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabla}" in MIGRACION


def test_entrega_pertenece_a_la_misma_solicitud_perfil_y_asociacion():
    assert "solicitud_adopcion_contexto_entrega_unico" in MIGRACION
    assert "entregas_adopcion_solicitud_contexto_fkey" in MIGRACION
    assert (
        "id, perfil_adopcion_id, asociacion_id, solicitante_usuario_id"
        in MIGRACION
    )
    assert "adoptante_usuario_id" in MIGRACION
    assert "seguimientos_adopcion_contexto_entrega_fkey" in MIGRACION
    assert "alertas_bienestar_adopcion_contexto_entrega_fkey" in MIGRACION


def test_impide_dos_entregas_activas_para_el_mismo_perfil_o_solicitud():
    assert "entrega_adopcion_activa_por_perfil" in MIGRACION
    assert "entrega_adopcion_activa_por_solicitud" in MIGRACION
    assert "'por_programar', 'programada', 'confirmacion_parcial'" in MIGRACION


def test_programacion_exige_ventana_lugar_y_responsables():
    assert "entregas_adopcion_programacion_consistente" in MIGRACION
    assert "programada_fin_at > programada_inicio_at" in MIGRACION
    assert "NULLIF(trim(lugar_privado), '') IS NOT NULL" in MIGRACION
    assert "responsable_entrega_usuario_id IS NOT NULL" in MIGRACION
    assert "representante_asociacion_usuario_id IS NOT NULL" in MIGRACION


def test_confirmaciones_son_independientes_unicas_e_inmutables():
    for tipo in (
        "recepcion_adoptante",
        "entrega_responsable",
        "validacion_asociacion",
    ):
        assert f"'{tipo}'" in MIGRACION
    assert "confirmaciones_entrega_adopcion_tipo_unico" in MIGRACION
    assert "bloquear_mutacion_confirmacion_entrega_adopcion" in MIGRACION
    assert "BEFORE UPDATE OR DELETE" in MIGRACION


def test_documentos_y_evidencias_se_guardan_en_rutas_privadas():
    assert "acuerdo_storage_path LIKE 'adopciones/entregas/%'" in MIGRACION
    assert "evidencia_storage_path LIKE 'adopciones/entregas/%'" in MIGRACION
    assert "storage_path LIKE 'adopciones/seguimientos/%'" in MIGRACION
    assert "acuerdo_mime_type IS NOT NULL" in MIGRACION
    assert "acuerdo_size_bytes IS NOT NULL" in MIGRACION
    assert "evidencia_mime_type IS NOT NULL" in MIGRACION
    assert "evidencia_size_bytes IS NOT NULL" in MIGRACION
    assert MIGRACION.count("10485760") >= 3


def test_seguimientos_solo_se_programan_a_7_30_y_90_dias():
    assert "dia_objetivo IN (7, 30, 90)" in MIGRACION
    assert "UNIQUE (entrega_adopcion_id, dia_objetivo)" in MIGRACION
    assert "recordatorio_at = objetivo_at + interval '48 hours'" in MIGRACION
    assert "vencimiento_at = objetivo_at + interval '7 days'" in MIGRACION


def test_estados_de_seguimiento_exigen_evidencia_temporal_minima():
    assert "seguimientos_adopcion_respuesta_consistente" in MIGRACION
    assert "seguimientos_adopcion_validacion_consistente" in MIGRACION
    assert "seguimientos_adopcion_contacto_consistente" in MIGRACION
    assert "seguimientos_adopcion_vencimiento_consistente" in MIGRACION
    assert "seguimientos_adopcion_cierre_consistente" in MIGRACION


def test_alerta_explicita_tiene_limite_de_atencion_y_escalamiento():
    assert "atender_antes_de timestamptz NOT NULL DEFAULT" in MIGRACION
    assert "now() + interval '48 hours'" in MIGRACION
    assert "'abierta', 'en_atencion', 'escalada_admin', 'resuelta'" in MIGRACION
    assert "alertas_bienestar_adopcion_escalamiento_consistente" in MIGRACION


def test_historial_incorpora_entregas_seguimientos_y_alertas():
    assert "ADD COLUMN IF NOT EXISTS entrega_adopcion_id uuid" in MIGRACION
    assert "ADD COLUMN IF NOT EXISTS seguimiento_adopcion_id uuid" in MIGRACION
    assert "ADD COLUMN IF NOT EXISTS alerta_bienestar_adopcion_id uuid" in MIGRACION
    assert "historial_adopcion_entidad_requerida" in MIGRACION


def test_tablas_nuevas_son_backend_only():
    for tabla in (
        "entregas_adopcion",
        "confirmaciones_entrega_adopcion",
        "seguimientos_adopcion",
        "evidencias_seguimiento_adopcion",
        "alertas_bienestar_adopcion",
    ):
        assert f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION


def test_corrige_trigger_de_timestamp_del_perfil_existente():
    assert "actualizar_timestamp_perfil_adopcion" in MIGRACION
    assert "NEW.actualizado_at := now()" in MIGRACION
    assert "DROP TRIGGER IF EXISTS perfiles_adopcion_actualizado_at" in MIGRACION


def test_migracion_no_completa_adopcion_ni_cierra_custodia():
    assert "UPDATE public.perfiles_adopcion" not in MIGRACION
    assert "UPDATE public.solicitudes_adopcion" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "UPDATE public.reportes" not in MIGRACION
