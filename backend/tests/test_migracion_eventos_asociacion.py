from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0089_eventos_asociacion.sql"
).read_text(encoding="utf-8")


def test_crea_entidades_principales_y_moderacion():
    for tabla in (
        "eventos_asociacion",
        "versiones_evento_asociacion",
        "eventos_colaboradores",
        "eventos_perfiles_adopcion",
        "eventos_guardados",
        "reportes_evento_asociacion",
        "historial_evento",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabla}" in MIGRACION


def test_tipos_estados_y_modalidades_coinciden_con_el_contrato():
    for valor in (
        "vacunacion",
        "esterilizacion",
        "feria_adopcion",
        "identificacion",
        "acopio",
        "capacitacion",
        "bienestar_animal",
        "otro",
        "sin_registro",
        "registro_externo",
        "contacto_institucional",
        "suspendido_admin",
    ):
        assert f"'{valor}'" in MIGRACION


def test_publicacion_exige_datos_fechas_y_ubicacion_publica():
    assert "eventos_asociacion_datos_publicables" in MIGRACION
    assert "inicia_at < termina_at" in MIGRACION
    assert "latitud BETWEEN -90 AND 90" in MIGRACION
    assert "longitud BETWEEN -180 AND 180" in MIGRACION
    assert "latitud IS NOT NULL" in MIGRACION
    assert "longitud IS NOT NULL" in MIGRACION
    assert "NULLIF(trim(direccion_publica), '') IS NOT NULL" in MIGRACION
    assert "NULLIF(trim(zona_horaria), '') IS NOT NULL" in MIGRACION


def test_modalidad_costo_cupo_y_servicios_clinicos_son_consistentes():
    assert "eventos_asociacion_modalidad_consistente" in MIGRACION
    assert "eventos_asociacion_costo_consistente" in MIGRACION
    assert "eventos_asociacion_cupo_consistente" in MIGRACION
    assert "eventos_asociacion_clinico_consistente" in MIGRACION
    assert "datos_profesionales_estado IN ('declarado', 'verificado')" in MIGRACION


def test_versiones_publicas_e_historial_son_inmutables():
    assert "versiones_evento_asociacion_version_unica" in MIGRACION
    assert "bloquear_mutacion_auditoria_evento" in MIGRACION
    assert "versiones_evento_asociacion_inmutables" in MIGRACION
    assert "historial_evento_inmutable" in MIGRACION
    assert MIGRACION.count("BEFORE UPDATE OR DELETE") >= 2


def test_evento_no_se_transfiere_ni_se_elimina():
    assert "validar_propiedad_evento_asociacion" in MIGRACION
    assert "NEW.asociacion_id IS DISTINCT FROM OLD.asociacion_id" in MIGRACION
    assert "NEW.version_publica < OLD.version_publica" in MIGRACION
    assert "Un evento no se elimina; debe cancelarse o archivarse" in MIGRACION


def test_colaboradores_exigen_origen_exclusivo_y_verificacion():
    assert "eventos_colaboradores_origen_exclusivo" in MIGRACION
    assert "evento_colaborador_perfil_apoyo_unico" in MIGRACION
    assert "evento_colaborador_asociacion_unica" in MIGRACION
    assert "COALESCE(verificado_admin, false)" in MIGRACION
    assert "COALESCE(verificado, false) AND COALESCE(activo, false)" in MIGRACION
    assert "NEW.estado NOT IN ('pendiente', 'aceptada')" in MIGRACION
    assert "asociacion_colaboradora_id, estado" in MIGRACION
    assert "validar_identidad_colaborador_evento" in MIGRACION
    assert "Una colaboracion no se elimina; debe cancelarse" in MIGRACION


def test_colaborador_solo_es_publicable_despues_de_aceptar():
    assert "estado IN ('pendiente', 'aceptada', 'rechazada', 'cancelada')" in MIGRACION
    assert "estado IN ('aceptada', 'rechazada')" in MIGRACION
    assert "respondida_por_usuario_id IS NOT NULL" in MIGRACION
    assert "respondida_at IS NOT NULL" in MIGRACION


def test_feria_solo_vincula_perfiles_publicados_y_autorizados():
    assert "validar_perfil_vinculado_evento" in MIGRACION
    assert "v_tipo_evento IS DISTINCT FROM 'feria_adopcion'" in MIGRACION
    assert "v_estado_perfil IS DISTINCT FROM 'publicado'" in MIGRACION
    assert "asociacion_colaboradora_id = NEW.perfil_asociacion_id" in MIGRACION
    assert "estado = 'aceptada'" in MIGRACION
    assert "perfil_adopcion_contexto_evento_unico" not in MIGRACION


def test_guardar_evento_no_modela_reserva_cupo_o_pago():
    assert "eventos_guardados_usuario_evento_unico" in MIGRACION
    assert "reservas_evento" not in MIGRACION
    assert "asistencias_evento" not in MIGRACION
    assert "pagos_evento" not in MIGRACION


def test_reportes_de_seguridad_se_guardan_en_privado():
    for motivo in (
        "informacion_falsa",
        "servicio_riesgoso",
        "ubicacion_incorrecta",
        "cobro_no_informado",
    ):
        assert f"'{motivo}'" in MIGRACION
    assert "evidencia_storage_path LIKE 'eventos/reportes/%'" in MIGRACION
    assert "evidencia_mime_type IS NOT NULL" in MIGRACION
    assert "evidencia_size_bytes IS NOT NULL" in MIGRACION
    assert "reporte_evento_abierto_usuario_unico" in MIGRACION


def test_tablas_son_backend_only_desde_su_creacion():
    for tabla in (
        "eventos_asociacion",
        "versiones_evento_asociacion",
        "eventos_colaboradores",
        "eventos_perfiles_adopcion",
        "eventos_guardados",
        "reportes_evento_asociacion",
        "historial_evento",
    ):
        assert f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION


def test_migracion_no_modifica_rescates_adopciones_o_custodias():
    assert "UPDATE public.reportes" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "UPDATE public.perfiles_adopcion" not in MIGRACION
    assert "UPDATE public.solicitudes_adopcion" not in MIGRACION
    assert "Urgency" not in MIGRACION
    assert "VROOM" not in MIGRACION
