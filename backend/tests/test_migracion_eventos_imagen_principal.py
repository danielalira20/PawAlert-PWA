from pathlib import Path


MIGRACION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "0099_eventos_imagen_principal.sql"
).read_text(encoding="utf-8")


def _bloque(nombre: str, siguiente: str | None = None) -> str:
    bloque = MIGRACION.split(
        f"CREATE OR REPLACE FUNCTION public.{nombre}", 1
    )[1]
    if siguiente:
        bloque = bloque.split(
            f"CREATE OR REPLACE FUNCTION public.{siguiente}", 1
        )[0]
    return bloque


def test_bucket_de_eventos_es_privado_y_restringe_archivos():
    assert MIGRACION.count("'pawalert-eventos-privado'") >= 2
    assert "false,\n  10485760" in MIGRACION
    assert "'image/jpeg', 'image/png', 'image/webp'" in MIGRACION
    assert "SET public = false" in MIGRACION


def test_registro_valida_propiedad_path_metadatos_y_texto_alternativo():
    bloque = _bloque(
        "registrar_imagen_evento_asociacion",
        "retirar_imagen_evento_asociacion",
    )
    assert "validar_actor_asociacion_operativa" in bloque
    assert "asociacion_id = p_asociacion_id" in bloque
    assert "FOR UPDATE" in bloque
    assert "'eventos/' || p_evento_id::text || '/%'" in bloque
    assert "p_size_bytes > 10485760" in bloque
    assert "NOT BETWEEN 1 AND 500" in bloque
    assert "storage_path_imagen_evento_invalido" in bloque


def test_imagen_versiona_evento_publicado_y_deja_auditoria():
    bloque = _bloque(
        "registrar_imagen_evento_asociacion",
        "retirar_imagen_evento_asociacion",
    )
    assert "version_publica > 0 THEN version_publica + 1" in bloque
    assert "INSERT INTO public.versiones_evento_asociacion" in bloque
    assert "snapshot_publico_evento_asociacion" in bloque
    assert "INSERT INTO public.historial_evento" in bloque
    assert "'evento_imagen_actualizada'" in bloque
    assert "'previous_storage_path'" in bloque


def test_registro_es_idempotente_y_detecta_payload_distinto():
    bloque = _bloque(
        "registrar_imagen_evento_asociacion",
        "retirar_imagen_evento_asociacion",
    )
    assert "idempotency_key_imagen_evento_en_conflicto" in bloque
    assert "'reintento', true" in bloque
    for field in (
        "storage_path",
        "mime_type",
        "size_bytes",
        "texto_alternativo",
    ):
        assert f"datos_extra->>'{field}'" in bloque


def test_retiro_no_elimina_evento_y_conserva_path_para_limpieza():
    bloque = _bloque("retirar_imagen_evento_asociacion")
    assert "SET imagen_storage_path = NULL" in bloque
    assert "evento_imagen_no_encontrada" in bloque
    assert "'evento_imagen_retirada'" in bloque
    assert "'previous_storage_path'" in bloque
    assert "DELETE FROM public.eventos_asociacion" not in bloque
    assert "idempotency_key_retiro_imagen_evento_en_conflicto" in bloque


def test_notificaciones_no_exponen_storage_path():
    for nombre, siguiente in (
        (
            "registrar_imagen_evento_asociacion",
            "retirar_imagen_evento_asociacion",
        ),
        ("retirar_imagen_evento_asociacion", None),
    ):
        bloque = _bloque(nombre, siguiente)
        llamada = bloque.split("PERFORM public.encolar_notificacion_modulo", 1)[1]
        payload = llamada.split("EXCEPTION WHEN OTHERS", 1)[0]
        assert "storage_path" not in payload
        assert "'evento_actualizado'" in payload


def test_rpc_solo_se_exponen_al_service_role():
    assert "FROM PUBLIC, anon, authenticated" in MIGRACION
    assert "TO service_role" in MIGRACION
    assert "BEGIN;" in MIGRACION
    assert "COMMIT;" in MIGRACION
    assert "NOTIFY pgrst, 'reload schema';" in MIGRACION
