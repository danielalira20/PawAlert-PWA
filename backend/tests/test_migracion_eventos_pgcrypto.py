from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0098_eventos_pgcrypto_search_path.sql"
).read_text(encoding="utf-8")


FUNCIONES_CON_HASH = (
    "crear_borrador_evento_asociacion",
    "actualizar_evento_asociacion",
    "pausar_evento_asociacion",
    "cancelar_evento_asociacion",
)


def test_migracion_exige_digest_de_pgcrypto_en_extensions():
    assert "to_regprocedure('extensions.digest(text,text)')" in MIGRACION
    assert "pgcrypto_digest_no_disponible_en_extensions" in MIGRACION


def test_operaciones_con_hash_resuelven_extensions_en_search_path():
    for funcion in FUNCIONES_CON_HASH:
        bloque = MIGRACION.split(
            f"ALTER FUNCTION public.{funcion}",
            1,
        )[1].split(";", 1)[0]
        assert "SET search_path = public, extensions, pg_temp" in bloque


def test_migracion_es_atomica_y_recarga_postgrest():
    assert MIGRACION.startswith("-- Corrige")
    assert "BEGIN;" in MIGRACION
    assert "COMMIT;" in MIGRACION
    assert "NOTIFY pgrst, 'reload schema';" in MIGRACION
