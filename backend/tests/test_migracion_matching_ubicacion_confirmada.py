from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0073_matching_ultima_ubicacion.sql"
).read_text(encoding="utf-8")


def test_migracion_persiste_ultima_ubicacion_operativa():
    assert "ultima_latitud_confirmada double precision" in MIGRACION
    assert "ultima_longitud_confirmada double precision" in MIGRACION
    assert "FROM public.avistamientos_animal AS av" in MIGRACION
    assert "av.estado_validacion = 'validado'" in MIGRACION


def test_matching_usa_ultima_ubicacion_con_fallback_al_reporte_original():
    assert "CREATE OR REPLACE FUNCTION public.candidatos_para_reporte" in MIGRACION
    assert MIGRACION.count(
        "COALESCE(rep.ultima_latitud_confirmada, rep.latitud)"
    ) >= 3
    assert MIGRACION.count(
        "COALESCE(rep.ultima_longitud_confirmada, rep.longitud)"
    ) >= 3


def test_matching_conserva_limites_y_contrato_operativo():
    assert "LEAST(c.radio_max_km, 30) * 1000" in MIGRACION
    assert "v.estado IN ('activo_nivel_1', 'activo_nivel_2')" in MIGRACION
    assert "c.max_casos_simultaneos" in MIGRACION
    assert "r.nombre = 'voluntario_externo'" in MIGRACION
