import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import reports
from app.services import red_aliados_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}

CONTRIBUCION_MOCK = {
    "id": "contrib-1",
    "necesidad_id": None,
    "reporte_id": "rep-1",
    "oferta_proactiva_id": "oferta-1",
    "estado": "comprometida",
    "created_at": "2026-07-25T10:00:00+00:00",
}

RESPUESTA_ACEPTAR_MOCK = {
    "contribucion": CONTRIBUCION_MOCK,
    "contacto_aliado": {"nombre": "Clínica Vet Norte", "telefono": "5512345678", "email": "vet@norte.com"},
    "ubicacion_aliado": {
        "calle": "Av. Siempre Viva 123",
        "colonia": "Centro",
        "municipio": "Puebla",
        "referencia": "Frente al parque",
        "latitud": 19.04,
        "longitud": -98.19,
    },
}


def _rpc_side_effect(valores_reservar):
    """side_effect para supabase.rpc(...) que discrimina por nombre de RPC:
    reservar_capacidad_oferta consume `valores_reservar` en orden (una
    entrada por cada llamada a aceptar_sugerencia_veterinaria dentro del
    test); ubicacion_perfil_apoyo siempre regresa una fila fija."""
    valores = iter(valores_reservar)

    def rpc(nombre, params=None):
        if nombre == "reservar_capacidad_oferta":
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=next(valores)))
        if nombre == "ubicacion_perfil_apoyo":
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[{
                "latitud": 19.04,
                "longitud": -98.19,
                "calle": "Av. Test 123",
                "colonia": "Centro",
                "municipio": "Puebla",
                "referencia": None,
            }]))
        raise AssertionError(f"RPC inesperado: {nombre}")

    return rpc


# ─── Unit: reservar_capacidad_oferta ─────────────────────────────────────

def test_reservar_capacidad_oferta_exito():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=4)

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.reservar_capacidad_oferta("oferta-1", 1)

    assert resultado == 4
    supabase.rpc.assert_called_once_with(
        "reservar_capacidad_oferta", {"p_oferta_id": "oferta-1", "p_cantidad": 1}
    )


def test_reservar_capacidad_oferta_sin_capacidad():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=None)

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.reservar_capacidad_oferta("oferta-1", 1)

    assert resultado is None


# ─── Unit: aceptar_sugerencia_veterinaria ─────────────────────────────────

