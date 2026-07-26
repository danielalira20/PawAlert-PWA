import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import red_aliados
from app.services import red_aliados_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}

OFERTA_RPC_ROW = {
    "oferta_id": "oferta-1",
    "perfil_apoyo_id": "perfil-1",
    "usuario_id": "user-aliado-1",
    "nombre": "Refugio Norte",
    "distancia_km": 4.5,
    "unidad": "kg",
    "capacidad_disponible": 20,
}

CONTRIBUCION_MOCK = {
    "id": "contrib-1",
    "necesidad_id": "necesidad-1",
    "reporte_id": None,
    "oferta_proactiva_id": "oferta-1",
    "estado": "comprometida",
    "created_at": "2026-07-25T10:00:00+00:00",
}


def _mock_usuario_autenticado(tablas, make_query, *, asociacion_id="asociacion-1"):
    tablas["usuarios"] = make_query(data=[{
        "id": "user-staff-1",
        "asociacion_id": asociacion_id,
        "roles": {"nombre": "staff"},
    }])


# ─── Unit: buscar_ofertas_compatibles ────────────────────────────────────

def test_buscar_ofertas_compatibles_con_resultados():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=[OFERTA_RPC_ROW])

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.buscar_ofertas_compatibles("necesidad-1")

    assert len(resultado) == 1
    assert resultado[0]["oferta_id"] == "oferta-1"
    assert resultado[0]["distancia_km"] == 4.5
    assert "nivel_urgencia" not in resultado[0]  # Ruta 2 no filtra por urgencia
    supabase.rpc.assert_called_once_with(
        "ofertas_compatibles_necesidad", {"p_necesidad_id": "necesidad-1"}
    )


def test_buscar_ofertas_compatibles_sin_resultados():
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=None)

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = red_aliados_service.buscar_ofertas_compatibles("necesidad-1")

    assert resultado == []


# NOTA: el filtro `n.subcategoria_id IS NULL OR o.subcategoria_id =
# n.subcategoria_id` vive dentro de la función SQL
# (migrations/0013_ofertas_compatibles_necesidad.sql) — la suite de pytest
# mockea el resultado del RPC, no ejecuta la función real contra Postgres,
# así que ese comportamiento (necesidad sin subcategoria_id -> solo
# filtra por categoría) no se puede verificar aquí. Queda documentado en
# el comentario de la propia migración; se debería probar manualmente o
# con una prueba de integración contra una base real si se agrega ese tipo
# de suite al proyecto.


# ─── Unit: aceptar_sugerencia_general ────────────────────────────────────

def _tablas_aceptar_general(make_query, **overrides):
    base = {
        "ofertas_proactivas": make_query(data=[{
            "unidad": "kg",
            "subcategoria_id": "subcat-1",
            "perfil_apoyo": {"usuario_id": "user-aliado-1"},
        }]),
        "necesidades": make_query(data=[{"asociacion_id": "asociacion-1"}]),
        "contribuciones": make_query(data=[CONTRIBUCION_MOCK]),
        "usuarios": make_query(data=[{
            "nombre": "Ana", "apellido_paterno": "Pérez",
            "telefono": "5511112222", "email": "ana@example.com",
        }]),
        "asociaciones": make_query(data=[{
            "nombre": "Refugio Norte",
            "contacto_telefono": "5533334444",
            "contacto_email": "refugio@example.com",
        }]),
        "perfil_apoyo": make_query(data=[{"id": "perfil-1"}]),
        "notificaciones_aliado": make_query(data=[{"id": "notif-1"}]),
    }
    base.update(overrides)
    return base


def test_aceptar_sugerencia_general_caso_feliz(make_query):
    tablas = _tablas_aceptar_general(make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=15)

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = asyncio.run(
            red_aliados_service.aceptar_sugerencia_general("necesidad-1", "oferta-1", 5)
        )

    assert resultado["contribucion"]["estado"] == "comprometida"
    assert resultado["contribucion"]["necesidad_id"] == "necesidad-1"
    assert resultado["contacto_aliado"] == {
        "nombre": "Ana Pérez", "telefono": "5511112222", "email": "ana@example.com",
    }
    assert resultado["contacto_asociacion"] == {
        "nombre": "Refugio Norte", "telefono": "5533334444", "email": "refugio@example.com",
    }

    insertado = tablas["contribuciones"].insert.call_args[0][0]
    assert insertado["cantidad_valor"] == 5  # cantidad variable, no fija como Ruta 1
    assert insertado["necesidad_id"] == "necesidad-1"
    assert insertado["estado"] == "comprometida"
    assert "confirmada_at" not in insertado

    tablas["notificaciones_aliado"].insert.assert_called_once()
    notificacion = tablas["notificaciones_aliado"].insert.call_args[0][0]
    assert notificacion["tipo"] == "oferta_aceptada"
    assert notificacion["necesidad_id"] == "necesidad-1"


