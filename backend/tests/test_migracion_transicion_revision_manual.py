from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "0066_transicion_revision_manual.sql"
).read_text()


def test_transicion_revision_es_atomica_y_bloquea_atencion_en_curso():
    assert "CREATE OR REPLACE FUNCTION public.transicion_revision_manual" in MIGRATION
    assert "FOR UPDATE" in MIGRATION
    assert "atencion_en_curso" in MIGRATION
    assert "estado = 'confirmada'" in MIGRATION
    for estado in (
        "activo",
        "extension_pendiente",
        "buscando_relevo",
        "traslado_programado",
    ):
        assert estado in MIGRATION


def test_transicion_revision_limpia_operacion_y_registra_historial():
    for sentencia in (
        "UPDATE public.propuestas_asignacion",
        "UPDATE public.voluntario_ofrecimientos",
        "UPDATE public.reporte_asignaciones",
        "estado = 'rechazada'",
        "estado_reporte = 'pendiente'",
        "estado_validacion_reporte = 'revision_manual'",
        "validacion_completada_at = NULL",
        "asociacion_asignada_id = NULL",
        "staff_asignado_id = NULL",
        "urgency_score = NULL",
        "urgency_proximo_recalculo_at = NULL",
        "'reporte_transicion_revision_manual'",
    ):
        assert sentencia in MIGRATION


def test_timeout_y_detalle_de_propuestas_corrigen_contratos_previos():
    assert "'sigue_ahi', 'ya_no_esta', 'timeout'" in MIGRATION
    assert (
        "asociacion_coordinadora_id := "
        "v_propuesta.asociacion_coordinadora_id"
    ) in MIGRATION
    assert "v_propuesta.asociacion_id" not in MIGRATION
    assert "'confirmacion_permanencia_ya_no_esta'" in MIGRATION


def test_permanencia_de_invitados_tiene_telefono_y_admite_whatsapp():
    assert "'reportante_invitado'" in MIGRATION
    assert "reportante_telefono text" in MIGRATION
    assert "r.estado_cobertura IS NULL" in MIGRATION
    assert "DROP FUNCTION IF EXISTS public.obtener_reportes_inactivos_permanencia" in MIGRATION


def test_funciones_sensibles_solo_se_exponen_a_service_role():
    assert "GRANT EXECUTE ON FUNCTION public.transicion_revision_manual" in MIGRATION
    assert "GRANT EXECUTE ON FUNCTION public.expirar_propuestas_cobertura_detalladas" in MIGRATION
    assert MIGRATION.count("TO service_role") == 3