def test_aceptar_sugerencia_veterinaria_caso_feliz(make_query):
    tablas = {
        "ofertas_proactivas": make_query(data=[{
            "unidad": "citas",
            "subcategoria_id": "subcat-1",
            "perfil_apoyo": {"id": "perfil-1", "usuario_id": "user-aliado-1"},
        }]),
        "contribuciones": make_query(data=[CONTRIBUCION_MOCK]),
        "usuarios": make_query(data=[{
            "nombre": "Ana", "apellido_paterno": "Vet", "telefono": "5512345678", "email": "ana@vet.com",
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.side_effect = _rpc_side_effect([4])

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = asyncio.run(red_aliados_service.aceptar_sugerencia_veterinaria("rep-1", "oferta-1"))

    # El punto clave del ajuste del usuario: 'comprometida', no 'confirmada'
    # — la asociación confirma después que el servicio se usó, en un paso
    # que todavía no existe.
    assert resultado["contribucion"]["estado"] == "comprometida"
    assert resultado["contribucion"]["reporte_id"] == "rep-1"
    assert resultado["contribucion"]["oferta_proactiva_id"] == "oferta-1"
    assert resultado["contribucion"]["necesidad_id"] is None
    assert resultado["contacto_aliado"]["nombre"] == "Ana Vet"
    assert resultado["ubicacion_aliado"]["municipio"] == "Puebla"

    insertado = tablas["contribuciones"].insert.call_args[0][0]
    assert insertado["usuario_id"] == "user-aliado-1"  # el aliado, no el staff que acepta
    assert insertado["modo"] == "proactiva"
    assert insertado["estado"] == "comprometida"
    assert insertado["cantidad_valor"] == 1
    assert insertado["cantidad_unidad"] == "citas"
    assert insertado["subcategoria_id"] == "subcat-1"
    assert insertado["detalle"] == {"origen": "sugerencia_ruta1"}
    assert "confirmada_at" not in insertado  # explícitamente no se confirma en este paso


def test_aceptar_sugerencia_veterinaria_sin_capacidad(make_query):
    # Si el RPC dice que ya no alcanza, la función nunca debe llegar a
    # tocar `contribuciones` — ni intentar leer `ofertas_proactivas`.
    tablas = {"contribuciones": make_query(data=[])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=None)

    with patch.object(red_aliados_service, "supabase", supabase):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(red_aliados_service.aceptar_sugerencia_veterinaria("rep-1", "oferta-1"))

    assert exc_info.value.status_code == 409
    tablas["contribuciones"].insert.assert_not_called()


def test_aceptar_sugerencia_veterinaria_segunda_llamada_falla_limpio(make_query):
    # Simula la carrera: dos llamadas consecutivas sobre la misma oferta
    # con capacidad para solo una. La primera la consume (1 -> 0), la
    # segunda debe fallar limpio con 409 y NO crear una segunda
    # contribución ni dejar capacidad negativa.
    tablas = {
        "ofertas_proactivas": make_query(data=[{
            "unidad": "citas",
            "subcategoria_id": "subcat-1",
            "perfil_apoyo": {"id": "perfil-1", "usuario_id": "user-aliado-1"},
        }]),
        "contribuciones": make_query(data=[CONTRIBUCION_MOCK]),
        "usuarios": make_query(data=[{
            "nombre": "Ana", "apellido_paterno": "Vet", "telefono": "5512345678", "email": "ana@vet.com",
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    # primera llamada a reservar_capacidad_oferta: quedaba 1, se consume (0);
    # segunda llamada: ya no alcanza (None) — la ubicación del aliado se
    # consulta solo dentro de la primera, que sí llega a crear la contribución.
    supabase.rpc.side_effect = _rpc_side_effect([0, None])

    with patch.object(red_aliados_service, "supabase", supabase):
        primera = asyncio.run(red_aliados_service.aceptar_sugerencia_veterinaria("rep-1", "oferta-1"))
        assert primera["contribucion"]["estado"] == "comprometida"

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(red_aliados_service.aceptar_sugerencia_veterinaria("rep-1", "oferta-1"))
        assert exc_info.value.status_code == 409

    assert tablas["contribuciones"].insert.call_count == 1


# ─── Integración: POST /reports/{id}/hitos/aceptar-sugerencia ───────────

# `_obtener_usuario_autenticado` hace un `from app.db.supabase import
# supabase` LOCAL dentro de su propio cuerpo (reports.py), que sombrea el
# `supabase` a nivel de módulo — parchear `reports.supabase` no alcanza a
# afectar esa llamada. Mismo workaround que ya usa test_security.py:
# parchear el helper directamente.

def test_endpoint_aceptar_sugerencia_caso_feliz(make_query):
    tablas = {"reportes": make_query(data=[{"id": "rep-1", "staff_asignado_id": "staff-1"}])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "staff-1"}),
        patch.object(reports, "supabase", supabase),
        patch.object(
            red_aliados_service, "aceptar_sugerencia_veterinaria",
            new_callable=AsyncMock, return_value=RESPUESTA_ACEPTAR_MOCK,
        ) as aceptar,
    ):
        response = client.post(
            "/reports/rep-1/hitos/aceptar-sugerencia",
            json={"oferta_id": "oferta-1"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["contribucion"]["estado"] == "comprometida"
    assert body["contacto_aliado"]["nombre"] == "Clínica Vet Norte"
    assert body["ubicacion_aliado"]["municipio"] == "Puebla"
    aceptar.assert_awaited_once_with("rep-1", "oferta-1")


def test_endpoint_aceptar_sugerencia_403_staff_incorrecto(make_query):
    tablas = {"reportes": make_query(data=[{"id": "rep-1", "staff_asignado_id": "otro-staff"}])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "staff-1"}),
        patch.object(reports, "supabase", supabase),
    ):
        response = client.post(
            "/reports/rep-1/hitos/aceptar-sugerencia",
            json={"oferta_id": "oferta-1"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403


def test_endpoint_aceptar_sugerencia_409_sin_capacidad(make_query):
    tablas = {"reportes": make_query(data=[{"id": "rep-1", "staff_asignado_id": "staff-1"}])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "staff-1"}),
        patch.object(reports, "supabase", supabase),
        patch.object(
            red_aliados_service, "aceptar_sugerencia_veterinaria",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=409, detail="Ya no hay capacidad disponible en esta oferta — alguien más la tomó primero."),
        ),
    ):
        response = client.post(
            "/reports/rep-1/hitos/aceptar-sugerencia",
            json={"oferta_id": "oferta-1"},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 409
