from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0095_adopciones_solicitudes_operaciones.sql"
).read_text(encoding="utf-8")


def _bloque(nombre: str, siguiente: str | None = None) -> str:
    block = MIGRACION.split(
        f"CREATE OR REPLACE FUNCTION public.{nombre}",
        1,
    )[1]
    if siguiente:
        block = block.split(
            f"CREATE OR REPLACE FUNCTION public.{siguiente}",
            1,
        )[0]
    return block


def test_solicitante_necesita_cuenta_con_contacto_confirmado():
    block = _bloque(
        "validar_actor_solicitante_adopcion",
        "snapshot_requisitos_perfil_adopcion",
    )
    assert "auth_user_id" in block
    assert "FROM auth.users" in block
    assert "email_confirmed_at IS NOT NULL" in block
    assert "phone_confirmed_at IS NOT NULL" in block
    assert "solicitante_requiere_contacto_verificado" in block


def test_borrador_congela_requisitos_base_y_personalizados():
    snapshot = _bloque(
        "snapshot_requisitos_perfil_adopcion",
        "respuesta_adopcion_valida",
    )
    create = _bloque(
        "crear_borrador_solicitud_adopcion",
        "actualizar_respuestas_solicitud_adopcion",
    )
    assert "requisitos_base_version" in snapshot
    assert "plantilla_version" in snapshot
    assert "'origen', 'pawalert'" in snapshot
    assert "'origen', 'asociacion'" in snapshot
    assert "v_snapshot" in create
    assert "requisitos_snapshot" in create


def test_borrador_exige_perfil_publico_y_asociacion_operativa():
    block = _bloque(
        "crear_borrador_solicitud_adopcion",
        "actualizar_respuestas_solicitud_adopcion",
    )
    assert "v_perfil.estado <> 'publicado'" in block
    assert "v_perfil.estado_moderacion <> 'visible'" in block
    assert "asociacion.verificado" in block
    assert "solicitud_adopcion_abierta_duplicada" in block
    assert "pg_advisory_xact_lock" in block


def test_respuestas_tienen_contrato_cerrado_y_documentos_privados():
    validator = _bloque(
        "respuesta_adopcion_valida",
        "crear_borrador_solicitud_adopcion",
    )
    update = _bloque(
        "actualizar_respuestas_solicitud_adopcion",
        "enviar_solicitud_adopcion",
    )
    assert "campo <> ALL" in validator
    assert "seleccion_multiple" in validator
    assert "application/pdf" in validator
    assert "10485760" in validator
    assert "adopciones/solicitudes/" in update
    assert "documento_solicitud_adopcion_fuera_de_contexto" in update
    assert "respuesta_json = EXCLUDED.respuesta_json" in update


def test_actualizacion_es_del_duenio_editable_e_idempotente():
    block = _bloque(
        "actualizar_respuestas_solicitud_adopcion",
        "enviar_solicitud_adopcion",
    )
    assert "solicitante_usuario_id = p_actor_usuario_id" in block
    assert "('borrador', 'requiere_informacion')" in block
    assert "payload_hash" in block
    assert "idempotency_key_respuestas_adopcion_en_conflicto" in block
    assert "p_respuestas" not in block.split(
        "INSERT INTO public.historial_adopcion", 1
    )[1]


def test_envio_exige_respuestas_y_consentimientos():
    block = _bloque(
        "enviar_solicitud_adopcion",
        "retirar_solicitud_adopcion",
    )
    assert "requisitos_obligatorios_incompletos" in block
    assert "solicitud_adopcion_consentimientos_requeridos" in block
    assert "THEN 'enviada'" in block
    assert "ELSE 'en_evaluacion'" in block
    assert "interval '30 days'" in block


def test_retiro_no_admite_solicitud_seleccionada():
    block = _bloque("retirar_solicitud_adopcion")
    assert "'entrevista_programada'" in block
    assert "'seleccionada'" not in block.split(
        "IF v_solicitud.estado NOT IN", 1
    )[1].split(") THEN", 1)[0]
    assert "SET estado = 'retirada'" in block


def test_operaciones_solo_se_ejecutan_desde_backend():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    for function_name in (
        "crear_borrador_solicitud_adopcion",
        "actualizar_respuestas_solicitud_adopcion",
        "enviar_solicitud_adopcion",
        "retirar_solicitud_adopcion",
    ):
        assert function_name in MIGRACION


def test_solicitante_no_selecciona_ni_modifica_otros_flujos():
    for forbidden_statement in (
        "UPDATE public.perfiles_adopcion",
        "UPDATE public.custodias_temporales",
        "UPDATE public.reportes",
        "INSERT INTO public.entregas_adopcion",
    ):
        assert forbidden_statement not in MIGRACION
