from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0097_eventos_operaciones_basicas.sql"
).read_text(encoding="utf-8")


FUNCIONES = (
    "crear_borrador_evento_asociacion",
    "actualizar_evento_asociacion",
    "publicar_evento_asociacion",
    "pausar_evento_asociacion",
    "cancelar_evento_asociacion",
    "guardar_evento_asociacion",
    "dejar_de_guardar_evento_asociacion",
)


def _bloque(nombre: str, siguiente: str | None = None) -> str:
    bloque = MIGRACION.split(
        f"CREATE OR REPLACE FUNCTION public.{nombre}",
        1,
    )[1]
    if siguiente:
        bloque = bloque.split(
            f"CREATE OR REPLACE FUNCTION public.{siguiente}",
            1,
        )[0]
    return bloque


def test_migracion_expone_operaciones_basicas_esperadas():
    for funcion in FUNCIONES:
        assert f"CREATE OR REPLACE FUNCTION public.{funcion}" in MIGRACION


def test_escrituras_de_asociacion_validan_autoridad_y_propiedad():
    operaciones = (
        ("crear_borrador_evento_asociacion", "actualizar_evento_asociacion"),
        ("actualizar_evento_asociacion", "publicar_evento_asociacion"),
        ("publicar_evento_asociacion", "pausar_evento_asociacion"),
        ("pausar_evento_asociacion", "cancelar_evento_asociacion"),
        ("cancelar_evento_asociacion", "guardar_evento_asociacion"),
    )
    for nombre, siguiente in operaciones:
        bloque = _bloque(nombre, siguiente)
        assert "validar_actor_asociacion_operativa" in bloque
        if nombre != "crear_borrador_evento_asociacion":
            assert "asociacion_id = p_asociacion_id" in bloque
            assert "FOR UPDATE" in bloque


def test_payload_no_permite_mutar_identidad_estado_o_rutas_de_storage():
    bloque = _bloque(
        "validar_payload_evento_asociacion",
        "validar_responsable_operativo_evento",
    )
    for campo_protegido in (
        "creado_por_usuario_id",
        "asociacion_id",
        "estado",
        "version_publica",
        "imagen_storage_path",
        "cancelado_por_usuario_id",
        "motivo_suspension",
    ):
        assert f"'{campo_protegido}'" not in bloque
    assert "payload_evento_campos_no_permitidos" in bloque


def test_responsable_operativo_debe_pertenecer_a_la_misma_asociacion():
    bloque = _bloque(
        "validar_responsable_operativo_evento",
        "snapshot_publico_evento_asociacion",
    )
    assert "usuario.asociacion_id = p_asociacion_id" in bloque
    assert "rol.nombre IN ('asociacion', 'staff')" in bloque
    assert "responsable_operativo_no_pertenece_asociacion" in bloque


def test_snapshot_publico_usa_lista_explicita_y_no_filtra_identidad_interna():
    bloque = _bloque(
        "snapshot_publico_evento_asociacion",
        "crear_borrador_evento_asociacion",
    )
    assert "jsonb_build_object" in bloque
    assert "imagen_storage_path" not in bloque
    assert "creado_por_usuario_id" not in bloque
    assert "responsable_operativo_usuario_id" not in bloque
    assert "cancelado_por_usuario_id" not in bloque
    assert "motivo_suspension" not in bloque


def test_actualizacion_bloquea_estados_terminales_y_versiona_publicaciones():
    bloque = _bloque(
        "actualizar_evento_asociacion",
        "publicar_evento_asociacion",
    )
    assert "estado NOT IN ('borrador', 'publicado', 'pausado')" in bloque
    assert "evento_no_editable" in bloque
    assert "version_publica + 1" in bloque
    assert "INSERT INTO public.versiones_evento_asociacion" in bloque
    assert "evento_publicado_no_puede_quedar_vencido" in bloque
    assert "actualizacion_evento_sin_cambios" in bloque


