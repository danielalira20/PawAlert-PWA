from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0096_adopciones_evaluacion_solicitudes.sql"
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


def test_todas_las_decisiones_validan_asociacion_operativa():
    for function_name in (
        "solicitar_informacion_solicitud_adopcion",
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    ):
        block = _bloque(function_name)
        assert "validar_actor_asociacion_operativa" in block
        assert "asociacion_id = p_asociacion_id" in block


def test_aclaracion_conserva_respuestas_y_notifica_sin_el_texto():
    block = _bloque(
        "solicitar_informacion_solicitud_adopcion",
        "seleccionar_solicitud_adopcion",
    )
    assert "SET estado = 'requiere_informacion'" in block
    assert "UPDATE public.respuestas_solicitud_adopcion" not in block
    notification = block.split(
        "PERFORM public.encolar_notificacion_modulo",
        1,
    )[1]
    assert "p_informacion_solicitada" not in notification
    assert "solicitud_adopcion_requiere_informacion" in notification


def test_seleccion_bloquea_perfil_antes_que_solicitud():
    block = _bloque(
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    )
    profile_lock = block.index("FROM public.perfiles_adopcion")
    application_lock = block.index(
        "FROM public.solicitudes_adopcion",
        profile_lock,
    )
    assert profile_lock < application_lock
    assert "FOR UPDATE" in block[profile_lock:application_lock]
    assert "SET estado = 'en_proceso'" in block
    assert "SET estado = 'seleccionada'" in block
    assert "v_perfil.estado_moderacion <> 'visible'" in block
    assert "perfil_adopcion_seleccion_en_conflicto" in block


def test_seleccion_no_rechaza_ni_cierra_otras_solicitudes():
    block = _bloque(
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    )
    assert "cerrada_por_adopcion" not in block
    assert "SET estado = 'rechazada'" not in block
    assert "UPDATE public.custodias_temporales" not in block
    assert "UPDATE public.reportes" not in block


def test_rechazo_separa_motivo_interno_de_categoria_publica():
    block = _bloque("rechazar_solicitud_adopcion")
    assert "motivo_rechazo_interno = trim(p_motivo_interno)" in block
    assert "categoria_rechazo_publica = trim(p_categoria_publica)" in block
    notification = block.split(
        "PERFORM public.encolar_notificacion_modulo",
        1,
    )[1]
    assert "p_motivo_interno" not in notification
    assert "categoria_rechazo_publica" in notification


def test_decisiones_rechazan_expedientes_vencidos():
    for function_name in (
        "solicitar_informacion_solicitud_adopcion",
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    ):
        block = _bloque(function_name)
        assert "vencimiento_at <= now()" in block
        assert "solicitud_adopcion_vencida" in block


def test_decisiones_son_idempotentes_y_solo_backend():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    for operation in ("informacion", "seleccion", "rechazo"):
        assert f"idempotency_key_{operation}_adopcion_en_conflicto" in MIGRACION
    assert MIGRACION.count("payload_hash") >= 9


def test_fallo_de_notificacion_no_revierte_la_decision_principal():
    for function_name in (
        "solicitar_informacion_solicitud_adopcion",
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    ):
        block = _bloque(function_name)
        notification = block.split(
            "PERFORM public.encolar_notificacion_modulo",
            1,
        )[1]
        assert "EXCEPTION WHEN OTHERS" in notification
        assert "RAISE WARNING" in notification
