from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.api import red_aliados
from app.services import red_aliados_service, report_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}


def _mock_usuario_autenticado(tablas: dict, make_query, *, rol: str | None = None) -> None:
    tablas["usuarios"] = make_query(data=[{
        "id": "user-1",
        "asociacion_id": None,
        "roles": {"nombre": rol} if rol else None,
    }])


def _patch_supabase(supabase):
    """Los tres módulos que tocan supabase.table(...) en este flujo:
    el router (auth + GETs de catálogo), el service (inserts/validaciones)
    y report_service (obtener_id_catalogo, reusado tal cual)."""
    return (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(red_aliados_service, "supabase", supabase),
        patch.object(report_service, "supabase", supabase),
    )


CONTRIBUCION_BODY = {
    "necesidad_id": "necesidad-1",
    "categoria": "alimentos",
    "subcategoria_id": "subcat-1",
    "especies_aplica": ["perro"],
    "cantidad_valor": 10,
    "cantidad_unidad": "kg",
    "detalle": {"tipo": "croquetas"},
}

OFERTA_BODY = {
    "categoria": "insumos",
    "subcategoria_id": "subcat-2",
    "especies_aplica": ["gato"],
    "capacidad_declarada": 5,
    "unidad": "piezas",
    "detalle": {"nuevo_o_usado": "nuevo"},
}


# ─── GET /red-aliados/categorias ────────────────────────────────────────

def test_get_categorias_caso_feliz(make_query):
    tablas = {
        "categoria_recurso": make_query(data=[
            {"id": "cat-1", "clave": "alimentos", "descripcion": "Alimentos"},
            {"id": "cat-2", "clave": "insumos", "descripcion": "Insumos"},
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(red_aliados, "supabase", supabase):
        response = client.get("/red-aliados/categorias")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["clave"] == "alimentos"


# ─── GET /red-aliados/subcategorias/{categoria_clave} ───────────────────

def test_get_subcategorias_caso_feliz(make_query):
    tablas = {
        "categoria_recurso": make_query(data=[{"id": "cat-1"}]),
        "subcategoria_recurso": make_query(data=[
            {
                "id": "subcat-1",
                "clave": "croquetas",
                "descripcion": "Croquetas",
                "especies_aplicables": ["perro", "gato"],
                "requiere_tamanio": False,
            },
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(report_service, "supabase", supabase),
    ):
        response = client.get("/red-aliados/subcategorias/alimentos")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["clave"] == "croquetas"
    assert body[0]["especies_aplicables"] == ["perro", "gato"]
    assert body[0]["requiere_tamanio"] is False


# ─── POST /red-aliados/foto ──────────────────────────────────────────────

def test_subir_foto_caso_feliz(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    with (
        patch.object(red_aliados, "supabase", supabase),
        patch.object(red_aliados, "subir_foto", new_callable=AsyncMock, return_value="https://x/recursos-aliados/foto.jpg") as subir,
    ):
        response = client.post(
            "/red-aliados/foto",
            files={"foto": ("foto.jpg", b"contenido-falso", "image/jpeg")},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == {"foto_url": "https://x/recursos-aliados/foto.jpg"}
    assert subir.call_args.kwargs["carpeta"] == "recursos-aliados"


# ─── POST /red-aliados/contribuciones ────────────────────────────────────

def test_crear_contribucion_caso_feliz(make_query):
    tablas = {
        "necesidades": make_query(data=[{"id": "necesidad-1", "estado": "activa"}]),
        "categoria_recurso": make_query(data=[{"id": "cat-1"}]),
        "subcategoria_recurso": make_query(data=[{"id": "subcat-1", "categoria_id": "cat-1"}]),
        "contribuciones": make_query(data=[{
            "id": "contrib-1",
            "necesidad_id": "necesidad-1",
            "estado": "comprometida",
            "created_at": "2026-07-24T10:00:00+00:00",
        }]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    patches = _patch_supabase(supabase)
    with patches[0], patches[1], patches[2]:
        response = client.post("/red-aliados/contribuciones", json=CONTRIBUCION_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "contrib-1"
    assert body["estado"] == "comprometida"

    insertado = tablas["contribuciones"].insert.call_args[0][0]
    assert insertado["modo"] == "reactiva"
    assert insertado["subcategoria_id"] == "subcat-1"
    assert insertado["detalle"]["categoria"] == "alimentos"


# ─── POST /red-aliados/ofertas-proactivas ────────────────────────────────

def test_crear_oferta_proactiva_caso_feliz(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"id": "perfil-1", "tipo": "aliado_local"}]),
        "categoria_recurso": make_query(data=[{"id": "cat-2"}]),
        "subcategoria_recurso": make_query(data=[{"id": "subcat-2", "categoria_id": "cat-2"}]),
        "ofertas_proactivas": make_query(data=[{
            "id": "oferta-1",
            "categoria": "insumos",
            "capacidad_declarada": 5,
            "capacidad_disponible": 5,
            "unidad": "piezas",
            "activa": True,
            "created_at": "2026-07-24T10:00:00+00:00",
        }]),
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    patches = _patch_supabase(supabase)
    with patches[0], patches[1], patches[2]:
        response = client.post("/red-aliados/ofertas-proactivas", json=OFERTA_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "oferta-1"
    assert body["capacidad_disponible"] == 5

    insertado = tablas["ofertas_proactivas"].insert.call_args[0][0]
    assert insertado["perfil_apoyo_id"] == "perfil-1"
    assert insertado["capacidad_disponible"] == 5  # arranca igual a la declarada, nada reservado aún


# ─── model_validator: difusión sin contacto_responsable ──────────────────

def test_contribucion_difusion_sin_contacto_responsable_rechazada(make_query):
    tablas = {}
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    body = {
        **CONTRIBUCION_BODY,
        "categoria": "difusion_campanas",
        "subcategoria_id": "subcat-3",
        "detalle": {"tipo_apoyo": "publicidad"},  # sin contacto_responsable
    }

    with patch.object(red_aliados, "supabase", supabase):
        response = client.post("/red-aliados/contribuciones", json=body, headers=AUTH_HEADERS)

    assert response.status_code == 422
    assert "contacto responsable" in response.text.lower()


# ─── subcategoria_id inválido (no existe en la tabla) ─────────────────────

def test_crear_contribucion_subcategoria_inexistente(make_query):
    tablas = {
        "necesidades": make_query(data=[{"id": "necesidad-1", "estado": "activa"}]),
        "categoria_recurso": make_query(data=[{"id": "cat-1"}]),
        "subcategoria_recurso": make_query(data=[]),  # no existe / no está activa
    }
    _mock_usuario_autenticado(tablas, make_query)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))

    patches = _patch_supabase(supabase)
    with patches[0], patches[1], patches[2]:
        response = client.post("/red-aliados/contribuciones", json=CONTRIBUCION_BODY, headers=AUTH_HEADERS)

    assert response.status_code == 422
    assert "subcategoría" in response.json()["detail"].lower()
