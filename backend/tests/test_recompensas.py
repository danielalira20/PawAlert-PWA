from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import recompensas as recompensas_api
from app.services import recompensas_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}

RECOMPENSA_BODY = {
    "tipo": "descuento",
    "categoria": "Alimento para mascotas",
    "subcategoria": None,
    "nombre": "20% en tienda",
    "descripcion": "Descuento en cualquier producto de la tienda.",
    "nivel": "mediana",
    "unidades_totales": 10,
    "inicio": "2026-09-01",
    "vencimiento": "2026-10-11",  # 40 días — dentro de 30-90
    "sucursal_lugar": "Sucursal Centro",
    "horario": "L-V 9-18h",
    "forma_entrega": "Presentar QR en sucursal",
    "condiciones": None,
    "inventario_separado_confirmado": True,
}


def _mock_usuario_autenticado(tablas: dict, make_query) -> None:
    tablas["usuarios"] = make_query(data=[{"id": "user-1"}])


def _patch_supabase(supabase):
    return (
        patch.object(recompensas_api, "supabase", supabase),
        patch.object(recompensas_service, "supabase", supabase),
    )


def _supabase_con_tablas(tablas: dict) -> MagicMock:
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    return supabase


# ─── Elegibilidad ─────────────────────────────────────────────────────────

def test_crear_recompensa_donante_comunitario_rechazado(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1", "tipo": "donante_comunitario", "verificado_admin": True}]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)

    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.post("/recompensas", json=RECOMPENSA_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 403
    assert "aliados locales" in response.json()["detail"].lower() or "patrocinadores" in response.json()["detail"].lower()


def test_crear_recompensa_perfil_no_verificado_rechazado(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1", "tipo": "aliado_local", "verificado_admin": False}]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)

    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.post("/recompensas", json=RECOMPENSA_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 403
    assert "no está verificado" in response.json()["detail"].lower() or "todavía" in response.json()["detail"].lower()


# ─── El costo lo determina el backend ─────────────────────────────────────

def test_costo_lo_calcula_el_backend_segun_nivel(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1", "tipo": "aliado_local", "verificado_admin": True}]),
        "recompensas": make_query(data=[{**RECOMPENSA_BODY, "id": "rec-1", "propietario_id": "perfil-1", "costo": 250, "unidades_disponibles": 10, "estado": "borrador", "creado_at": "2026-08-01T00:00:00+00:00"}]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)

    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.post("/recompensas", json=RECOMPENSA_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 201
    insertado = tablas["recompensas"].insert.call_args[0][0]
    # nivel 'mediana' -> 250 puntos, sin importar que el body nunca mande "costo".
    assert insertado["costo"] == 250
    assert "costo" not in RECOMPENSA_BODY  # el formulario nunca puede mandarlo


# ─── Vigencia inválida ─────────────────────────────────────────────────────

def test_vigencia_menor_a_30_dias_rechazada():
    body = {**RECOMPENSA_BODY, "inicio": "2026-09-01", "vencimiento": "2026-09-10"}  # 9 días
    response = client.post("/recompensas", json=body, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_vigencia_mayor_a_90_dias_rechazada():
    body = {**RECOMPENSA_BODY, "inicio": "2026-09-01", "vencimiento": "2027-01-15"}  # >90 días
    response = client.post("/recompensas", json=body, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_inventario_no_separado_rechazado():
    body = {**RECOMPENSA_BODY, "inventario_separado_confirmado": False}
    response = client.post("/recompensas", json=body, headers=AUTH_HEADERS)
    assert response.status_code == 422


# ─── Pausar no cancela códigos vigentes (no toca inventario) ──────────────

def test_pausar_no_modifica_unidades_disponibles(make_query):
    recompensa_completa = {**RECOMPENSA_BODY, "id": "rec-1", "propietario_id": "perfil-1", "costo": 250, "unidades_disponibles": 10, "creado_at": "2026-08-01T00:00:00+00:00"}
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1"}]),
        "recompensas": make_query(execute_results=[
            SimpleNamespace(data=[{**recompensa_completa, "estado": "activa"}]),  # select
            SimpleNamespace(data=[{**recompensa_completa, "estado": "pausada"}]),  # update
        ]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)

    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.patch("/recompensas/rec-1/estado", json={"accion": "pausar"}, headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json()["estado"] == "pausada"
    # La transición solo debe tocar 'estado' — nunca unidades_disponibles,
    # así "pausar" nunca cancela códigos/inventario ya vigente.
    cambios = tablas["recompensas"].update.call_args[0][0]
    assert list(cambios.keys()) == ["estado"]
    assert cambios["estado"] == "pausada"


# ─── No existe forma de eliminar una recompensa ───────────────────────────

def test_no_existe_endpoint_para_eliminar_recompensas():
    metodos_por_ruta = [
        (getattr(route, "path", ""), getattr(route, "methods", set()))
        for route in app.routes
        if getattr(route, "path", "").startswith("/recompensas")
    ]
    assert metodos_por_ruta, "se esperaban rutas registradas bajo /recompensas"
    assert not any("DELETE" in methods for _, methods in metodos_por_ruta)


# ─── Inventario cero cambia a agotada ──────────────────────────────────────

def test_descontar_unidad_hasta_cero_cambia_a_agotada(make_query):
    recompensa_query = make_query(execute_results=[
        SimpleNamespace(data=[{"id": "rec-1", "estado": "activa", "unidades_disponibles": 1}]),
        SimpleNamespace(data=[{"id": "rec-1", "estado": "agotada", "unidades_disponibles": 0}]),
    ])
    supabase = MagicMock()
    supabase.table.return_value = recompensa_query

    with patch.object(recompensas_service, "supabase", supabase):
        resultado = recompensas_service.descontar_unidad_recompensa("rec-1")

    assert resultado["estado"] == "agotada"
    cambios = recompensa_query.update.call_args[0][0]
    assert cambios["unidades_disponibles"] == 0
    assert cambios["estado"] == "agotada"


def test_descontar_unidad_sin_llegar_a_cero_mantiene_activa(make_query):
    recompensa_query = make_query(execute_results=[
        SimpleNamespace(data=[{"id": "rec-1", "estado": "activa", "unidades_disponibles": 3}]),
        SimpleNamespace(data=[{"id": "rec-1", "estado": "activa", "unidades_disponibles": 2}]),
    ])
    supabase = MagicMock()
    supabase.table.return_value = recompensa_query

    with patch.object(recompensas_service, "supabase", supabase):
        resultado = recompensas_service.descontar_unidad_recompensa("rec-1")

    assert resultado["estado"] == "activa"
    cambios = recompensa_query.update.call_args[0][0]
    assert cambios["unidades_disponibles"] == 2
    assert cambios["estado"] == "activa"
