from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0091_adopciones_ingreso_perfiles_operaciones.sql"
).read_text(encoding="utf-8")


def test_completa_aclaraciones_revision_y_version_de_requisitos():
    assert "ADD COLUMN IF NOT EXISTS respuesta_informacion text" in MIGRACION
    assert "ADD COLUMN IF NOT EXISTS requisitos_base_version text" in MIGRACION
    assert "revision_medica_confirmada boolean NOT NULL DEFAULT false" in MIGRACION
    assert "revision_juridica_confirmada boolean NOT NULL DEFAULT false" in MIGRACION
    assert "perfiles_adopcion_plantilla_contexto_fkey" in MIGRACION
    assert "perfiles_adopcion_revision_publicacion_consistente" in MIGRACION


def test_propuesta_exige_custodio_activo_asociacion_y_animal_compatible():
    assert "proponer_ingreso_adopcion_desde_custodia" in MIGRACION
    assert "voluntario.usuario_id" in MIGRACION
    assert "SELECT custodia.*\n  INTO v_custodia" in MIGRACION
    assert "INTO v_custodia, v_usuario_custodio_id" not in MIGRACION
    assert "actor_no_es_custodio_activo" in MIGRACION
    assert "('activo', 'extension_pendiente')" in MIGRACION
    assert "asociacion_coordinadora_no_operativa" in MIGRACION
    assert "animal_no_pertenece_custodia" in MIGRACION
    assert "individuo_animal_invalido" in MIGRACION
    assert "animal_con_resultado_incompatible_adopcion" in MIGRACION
    assert "animal_ya_tiene_perfil_adopcion_activo" in MIGRACION
    assert "fecha_disponibilidad_custodia_invalida" in MIGRACION


def test_fotos_de_ingreso_permanecen_en_ruta_privada():
    assert "solicitudes_ingreso_adopcion_fotos_paths_privados" in MIGRACION
    assert "paths_ingreso_adopcion_validos" in MIGRACION
    assert "IMMUTABLE" in MIGRACION
    assert "adopciones/ingresos/%" in MIGRACION
    assert "fotos_propuesta_invalidas" in MIGRACION


def test_propuesta_no_toca_reporte_ni_custodia():
    assert "UPDATE public.reportes" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "INSERT INTO public.solicitudes_ingreso_adopcion" in MIGRACION


def test_aclaracion_y_cancelacion_solo_corresponden_al_proponente():
    assert "responder_aclaracion_ingreso_adopcion" in MIGRACION
    assert "cancelar_solicitud_ingreso_adopcion" in MIGRACION
    assert "actor_no_es_proponente_ingreso" in MIGRACION
    assert "estado = 'pendiente'" in MIGRACION
    assert "estado = 'cancelada'" in MIGRACION
    assert "solicitud_ingreso_ya_espera_aclaracion" in MIGRACION
    assert "adopcion:ingreso:cancelado:" in MIGRACION


def test_resolver_valida_asociacion_y_aprobacion_crea_un_borrador():
    assert "resolver_solicitud_ingreso_adopcion" in MIGRACION
    assert "PERFORM public.validar_actor_asociacion_operativa" in MIGRACION
    assert "INSERT INTO public.perfiles_adopcion" in MIGRACION
    assert "solicitud_ingreso_id" in MIGRACION
    assert "'adopcion_ingreso_aprobado'" in MIGRACION
    assert "'adopcion_ingreso_requiere_informacion'" in MIGRACION
    assert "'adopcion_ingreso_rechazado'" in MIGRACION


def test_ingreso_formal_nace_como_borrador_de_la_asociacion():
    assert "crear_perfil_adopcion_formal" in MIGRACION
    assert "'ingreso_formal_asociacion'" in MIGRACION
    assert "'perfil_adopcion_borrador_creado'" in MIGRACION
    assert "idempotency_key_perfil_formal_en_conflicto" in MIGRACION


def test_publicacion_exige_datos_foto_revision_y_requisitos():
    assert "publicar_perfil_adopcion" in MIGRACION
    assert "perfil_adopcion_datos_publicacion_incompletos" in MIGRACION
    assert "perfil_adopcion_sin_foto_aprobada" in MIGRACION
    assert "requisitos_base_adopcion_no_disponibles" in MIGRACION
    assert "revision_medica_confirmada = true" in MIGRACION
    assert "revision_juridica_confirmada = true" in MIGRACION
    assert "plantilla.estado = 'activa'" in MIGRACION
    assert "'perfil_adopcion_publicado'" in MIGRACION


def test_pausa_solo_admite_perfil_publicado_y_motivo():
    assert "pausar_perfil_adopcion" in MIGRACION
    assert "v_perfil.estado <> 'publicado'" in MIGRACION
    assert "NULLIF(trim(p_motivo), '') IS NULL" in MIGRACION
    assert "'perfil_adopcion_pausado'" in MIGRACION


def test_outbox_acepta_ingreso_y_sigue_rechazando_payload_privado():
    assert "ADD COLUMN IF NOT EXISTS solicitud_ingreso_adopcion_id uuid" in MIGRACION
    assert "p_solicitud_ingreso_id IS NOT NULL" in MIGRACION
    assert "motivo_rechazo_interno" in MIGRACION
    assert "notificacion_idempotency_key_en_conflicto" in MIGRACION


def test_operaciones_son_idempotentes_y_backend_only():
    for prefijo in (
        "ingreso:proponer:",
        "ingreso:aclarar:",
        "ingreso:cancelar:",
        "ingreso:resolver:",
        "perfil:formal:",
        "perfil:publicar:",
        "perfil:pausar:",
    ):
        assert prefijo in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
