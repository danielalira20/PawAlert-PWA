from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0105_bloquear_perfiles_adopcion_sin_eje.sql"
).read_text(encoding="utf-8")


def test_crea_helper_dedicado_en_vez_de_tocar_el_compartido():
    # No debe tocar validar_actor_asociacion_operativa (lo usan eventos y
    # el resto de las operaciones de adopción ya en curso).
    assert "CREATE OR REPLACE FUNCTION public.validar_asociacion_participa_adopciones" in MIGRACION
    assert "CREATE OR REPLACE FUNCTION public.validar_actor_asociacion_operativa" not in MIGRACION


def test_helper_bloquea_solo_cuando_el_eje_esta_apagado():
    assert "SELECT participa_adopciones INTO v_participa" in MIGRACION
    assert "RAISE EXCEPTION 'asociacion_eje_adopciones_inactivo'" in MIGRACION
    assert "COALESCE(v_participa, false) = false" in MIGRACION


def test_solo_crear_perfil_formal_llama_al_nuevo_helper():
    assert MIGRACION.count("validar_asociacion_participa_adopciones(p_asociacion_id)") == 1
    assert "PERFORM public.validar_asociacion_participa_adopciones(p_asociacion_id);" in MIGRACION


def test_conserva_el_resto_del_contrato_de_crear_perfil_formal():
    assert "CREATE OR REPLACE FUNCTION public.crear_perfil_adopcion_formal" in MIGRACION
    assert "'perfil_formal_incompleto'" in MIGRACION
    assert "idempotency_key_perfil_formal_en_conflicto" in MIGRACION
    assert "'perfil_adopcion_borrador_creado'" in MIGRACION
