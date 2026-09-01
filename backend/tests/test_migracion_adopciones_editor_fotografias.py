from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0092_adopciones_editor_fotografias_operaciones.sql"
).read_text(encoding="utf-8")


def test_editor_solo_acepta_campos_publicables_con_lista_cerrada():
    assert "actualizar_borrador_perfil_adopcion" in MIGRACION
    assert "v_campos_permitidos text[]" in MIGRACION
    assert "jsonb_object_keys(p_datos)" in MIGRACION
    assert "actualizacion_perfil_contiene_campos_no_permitidos" in MIGRACION
    for campo in (
        "nombre_publico",
        "salud_conocida",
        "revision_medica_estado",
        "compatibilidad",
        "zona_general",
    ):
        assert f"'{campo}'" in MIGRACION


def test_editor_solo_modifica_borrador_o_pausado():
    assert "v_perfil.estado NOT IN ('borrador', 'pausado')" in MIGRACION
    assert "perfil_adopcion_no_editable" in MIGRACION
    assert "PERFORM public.validar_actor_asociacion_operativa" in MIGRACION


def test_editor_valida_catalogos_cerrados_incluso_si_recibe_json_null():
    for campo, error in (
        ("sexo", "sexo_perfil_invalido"),
        ("edad_aproximada", "edad_aproximada_perfil_invalida"),
        ("vacunacion_estado", "vacunacion_estado_invalido"),
        ("esterilizacion_estado", "esterilizacion_estado_invalido"),
        ("revision_medica_estado", "revision_medica_estado_invalido"),
    ):
        assert f"p_datos->>'{campo}' IS NULL" in MIGRACION
        assert error in MIGRACION


def test_editar_invalida_revision_previa_sin_impedir_editar_un_pausado():
    assert "estado NOT IN ('publicado', 'en_proceso', 'adoptado')" in MIGRACION
    assert "revision_medica_confirmada = false" in MIGRACION
    assert "revision_juridica_confirmada = false" in MIGRACION
    assert "revision_publicacion_por_usuario_id = NULL" in MIGRACION
    assert "revision_publicacion_at = NULL" in MIGRACION


def test_registro_de_foto_valida_path_metadatos_limite_y_no_autoaprueba():
    assert "registrar_foto_perfil_adopcion" in MIGRACION
    assert "'adopciones/perfiles/' || p_perfil_id::text || '/%'" in MIGRACION
    assert "p_size_bytes > 10485760" in MIGRACION
    assert "p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')" in MIGRACION
    assert "p_mime_type IS NULL" in MIGRACION
    assert ">= 8" in MIGRACION
    assert "aprobada_publicacion" not in MIGRACION.split(
        "INSERT INTO public.fotos_perfil_adopcion", 1
    )[1].split(") VALUES", 1)[0]


def test_revision_de_foto_requiere_motivo_si_no_se_aprueba():
    assert "revisar_foto_perfil_adopcion" in MIGRACION
    assert "p_aprobada = false AND NULLIF(trim(p_motivo), '') IS NULL" in MIGRACION
    assert "perfil_adopcion_foto_aprobada" in MIGRACION
    assert "perfil_adopcion_foto_no_aprobada" in MIGRACION


def test_retiro_devuelve_path_solo_para_limpieza_backend():
    assert "retirar_foto_perfil_adopcion" in MIGRACION
    assert "DELETE FROM public.fotos_perfil_adopcion" in MIGRACION
    assert "'storage_path', v_foto.storage_path" in MIGRACION
    assert "perfil_adopcion_foto_retirada" in MIGRACION


def test_operaciones_registran_historial_idempotente():
    for prefijo in (
        "perfil:actualizar:",
        "perfil:foto:registrar:",
        "perfil:foto:revisar:",
        "perfil:foto:retirar:",
    ):
        assert prefijo in MIGRACION
    assert "idempotency_key_actualizacion_perfil_en_conflicto" in MIGRACION
    assert "idempotency_key_registro_foto_en_conflicto" in MIGRACION
    assert "idempotency_key_revision_foto_en_conflicto" in MIGRACION
    assert "idempotency_key_retiro_foto_en_conflicto" in MIGRACION
    assert "'id', (v_evento.datos_extra->>'foto_id')::uuid" in MIGRACION
    assert "'updated_at', v_evento.creado_at" in MIGRACION


def test_operaciones_son_backend_only_y_no_tocan_otros_flujos():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    assert "UPDATE public.reportes" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "UPDATE public.solicitudes_adopcion" not in MIGRACION
