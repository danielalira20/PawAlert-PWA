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

RECOMPENSA_CATALOGO = {
    "id": "rec-publica-1",
    "propietario_id": "perfil-1",
    "tipo": "producto",
    "categoria": "alimentos",
    "subcategoria": "croquetas",
    "nombre": "Bolsa de croquetas",
    "descripcion": "Bolsa de alimento para mascota.",
    "nivel": "pequena",
    "costo": 100,
    "unidades_disponibles": 4,
    "inicio": "2026-08-01",
    "vencimiento": "2026-09-30",
    "sucursal_lugar": "Sucursal Centro",
    "horario": "L-V 9-18h",
    "forma_entrega": "Presentar QR",
    "condiciones": "Una por persona",
    "estado": "activa",
    "perfil_apoyo": {
        "id": "perfil-1",
        "tipo": "patrocinador_institucional",
        "verificado_admin": True,
        "preferencia_visibilidad": "mostrar mi nombre",
        "datos_extra": {"razon_social": "Patrocinador Ejemplo AC"},
        "usuarios": {"nombre": "Ana", "apellido_paterno": "Pérez"},
    },
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


# ─── Catálogo público para Persona 5 ─────────────────────────────────────

def test_catalogo_publico_no_requiere_autenticacion_y_devuelve_contrato(make_query):
    tablas = {"recompensas": make_query(data=[RECOMPENSA_CATALOGO])}
    supabase = _supabase_con_tablas(tablas)

    with patch.object(recompensas_service, "supabase", supabase):
        response = client.get("/recompensas/catalogo")

    assert response.status_code == 200
    assert supabase.auth.get_user.call_count == 0
    assert response.json() == [{
        "id": "rec-publica-1",
        "propietario_id": "perfil-1",
        "patrocinador_nombre": "Patrocinador Ejemplo AC",
        "patrocinador_tipo": "patrocinador_institucional",
        "tipo": "producto",
        "categoria": "alimentos",
        "subcategoria": "croquetas",
        "nombre": "Bolsa de croquetas",
        "descripcion": "Bolsa de alimento para mascota.",
        "nivel": "pequena",
        "costo": 100,
        "unidades_disponibles": 4,
        "inicio": "2026-08-01",
        "vencimiento": "2026-09-30",
        "sucursal_lugar": "Sucursal Centro",
        "horario": "L-V 9-18h",
        "forma_entrega": "Presentar QR",
        "condiciones": "Una por persona",
        "ubicacion_publica": {"lugar": "Sucursal Centro"},
        "estado": "activa",
    }]
    tablas["recompensas"].eq.assert_any_call("estado", "activa")
    tablas["recompensas"].gte.assert_any_call("unidades_disponibles", 1)
    tablas["recompensas"].eq.assert_any_call("perfil_apoyo.verificado_admin", True)


def test_catalogo_excluye_no_disponibles_aunque_la_bd_los_regrese(make_query):
    no_verificada = {
        **RECOMPENSA_CATALOGO,
        "id": "rec-no-verificada",
        "perfil_apoyo": {**RECOMPENSA_CATALOGO["perfil_apoyo"], "verificado_admin": False},
    }
    agotada = {**RECOMPENSA_CATALOGO, "id": "rec-agotada", "unidades_disponibles": 0}
    pausada = {**RECOMPENSA_CATALOGO, "id": "rec-pausada", "estado": "pausada"}
    donante = {
        **RECOMPENSA_CATALOGO,
        "id": "rec-donante",
        "perfil_apoyo": {**RECOMPENSA_CATALOGO["perfil_apoyo"], "tipo": "donante_comunitario"},
    }
    tablas = {"recompensas": make_query(data=[no_verificada, agotada, pausada, donante])}

    with patch.object(recompensas_service, "supabase", _supabase_con_tablas(tablas)):
        response = client.get("/recompensas/catalogo")

    assert response.status_code == 200
    assert response.json() == []


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


def test_asociacion_no_puede_crear_desde_panel_institucional(make_query):
    tablas = {
        "usuarios": make_query(data=[{
            "id": "user-1", "asociacion_id": "asoc-1", "roles": {"nombre": "asociacion"},
        }]),
    }
    supabase = _supabase_con_tablas(tablas)
    with patch.object(recompensas_api, "supabase", supabase):
        response = client.post("/recompensas", json=RECOMPENSA_BODY, headers=AUTH_HEADERS)
    assert response.status_code == 403
    assert "asociaciones" in response.json()["detail"].lower()


def test_categoria_no_declarada_es_rechazada(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{
            "id": "perfil-1", "tipo": "aliado_local", "verificado_admin": True,
            "categorias": ["insumos"], "datos_extra": {"subcategorias": []},
        }]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)
    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.post("/recompensas", json=RECOMPENSA_BODY, headers=AUTH_HEADERS)
    assert response.status_code == 422
    assert "no fue declarada" in response.json()["detail"].lower()


# ─── El costo lo determina el backend ─────────────────────────────────────

def test_costo_lo_calcula_el_backend_segun_nivel(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{
            "id": "perfil-1", "tipo": "aliado_local", "verificado_admin": True,
            "categorias": [RECOMPENSA_BODY["categoria"]], "datos_extra": {"subcategorias": []},
        }]),
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

def test_existe_endpoint_para_eliminar_solo_si_no_hay_canjes():
    metodos_por_ruta = [
        (getattr(route, "path", ""), getattr(route, "methods", set()))
        for route in app.routes
        if getattr(route, "path", "").startswith("/recompensas")
    ]
    assert metodos_por_ruta, "se esperaban rutas registradas bajo /recompensas"
    assert any("DELETE" in methods for _, methods in metodos_por_ruta)


def test_no_elimina_recompensa_con_canjes(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1"}]),
        "recompensas": make_query(data=[{"id": "rec-1", "propietario_id": "perfil-1", "estado": "borrador"}]),
        "canjes_recompensa": make_query(data=[{"id": "canje-1"}]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = _supabase_con_tablas(tablas)
    patches = _patch_supabase(supabase)
    with patches[0], patches[1]:
        response = client.delete("/recompensas/rec-1", headers=AUTH_HEADERS)
    assert response.status_code == 409
    tablas["recompensas"].delete.assert_not_called()


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
