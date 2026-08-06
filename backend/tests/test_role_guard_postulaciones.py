"""Guard de rol en las 4 rutas de postulación/registro que alimentan el
guard del LandingScreen: POST /voluntarios/postulaciones,
POST /voluntarios/externo/postular, POST /perfiles-apoyo/donante-comunitario
y POST /perfiles-apoyo/registro-directo.

Mismo patrón que test_associations.py: TestClient + mock manual de
supabase.auth.get_user y supabase.table(...) vía make_query — no se toca
ninguna base de datos real ni se genera ningún JWT.
"""
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

GUARD_DETAIL = "No tienes permiso para realizar esta acción"

# Roles que NO deben poder postularse como voluntario interno/externo —
# ya tienen una identidad asignada (voluntario, staff/asociación, o aliado).
ROLES_BLOQUEADOS_VOLUNTARIO = [
    "voluntario_interno",
    "voluntario_externo",
    "asociacion",
    "staff",
    "aliado_local",
    "patrocinador_institucional",
]

ROLES_PERMITIDOS_DONANTE = ["reportante", "voluntario_interno", "voluntario_externo", "staff"]

# Cualquier usuario con un rol_id real asignado no puede pasar por
# registro-directo — ese camino es exclusivo de rol_id NULL (ver auth.py).
ROLES_BLOQUEADOS_REGISTRO_DIRECTO = [
    "reportante",
    "voluntario_interno",
    "voluntario_externo",
    "asociacion",
    "staff",
]


def _mock_usuario(tablas: dict, make_query, rol: str | None) -> None:
    """Fila de `usuarios` que resuelve `_obtener_usuario_autenticado` con el
    rol dado. rol=None simula rol_id NULL (aliado_local/patrocinador_institucional
    antes de completar su perfil_apoyo, ver auth.py línea ~119)."""
    tablas["usuarios"] = make_query(data=[{
        "id": "user-1",
        "asociacion_id": None,
        "telefono": "5500000000",
        "roles": {"nombre": rol} if rol else None,
    }])


def _auth_mock(rol: str | None, tablas: dict, make_query) -> MagicMock:
    _mock_usuario(tablas, make_query, rol)
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    return supabase


# ---------------------------------------------------------------------------
# POST /voluntarios/postulaciones
# ---------------------------------------------------------------------------

def test_postularse_voluntario_interno_reportante_pasa_el_guard(make_query):
    tablas = {
        "voluntarios": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "vol-1"}], count=None),
        ]),
    }
    supabase = _auth_mock("reportante", tablas, make_query)

    # asegurar_perfil_voluntario_interno vive en voluntario_service.py y usa
    # su propio `supabase` importado de app.db.supabase — hay que mockearlo
    # ahí también, o el guard pasaría pero la llamada real seguiría
    # golpeando la Supabase configurada en .env.
    with (
        patch("app.api.voluntarios.supabase", supabase),
        patch("app.services.voluntario_service.supabase", supabase),
    ):
        response = client.post(
            "/voluntarios/postulaciones",
            json={"tipo": "interno", "asociacion_id": "aso-1"},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 201
    assert response.json()["voluntario_id"] == "vol-1"


@pytest.mark.parametrize("rol", ROLES_BLOQUEADOS_VOLUNTARIO)
def test_postularse_voluntario_interno_bloquea_roles_no_reportante(rol, make_query):
    tablas: dict = {}
    supabase = _auth_mock(rol, tablas, make_query)

    with patch("app.api.voluntarios.supabase", supabase):
        response = client.post(
            "/voluntarios/postulaciones",
            json={"tipo": "interno", "asociacion_id": "aso-1"},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == GUARD_DETAIL


# ---------------------------------------------------------------------------
# POST /voluntarios/externo/postular
# ---------------------------------------------------------------------------

def test_postular_voluntario_externo_reportante_pasa_el_guard(make_query):
    tablas = {
        "voluntarios": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "vol-1"}], count=None),
        ]),
    }
    supabase = _auth_mock("reportante", tablas, make_query)

    # crear_perfil_externo/registrar_actualizacion_formulario_solicitada ya
    # tienen su propia suite (test_external_profile_service.py,
    # test_home_verification_service.py) — aquí solo nos interesa que el
    # guard deje pasar, no repetir esa lógica de negocio.
    with (
        patch("app.api.voluntarios.supabase", supabase),
        patch("app.api.voluntarios.crear_perfil_externo", return_value={"id": "perfil-1"}),
        patch("app.api.voluntarios.registrar_actualizacion_formulario_solicitada", return_value=None),
    ):
        response = client.post(
            "/voluntarios/externo/postular",
            data={"datos": "{}"},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 201
    assert response.json()["perfil_id"] == "perfil-1"


@pytest.mark.parametrize("rol", ROLES_BLOQUEADOS_VOLUNTARIO)
def test_postular_voluntario_externo_bloquea_roles_no_reportante(rol, make_query):
    tablas: dict = {}
    supabase = _auth_mock(rol, tablas, make_query)

    with patch("app.api.voluntarios.supabase", supabase):
        response = client.post(
            "/voluntarios/externo/postular",
            data={"datos": "{}"},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == GUARD_DETAIL


# ---------------------------------------------------------------------------
# POST /perfiles-apoyo/donante-comunitario
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("rol", ROLES_PERMITIDOS_DONANTE)
def test_donante_comunitario_permite_roles_esperados(rol, make_query):
    tablas = {
        "perfil_apoyo": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "perfil-1", "tipo": "donante_comunitario"}], count=None),
        ]),
    }
    supabase = _auth_mock(rol, tablas, make_query)

    with patch("app.api.perfiles_apoyo.supabase", supabase):
        response = client.post(
            "/perfiles-apoyo/donante-comunitario",
            json={"categorias": ["alimento"]},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 201
    assert response.json()["id"] == "perfil-1"


def test_donante_comunitario_bloquea_asociacion(make_query):
    tablas: dict = {}
    supabase = _auth_mock("asociacion", tablas, make_query)

    with patch("app.api.perfiles_apoyo.supabase", supabase):
        response = client.post(
            "/perfiles-apoyo/donante-comunitario",
            json={"categorias": ["alimento"]},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == GUARD_DETAIL


# ---------------------------------------------------------------------------
# POST /perfiles-apoyo/registro-directo
# ---------------------------------------------------------------------------

def test_registro_directo_permite_rol_none(make_query):
    tablas = {
        "perfil_apoyo": make_query(execute_results=[
            SimpleNamespace(data=[], count=None),
            SimpleNamespace(data=[{"id": "perfil-2", "tipo": "aliado_local"}], count=None),
        ]),
    }
    supabase = _auth_mock(None, tablas, make_query)
    payload = json.dumps({"tipo": "aliado_local", "categorias": ["veterinaria"]})

    with patch("app.api.perfiles_apoyo.supabase", supabase):
        response = client.post(
            "/perfiles-apoyo/registro-directo",
            data={"payload": payload},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 201
    assert response.json()["id"] == "perfil-2"


@pytest.mark.parametrize("rol", ROLES_BLOQUEADOS_REGISTRO_DIRECTO)
def test_registro_directo_bloquea_cualquier_rol_ya_asignado(rol, make_query):
    tablas: dict = {}
    supabase = _auth_mock(rol, tablas, make_query)
    payload = json.dumps({"tipo": "aliado_local", "categorias": ["veterinaria"]})

    with patch("app.api.perfiles_apoyo.supabase", supabase):
        response = client.post(
            "/perfiles-apoyo/registro-directo",
            data={"payload": payload},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == GUARD_DETAIL
