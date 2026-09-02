from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0104_filtrar_eje_rescates_asociacion_operativa.sql"
).read_text(encoding="utf-8")


def test_reemplaza_la_misma_funcion_sin_cambiar_su_firma():
    assert "CREATE OR REPLACE FUNCTION public.encontrar_asociacion_operativa" in MIGRACION
    assert "RETURNS TABLE(" in MIGRACION
    assert "id uuid,\n  nombre character varying,\n  distancia_km numeric" in MIGRACION


def test_agrega_el_filtro_de_eje_rescates_junto_a_los_demas_gates():
    assert "a.activo = true" in MIGRACION
    assert "a.verificado = true" in MIGRACION
    assert "a.recepcion_reportes_activa = true" in MIGRACION
    assert "a.participa_rescates = true" in MIGRACION


def test_conserva_el_resto_del_contrato_de_la_0063():
    # Cobertura, carga y ranking no deben tocarse en este cambio -- solo
    # se agrega un filtro más, todo lo demás debe seguir igual.
    assert "distancia_km <= radio_km" in MIGRACION
    assert "COALESCE(c.casos_activos, 0) < a.capacidad_reportes_simultaneos" in MIGRACION
    assert "ORDER BY" in MIGRACION
    assert "d.puntaje_operativo ASC" in MIGRACION
