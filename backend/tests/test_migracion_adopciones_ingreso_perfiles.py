from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0086_adopciones_ingreso_perfiles.sql"
).read_text(encoding="utf-8")


def test_crea_base_de_ingreso_perfiles_fotos_e_historial():
    for tabla in (
        "solicitudes_ingreso_adopcion",
        "perfiles_adopcion",
        "fotos_perfil_adopcion",
        "historial_adopcion",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabla}" in MIGRACION


def test_origen_desde_custodia_exige_contexto_completo():
    assert "solicitudes_ingreso_adopcion_custodia_contexto_fkey" in MIGRACION
    assert "solicitudes_ingreso_adopcion_animal_reporte_fkey" in MIGRACION
    assert "perfiles_adopcion_custodia_contexto_fkey" in MIGRACION
    assert "perfiles_adopcion_animal_reporte_fkey" in MIGRACION
    assert "origen = 'custodia_pawalert'" in MIGRACION
    for columna in (
        "custodia_id IS NOT NULL",
        "reporte_id IS NOT NULL",
        "animal_id IS NOT NULL",
        "origen_individuo IS NOT NULL",
    ):
        assert columna in MIGRACION


def test_individualiza_grupos_y_evitar_perfiles_activos_duplicados():
    assert "origen_individuo > 0" in MIGRACION
    assert "perfil_adopcion_activo_por_animal" in MIGRACION
    assert "ON public.perfiles_adopcion(animal_id, origen_individuo)" in MIGRACION
    assert "estado NOT IN ('adoptado', 'retirado', 'fallecido')" in MIGRACION


def test_propuesta_exige_fotos_y_json_estructurado():
    assert "cardinality(fotos_propuesta_paths) BETWEEN 1 AND 5" in MIGRACION
    assert "jsonb_typeof(compatibilidad_observada) = 'object'" in MIGRACION
    assert "jsonb_typeof(compatibilidad) = 'object'" in MIGRACION


def test_estado_operativo_y_moderacion_permanecen_separados():
    assert "estado_moderacion IN ('visible', 'suspendido')" in MIGRACION
    assert "perfiles_adopcion_moderacion_consistente" in MIGRACION
    assert "WHERE estado = 'publicado' AND estado_moderacion = 'visible'" in MIGRACION


def test_historial_es_inmutable_e_idempotente():
    assert "historial_adopcion_idempotencia_unica" in MIGRACION
    assert "CREATE OR REPLACE FUNCTION public.bloquear_mutacion_historial_adopcion" in MIGRACION
    assert "BEFORE UPDATE OR DELETE ON public.historial_adopcion" in MIGRACION
    assert "historial_adopcion_inmutable" in MIGRACION


def test_tablas_son_privadas_y_solo_backend_escribe():
    for tabla in (
        "solicitudes_ingreso_adopcion",
        "perfiles_adopcion",
        "fotos_perfil_adopcion",
        "historial_adopcion",
    ):
        assert f"ALTER TABLE public.{tabla} ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION


def test_bucket_privado_no_modifica_buckets_existentes():
    assert "'pawalert-adopciones-privado'" in MIGRACION
    assert "false," in MIGRACION
    assert "file_size_limit" in MIGRACION
    assert "allowed_mime_types" in MIGRACION
    assert "UPDATE storage.buckets" not in MIGRACION


def test_migracion_no_cambia_estados_de_reporte_o_custodia():
    assert "UPDATE public.reportes" not in MIGRACION
    assert "UPDATE public.custodias_temporales" not in MIGRACION
    assert "adopcion_aprobada" not in MIGRACION
