from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.api import incidentes
from app.main import app
from app.services import incidentes_service
from app.services.incidentes_service import (
    PermisoDenegadoError,
    IncidenteNoEncontradoError,
    IncidenteEnEstadoInvalidoError,
)

client = TestClient(app)


# ─── Helpers ────────────────────────────────────────────────────────────
#
# incidentes.py usa su PROPIO cliente `supabase` (solo para las 2
# funciones de auth locales) -- distinto del `incidentes_service.supabase`
# que usa la lógica de negocio. Para los tests de mapeo de excepciones no
# hace falta que la lógica real corra: se parchea directamente la función
# de incidentes_service que el endpoint invoca, así que
# incidentes_service.supabase nunca se toca en esos casos. Donde sí
# importa la autenticación (401/403 antes de llegar al service),
# se mockea incidentes.supabase.

def _supabase_auth(*, usuario_id="user-1", rol="admin", asociacion_id=None) -> MagicMock:
    supabase = MagicMock()
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-1"))
    tabla_usuarios = MagicMock()
    for metodo in ("select", "eq"):
        getattr(tabla_usuarios, metodo).return_value = tabla_usuarios
    tabla_usuarios.execute.return_value = SimpleNamespace(
        data=[{"id": usuario_id, "asociacion_id": asociacion_id, "roles": {"nombre": rol}}]
    )
    supabase.table.return_value = tabla_usuarios
    return supabase


BODY_REGISTRAR_VALIDO = {
    "usuario_id": "user-afectado",
    "rol": "reportante",
    "tipo_incidente": "info_incorrecta",
    "descripcion": "Descripción del incidente",
}


# ─── Autenticación / autorización ───────────────────────────────────────

def test_post_incidentes_sin_autorizacion_devuelve_401():
    response = client.post("/incidentes", json=BODY_REGISTRAR_VALIDO)
    assert response.status_code == 401


def test_post_incidentes_rol_no_autorizado_devuelve_403():
    """Un voluntario_interno no es admin ni asociacion/staff -- debe
    rechazarse antes de llegar a incidentes_service."""
    supabase = _supabase_auth(rol="voluntario_interno")

    with (
        patch.object(incidentes, "supabase", supabase),
        patch.object(incidentes_service, "registrar_incidente") as mock_registrar,
    ):
        response = client.post(
            "/incidentes",
            json=BODY_REGISTRAR_VALIDO,
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
    mock_registrar.assert_not_called()


# ─── Mapeo de excepciones del service a status code ─────────────────────

def _post_incidentes_con_excepcion(excepcion: Exception):
    supabase = _supabase_auth(rol="admin")
    with (
        patch.object(incidentes, "supabase", supabase),
        patch.object(incidentes_service, "registrar_incidente", side_effect=excepcion),
    ):
        return client.post(
            "/incidentes",
            json=BODY_REGISTRAR_VALIDO,
            headers={"Authorization": "Bearer token"},
        )


def test_permiso_denegado_error_mapea_a_403():
    response = _post_incidentes_con_excepcion(PermisoDenegadoError("sin permiso"))
    assert response.status_code == 403


def test_incidente_no_encontrado_error_mapea_a_404():
    response = _post_incidentes_con_excepcion(IncidenteNoEncontradoError("no existe"))
    assert response.status_code == 404


def test_incidente_en_estado_invalido_error_mapea_a_409():
    response = _post_incidentes_con_excepcion(IncidenteEnEstadoInvalidoError("estado incorrecto"))
    assert response.status_code == 409


def test_value_error_mapea_a_422():
    response = _post_incidentes_con_excepcion(ValueError("tipo no válido"))
    assert response.status_code == 422


def test_postgrest_apierror_p0004_mapea_a_403():
    """P0004 = la RPC detectó que el usuario involucrado intentó
    confirmar su propio incidente -- se coló hasta la RPC pese a la
    validación en Python (ej. condición de carrera)."""
    error = APIError({"code": "P0004", "message": "autoconfirmacion", "details": None, "hint": None})
    response = _post_incidentes_con_excepcion(error)
    assert response.status_code == 403


def test_postgrest_apierror_p0001_mapea_a_409():
    """P0001 = el incidente ya no está en un estado válido al momento
    exacto de la RPC (condición de carrera de confirmación doble)."""
    error = APIError({"code": "P0001", "message": "no disponible", "details": None, "hint": None})
    response = _post_incidentes_con_excepcion(error)
    assert response.status_code == 409


# ─── PATCH /incidentes/{id}/revertir ─────────────────────────────────────

def test_revertir_actor_no_admin_devuelve_403_sin_llegar_al_service():
    supabase = _supabase_auth(rol="asociacion")

    with (
        patch.object(incidentes, "supabase", supabase),
        patch.object(incidentes_service, "revertir_incidente") as mock_revertir,
    ):
        response = client.patch(
            "/incidentes/inc-1/revertir",
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 403
    mock_revertir.assert_not_called()
