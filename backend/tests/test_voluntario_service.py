import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import voluntario_service


# ─── finalizar_postulacion_interno() ──────────────────────────────────────
# La postulación de interno se crea aquí, no en POST /voluntarios/postulaciones
# — así no queda una postulación sin capacidades si el usuario abandona el
# formulario a medias.

def test_finalizar_postulacion_interno_sin_capacidades_lanza_422(make_query):
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        pytest.raises(Exception) as error,
    ):
        asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    assert getattr(error.value, "status_code", None) == 422
    assert "capacidades" in getattr(error.value, "detail", "").lower()


def test_finalizar_postulacion_interno_caso_feliz_llama_crear_postulacion(make_query):
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[{"voluntario_id": "vol-1"}])
    postulaciones = make_query(data=[])  # sin ninguna pendiente
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    resultado_esperado = {
        "postulacion_id": "post-1",
        "voluntario_id": "vol-1",
        "numero_intento": 1,
        "estado": "pendiente",
    }

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch.object(
            voluntario_service, "crear_postulacion",
            new=AsyncMock(return_value=resultado_esperado),
        ) as crear_mock,
    ):
        resultado = asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    crear_mock.assert_awaited_once_with("user-1", "interno", "asoc-1")
    assert resultado == resultado_esperado


def test_finalizar_postulacion_interno_idempotente_no_llama_crear_postulacion(make_query):
    # Simula un reintento después de que el INSERT anterior sí se completó
    # pero la respuesta se perdió — debe regresar la postulación ya creada
    # en vez de dejar que crear_postulacion() lance 409 (mismo patrón que
    # finalizar_postulacion_externa()).
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[{"voluntario_id": "vol-1"}])
    postulaciones = make_query(data=[{"id": "post-1", "numero_intento": 2}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch.object(
            voluntario_service, "crear_postulacion",
            new=AsyncMock(),
        ) as crear_mock,
    ):
        resultado = asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    crear_mock.assert_not_called()
    assert resultado == {
        "postulacion_id": "post-1",
        "voluntario_id": "vol-1",
        "numero_intento": 2,
        "estado": "pendiente",
    }


# ─── asegurar_perfil_voluntario_interno() ─────────────────────────────────

def test_asegurar_perfil_voluntario_interno_ya_tiene_pendiente_lanza_409(make_query):
    voluntarios = make_query(data=[{"id": "vol-1", "estado": "postulacion_pendiente"}])
    postulaciones = make_query(data=[{"id": "post-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "postulaciones": postulaciones,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        pytest.raises(Exception) as error,
    ):
        asyncio.run(
            voluntario_service.asegurar_perfil_voluntario_interno("user-1")
        )

    assert getattr(error.value, "status_code", None) == 409
    assert "pendiente" in getattr(error.value, "detail", "").lower()


# ─── obtener_mi_voluntario() ───────────────────────────────────────────────
# voluntarios.estado se marca 'postulacion_pendiente' desde el paso 1 de
# postular, antes de que exista una fila real en `postulaciones` — si el
# usuario abandona el formulario de capacidades, ese estado queda pegado sin
# ninguna postulación real detrás. La función debe tratar ese caso como si no
# tuviera perfil todavía (tiene_perfil_voluntario: false), sin tocar la fila
# real en `voluntarios`.

def test_obtener_mi_voluntario_pendiente_sin_postulacion_real_regresa_sin_perfil(make_query):
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": None,
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[])  # nunca se creó ninguna
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado == {"tiene_perfil_voluntario": False}


def test_obtener_mi_voluntario_pendiente_con_postulacion_real_regresa_datos(make_query):
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": "aso-1",
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[{
        "id": "post-1", "tipo": "interno", "estado": "pendiente", "motivo_rechazo": None,
        "numero_intento": 1, "asociacion_id": "aso-1", "asociaciones": {"nombre": "Rescate Toluca"},
    }])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado["tiene_perfil_voluntario"] is True
    assert resultado["estado"] == "postulacion_pendiente"
    assert resultado["ultima_postulacion"]["estado"] == "pendiente"
    assert resultado["ultima_postulacion"]["asociacion_nombre"] == "Rescate Toluca"


def test_obtener_mi_voluntario_reintento_abandonado_regresa_sin_perfil(make_query):
    # Postuló, fue rechazado, volvió a postular (voluntarios.estado regresa a
    # 'postulacion_pendiente') y abandonó el formulario de capacidades otra
    # vez — la postulación más reciente sigue siendo la vieja 'rechazada',
    # nunca se creó una nueva fila 'pendiente'.
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": None,
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[{
        "id": "post-1", "tipo": "interno", "estado": "rechazada",
        "motivo_rechazo": "No cumple los requisitos", "numero_intento": 1,
        "asociacion_id": "aso-1", "asociaciones": {"nombre": "Rescate Toluca"},
    }])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado == {"tiene_perfil_voluntario": False}
