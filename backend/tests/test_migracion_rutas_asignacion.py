from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0069_rutas_asignacion_osrm.sql"
).read_text(encoding="utf-8")


def test_route_is_persisted_on_the_confirmed_proposal():
    for column in (
        "ruta_status",
        "ruta_duracion_segundos",
        "ruta_distancia_metros",
        "ruta_geometria",
        "ruta_error_codigo",
        "ruta_calculada_at",
    ):
        assert column in MIGRACION

    assert "WHERE estado = 'confirmada'" in MIGRACION
    assert "GeoJSON LineString privado" in MIGRACION


def test_route_status_and_payload_are_coherent():
    assert "propuestas_ruta_status_check" in MIGRACION
    assert "propuestas_ruta_valores_check" in MIGRACION
    assert "propuestas_ruta_geometria_check" in MIGRACION
    assert "propuestas_ruta_error_check" in MIGRACION
    assert "ruta_status = 'complete'" in MIGRACION
    assert "ruta_status = 'unavailable'" in MIGRACION


def test_route_geometry_is_private_to_backend():
    assert "ENABLE ROW LEVEL SECURITY" in MIGRACION
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
