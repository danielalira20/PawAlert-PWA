from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0063_seleccion_asociacion_operativa.sql"
).read_text(encoding="utf-8")


def test_crea_rpc_nueva_sin_reemplazar_selector_legado():
    assert "FUNCTION public.encontrar_asociacion_operativa" in MIGRACION
    assert "FUNCTION public.encontrar_asociacion_cercana" not in MIGRACION
    assert "RETURNS TABLE" in MIGRACION
    assert "id uuid" in MIGRACION
    assert "nombre character varying" in MIGRACION
    assert "distancia_km numeric" in MIGRACION


def test_filtra_estado_cobertura_especies_y_disponibilidad():
    assert "a.activo = true" in MIGRACION
    assert "a.verificado = true" in MIGRACION
    assert "a.recepcion_reportes_activa = true" in MIGRACION
    assert "p_tipos_animales <@ a.tipos_animales::text[]" in MIGRACION
    assert "distancia_km <= radio_km" in MIGRACION
    assert "= ANY(a.dias_recepcion)" in MIGRACION
    assert "a.recepcion_reportes_24h" in MIGRACION


def test_excluye_asociaciones_saturadas_segun_tipo_de_caso():
    assert (
        "COALESCE(c.casos_activos, 0) < a.capacidad_reportes_simultaneos"
        in MIGRACION
    )
    assert "NOT p_es_critico" in MIGRACION
    assert (
        "COALESCE(c.casos_criticos_activos, 0) < a.capacidad_reportes_criticos"
        in MIGRACION
    )


def test_carga_solo_cuenta_reportes_operativos_y_validados():
    assert "('asignado', 'en_camino', 'en_atencion')" in MIGRACION
    assert "r.estado_validacion_reporte = 'aprobado'" in MIGRACION
    assert "COALESCE(r.estado_moderacion, 'visible') <> 'rechazado'" in MIGRACION
    assert "cc.clave = 'grave'" in MIGRACION


def test_ranking_combina_distancia_carga_y_casos_criticos():
    assert "* 0.45" in MIGRACION
    assert "* 0.35" in MIGRACION
    assert "* 0.20" in MIGRACION
    assert "* 0.60" in MIGRACION
    assert "* 0.40" in MIGRACION
    assert "ORDER BY" in MIGRACION
    assert "d.puntaje_operativo ASC" in MIGRACION


def test_rpc_solo_es_ejecutable_desde_backend():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