def test_aceptar_sugerencia_general_sin_capacidad(make_query):
    tablas = _tablas_aceptar_general(make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=None)

    with patch.object(red_aliados_service, "supabase", supabase):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                red_aliados_service.aceptar_sugerencia_general("necesidad-1", "oferta-1", 999)
            )

    assert exc_info.value.status_code == 409
    # Mensaje distinto al de Ruta 1 ("alguien más la tomó primero") — aquí
    # la cantidad es variable, así que el 409 puede ser simplemente pedir
    # de más, no necesariamente una carrera con otra asociación.
    assert exc_info.value.detail == "La cantidad solicitada supera la capacidad disponible en esta oferta"
    tablas["contribuciones"].insert.assert_not_called()


def test_aceptar_sugerencia_general_notificacion_falla_no_bloquea(make_query):
    tablas = _tablas_aceptar_general(make_query)
    tablas["perfil_apoyo"].execute.side_effect = Exception("boom")
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.rpc.return_value.execute.return_value = SimpleNamespace(data=15)

    with patch.object(red_aliados_service, "supabase", supabase):
        resultado = asyncio.run(
            red_aliados_service.aceptar_sugerencia_general("necesidad-1", "oferta-1", 5)
        )

    # La aceptación ya se confirmó (contribución creada) — un fallo en la
    # notificación best-effort no debe tumbar la respuesta.
    assert resultado["contribucion"]["estado"] == "comprometida"


# ─── Integración: GET /red-aliados/necesidades/{id}/ofertas-compatibles ──

def test_endpoint_ofertas_compatibles_caso_feliz(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(
            red_aliados, "buscar_ofertas_compatibles",
            return_value=[{
                "oferta_id": "oferta-1", "perfil_apoyo_id": "perfil-1",
                "nombre": "Refugio Norte", "distancia_km": 4.5,
                "unidad": "kg", "capacidad_disponible": 20,
            }],
        ),
    ):
        response = client.get(
            "/red-aliados/necesidades/necesidad-1/ofertas-compatibles",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["oferta_id"] == "oferta-1"


# ─── Integración: POST /red-aliados/necesidades/{id}/aceptar-oferta ─────

def test_endpoint_aceptar_oferta_caso_feliz(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query, asociacion_id="asociacion-1")
    tablas["necesidades"] = make_query(data=[{"asociacion_id": "asociacion-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    respuesta_service = {
        "contribucion": CONTRIBUCION_MOCK,
        "contacto_aliado": {"nombre": "Ana Pérez", "telefono": "5511112222", "email": "ana@example.com"},
        "contacto_asociacion": {"nombre": "Refugio Norte", "telefono": "5533334444", "email": "refugio@example.com"},
    }

    with (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(
            red_aliados, "aceptar_sugerencia_general",
            new_callable=AsyncMock, return_value=respuesta_service,
        ),
    ):
        response = client.post(
            "/red-aliados/necesidades/necesidad-1/aceptar-oferta",
            json={"oferta_id": "oferta-1", "cantidad": 5},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["contribucion"]["estado"] == "comprometida"
    assert body["contacto_aliado"]["email"] == "ana@example.com"
    assert body["contacto_asociacion"]["email"] == "refugio@example.com"


def test_endpoint_aceptar_oferta_403_asociacion_no_dueña(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query, asociacion_id="asociacion-otra")
    tablas["necesidades"] = make_query(data=[{"asociacion_id": "asociacion-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(red_aliados, "supabase", supabase):
        response = client.post(
            "/red-aliados/necesidades/necesidad-1/aceptar-oferta",
            json={"oferta_id": "oferta-1", "cantidad": 5},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403


def test_endpoint_aceptar_oferta_404_necesidad_no_encontrada(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query)
    tablas["necesidades"] = make_query(data=[])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(red_aliados, "supabase", supabase):
        response = client.post(
            "/red-aliados/necesidades/necesidad-1/aceptar-oferta",
            json={"oferta_id": "oferta-1", "cantidad": 5},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 404


def test_endpoint_aceptar_oferta_409_excede_capacidad(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query, asociacion_id="asociacion-1")
    tablas["necesidades"] = make_query(data=[{"asociacion_id": "asociacion-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(
            red_aliados, "aceptar_sugerencia_general",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=409,
                detail="La cantidad solicitada supera la capacidad disponible en esta oferta",
            ),
        ),
    ):
        response = client.post(
            "/red-aliados/necesidades/necesidad-1/aceptar-oferta",
            json={"oferta_id": "oferta-1", "cantidad": 999},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "La cantidad solicitada supera la capacidad disponible en esta oferta"
