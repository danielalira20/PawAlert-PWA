from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0087_adopciones_solicitudes_requisitos.sql"
).read_text(encoding="utf-8")


def test_crea_requisitos_plantillas_solicitudes_y_respuestas():
    for tabla in (
        "requisitos_base_adopcion",
        "plantillas_requisitos_adopcion",
        "preguntas_requisito_adopcion",
        "solicitudes_adopcion",
        "respuestas_solicitud_adopcion",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabla}" in MIGRACION


def test_requisitos_base_pawalert_son_versionados_y_sembrados():
    assert "requisitos_base_adopcion_version_clave_unica" in MIGRACION
    assert "'pawalert-v1'" in MIGRACION
    for clave in (
        "identidad_mayoria_edad",
        "domicilio_verificable",
        "consentimiento_integrantes",
        "compromiso_veterinario",
        "seguimiento_devolucion_responsable",
        "veracidad_privacidad",
    ):
        assert f"'{clave}'" in MIGRACION
    assert "ON CONFLICT (version, clave) DO NOTHING" in MIGRACION


def test_requisitos_y_plantillas_publicados_son_inmutables():
    assert "bloquear_mutacion_requisito_base_adopcion" in MIGRACION
    assert "validar_mutacion_plantilla_adopcion" in MIGRACION
    assert "validar_mutacion_pregunta_adopcion" in MIGRACION
    assert "OLD.estado <> 'borrador'" in MIGRACION
    assert "OLD.estado = 'retirada'" in MIGRACION
    assert "v_estado_anterior IS DISTINCT FROM 'borrador'" in MIGRACION
    assert "v_estado_nuevo IS DISTINCT FROM 'borrador'" in MIGRACION


def test_plantilla_activa_es_unica_por_asociacion():
    assert "plantilla_requisitos_adopcion_activa" in MIGRACION
    assert "ON public.plantillas_requisitos_adopcion(asociacion_id)" in MIGRACION
    assert "WHERE estado = 'activa'" in MIGRACION


def test_preguntas_son_tipadas_y_documentos_siempre_sensibles():
    for tipo in (
        "texto_corto",
        "texto_largo",
        "seleccion_unica",
        "seleccion_multiple",
        "booleano",
        "fecha",
        "documento",
    ):
        assert f"'{tipo}'" in MIGRACION
    assert "tipo_respuesta <> 'documento' OR es_sensible = true" in MIGRACION


def test_solicitud_conserva_snapshot_y_contexto_de_asociacion():
    assert "requisitos_snapshot jsonb NOT NULL" in MIGRACION
    assert "solicitudes_adopcion_perfil_asociacion_fkey" in MIGRACION
    assert "solicitudes_adopcion_plantilla_contexto_fkey" in MIGRACION
    assert "jsonb_typeof(requisitos_snapshot) = 'array'" in MIGRACION


def test_impide_solicitudes_abiertas_o_seleccionadas_duplicadas():
    assert "solicitud_adopcion_abierta_persona_perfil" in MIGRACION
    assert "solicitud_adopcion_seleccionada_perfil" in MIGRACION
    assert "WHERE estado = 'seleccionada'" in MIGRACION


def test_respuesta_conserva_pregunta_y_origen_exactos():
    assert "pregunta_clave_snapshot" in MIGRACION
    assert "pregunta_texto_snapshot" in MIGRACION
    assert "tipo_respuesta_snapshot" in MIGRACION
    assert "respuestas_solicitud_adopcion_origen_exclusivo" in MIGRACION
    assert "UNIQUE (solicitud_adopcion_id, pregunta_clave_snapshot)" in MIGRACION


def test_documentos_solo_usan_bucket_privado_y_limite_acordado():
    assert "documento_storage_path LIKE 'adopciones/solicitudes/%'" in MIGRACION
    assert "documento_size_bytes <= 10485760" in MIGRACION
    assert "application/pdf" in MIGRACION
    assert "es_sensible_snapshot = true" in MIGRACION


def test_historial_adopcion_incorpora_solicitudes_del_adoptante():
    assert "ADD COLUMN IF NOT EXISTS solicitud_adopcion_id uuid" in MIGRACION
    assert "historial_adopcion_entidad_requerida" in MIGRACION
    assert "historial_adopcion_solicitud_adopcion_fecha_idx" in MIGRACION


def test_tablas_nuevas_nacen_privadas():
    for tabla in (
        "requisitos_base_adopcion",
        "plantillas_requisitos_adopcion",
        "preguntas_requisito_adopcion",
        "solicitudes_adopcion",
        "respuestas_solicitud_adopcion",
    ):
        assert f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION


def test_migracion_no_selecciona_ni_cambia_perfiles_reportes_o_custodias():
    assert "UPDATE public.perfiles_adopcion" not in MIGRACION
    assert "UPDATE public.reportes" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "adopcion_aprobada" not in MIGRACION