def test_publicacion_solo_admite_borrador_o_pausa_y_crea_snapshot():
    bloque = _bloque(
        "publicar_evento_asociacion",
        "pausar_evento_asociacion",
    )
    assert "estado NOT IN ('borrador', 'pausado')" in bloque
    assert "termina_at <= now()" in bloque
    assert "SET estado = 'publicado'" in bloque
    assert "version_publica = version_publica + 1" in bloque
    assert "INSERT INTO public.versiones_evento_asociacion" in bloque
    assert "'evento_publicado'" in bloque


def test_pausa_y_cancelacion_respetan_transiciones_y_no_borran_evento():
    pausa = _bloque(
        "pausar_evento_asociacion",
        "cancelar_evento_asociacion",
    )
    cancelacion = _bloque(
        "cancelar_evento_asociacion",
        "guardar_evento_asociacion",
    )
    assert "estado <> 'publicado'" in pausa
    assert "SET estado = 'pausado'" in pausa
    assert "estado NOT IN ('publicado', 'pausado')" in cancelacion
    assert "SET estado = 'cancelado'" in cancelacion
    assert "motivo_cancelacion_publico = trim(p_motivo_publico)" in cancelacion
    assert "DELETE FROM public.eventos_asociacion" not in pausa + cancelacion


def test_cancelacion_notifica_a_suscriptores_sin_datos_privados():
    bloque = _bloque(
        "cancelar_evento_asociacion",
        "guardar_evento_asociacion",
    )
    assert "FROM public.eventos_guardados" in bloque
    assert "PERFORM public.encolar_notificacion_modulo" in bloque
    assert "'evento_cancelado'" in bloque
    notificacion = bloque.split(
        "PERFORM public.encolar_notificacion_modulo",
        1,
    )[1]
    assert "storage_path" not in notificacion
    assert "latitud" not in notificacion
    assert "longitud" not in notificacion
    assert "EXCEPTION WHEN OTHERS" in notificacion


def test_guardar_evento_no_reserva_cupo_y_exige_evento_publico_vigente():
    bloque = _bloque(
        "guardar_evento_asociacion",
        "dejar_de_guardar_evento_asociacion",
    )
    assert "evento.estado = 'publicado'" in bloque
    assert "evento.termina_at > now()" in bloque
    assert "asociacion.verificado" in bloque
    assert "asociacion.activo" in bloque
    assert "INSERT INTO public.eventos_guardados" in bloque
    assert "cupo_total" not in bloque
    assert "reserva" not in bloque.lower()


def test_desguardar_elimina_solo_la_suscripcion_y_deja_historial():
    bloque = _bloque("dejar_de_guardar_evento_asociacion")
    assert "DELETE FROM public.eventos_guardados" in bloque
    assert "DELETE FROM public.eventos_asociacion" not in bloque
    assert "'evento_dejado_de_guardar'" in bloque
    assert "INSERT INTO public.historial_evento" in bloque


def test_operaciones_son_idempotentes_y_detectan_reuso_en_conflicto():
    for operacion in (
        "creacion",
        "actualizacion",
        "publicacion",
        "pausa",
        "cancelacion",
    ):
        assert f"idempotency_key_{operacion}_evento_en_conflicto" in MIGRACION
    assert MIGRACION.count("payload_hash") >= 12
    assert MIGRACION.count("'reintento', true") >= 7
    assert "idempotency_key_guardado_evento_en_conflicto" in MIGRACION
    assert "idempotency_key_retiro_guardado_evento_en_conflicto" in MIGRACION


def test_funciones_solo_son_ejecutables_por_service_role():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    for funcion in FUNCIONES:
        assert f"public.{funcion}" in MIGRACION


def test_eventos_siguen_separados_del_flujo_de_rescate_y_despacho():
    for tabla_prohibida in (
        "public.reportes",
        "public.custodias_temporales",
        "public.reporte_asignaciones",
        "urgency_report_claims",
    ):
        assert tabla_prohibida not in MIGRACION
    assert "OSRM" not in MIGRACION
    assert "VROOM" not in MIGRACION
