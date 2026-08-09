from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import reputacion as reputacion_api
from app.services import reputacion_service
from app.main import app

client = TestClient(app)

AUTH_HEADERS = {"Authorization": "Bearer token-valido"}


# ─── Helpers ────────────────────────────────────────────────────────────
#
# GET /reputacion/me* usa dos fuentes distintas del lado del mock:
# - supabase.table("usuarios")... para _obtener_usuario_autenticado, y
#   supabase.table("movimientos_puntos"/"insignias")... para las subrutas
#   -- mismo patrón que _supabase_con_tablas en test_recompensas.py.
# - reputacion_service.consultar_saldo_desglosado/consultar_restricciones
#   se mockean directo como funciones (no vía RPC) porque GET /me no
#   necesita ejercitar la capa de reputacion_service.py otra vez -- eso
#   ya lo cubre test_reputacion_service.py.

def _supabase_con_tablas(tablas: dict) -> MagicMock:
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    return supabase


def _usuario_fila(rol_principal: str | None, usuario_id: str = "user-1") -> dict:
    return {"id": usuario_id, "roles": {"nombre": rol_principal} if rol_principal else None}


def _saldo(disponible: int, reservado: int, total: int) -> dict:
    return {"saldo_disponible": disponible, "saldo_reservado": reservado, "saldo_total": total}


# ─── GET /reputacion/me — auth ──────────────────────────────────────────

def test_me_sin_autorizacion_401():
    response = client.get("/reputacion/me")
    assert response.status_code == 401


# ─── GET /reputacion/me — roles aplicables ──────────────────────────────

def test_me_reportante_puro_trae_solo_rol_reportante(make_query):
    """rol_principal=None (cuenta sin postulación de voluntario) -- solo
    'reportante' aplica."""
    tablas = {"usuarios": make_query(data=[_usuario_fila(None)])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(return_value=_saldo(70, 30, 100))
    mock_restricciones = MagicMock(return_value={
        "requiere_revision_previa": False,
        "requiere_revision_administrativa_total": False,
        "maximo_reportes_activos_dia": None,
    })

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert [r["rol"] for r in data["roles"]] == ["reportante"]
    fila = data["roles"][0]
    assert fila["saldo_disponible"] == 70
    assert fila["saldo_reservado"] == 30
    assert fila["saldo_total"] == 100
    assert fila["restriccion_activa"] is False
    assert fila["mensaje_restriccion"] is None
    mock_saldo.assert_called_once_with("user-1", "reportante")
    mock_restricciones.assert_called_once_with("user-1", "reportante")


def test_me_rol_principal_no_voluntario_sigue_solo_reportante(make_query):
    """rol_principal='asociacion' -- distinto de voluntario_interno/externo,
    _roles_aplicables no agrega un segundo rol."""
    tablas = {"usuarios": make_query(data=[_usuario_fila("asociacion")])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(return_value=_saldo(0, 0, 0))
    mock_restricciones = MagicMock(return_value={})

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert [r["rol"] for r in response.json()["roles"]] == ["reportante"]


def test_me_voluntario_interno_trae_reportante_y_voluntario(make_query):
    tablas = {"usuarios": make_query(data=[_usuario_fila("voluntario_interno")])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(
        side_effect=lambda uid, rol: _saldo(10, 0, 10) if rol == "reportante" else _saldo(50, 20, 70)
    )
    mock_restricciones = MagicMock(return_value={})

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    assert response.status_code == 200
    data = response.json()
    assert [r["rol"] for r in data["roles"]] == ["reportante", "voluntario_interno"]
    assert data["roles"][0]["saldo_total"] == 10
    assert data["roles"][1]["saldo_total"] == 70
    assert mock_saldo.call_count == 2
    assert mock_restricciones.call_count == 2


# ─── GET /reputacion/me — mensaje_restriccion ───────────────────────────

def test_me_voluntario_bloqueado_nuevas_asignaciones_trae_mensaje(make_query):
    tablas = {"usuarios": make_query(data=[_usuario_fila("voluntario_externo")])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(return_value=_saldo(5, 0, 5))
    mock_restricciones = MagicMock(return_value={
        "suspension_operativa": False,
        "bloqueado_nuevas_asignaciones": True,
        "en_observacion": False,
    })

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    fila_voluntario = next(r for r in response.json()["roles"] if r["rol"] == "voluntario_externo")
    assert fila_voluntario["restriccion_activa"] is True
    assert fila_voluntario["mensaje_restriccion"] == (
        "No puedes recibir nuevas asignaciones por ahora. Puedes finalizar tus casos activos."
    )


def test_me_voluntario_sin_restriccion_mensaje_es_none(make_query):
    tablas = {"usuarios": make_query(data=[_usuario_fila("voluntario_externo")])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(return_value=_saldo(5, 0, 5))
    mock_restricciones = MagicMock(return_value={
        "suspension_operativa": False,
        "bloqueado_nuevas_asignaciones": False,
        "en_observacion": False,
    })

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    fila_voluntario = next(r for r in response.json()["roles"] if r["rol"] == "voluntario_externo")
    assert fila_voluntario["restriccion_activa"] is False
    assert fila_voluntario["mensaje_restriccion"] is None


# ─── GET /reputacion/me — el trust score NUNCA se expone ────────────────

def test_me_nunca_expone_puntaje_ni_estado_interno_del_trust_score(make_query):
    """Aunque consultar_restricciones incluya el puntaje crudo y el
    estado_interno en su dict de retorno (como en la vida real, viene de
    la tabla trust_score), el endpoint no debe filtrarlos jamás --
    SaldoRolResponse ni siquiera declara esos campos, así que el
    constructor explícito por campo (no **restricciones) los descarta
    antes de serializar."""
    assert "puntaje" not in reputacion_api.SaldoRolResponse.model_fields
    assert "estado_interno" not in reputacion_api.SaldoRolResponse.model_fields

    tablas = {"usuarios": make_query(data=[_usuario_fila("voluntario_interno")])}
    supabase = _supabase_con_tablas(tablas)

    mock_saldo = MagicMock(return_value=_saldo(5, 0, 5))
    mock_restricciones = MagicMock(return_value={
        "puntaje": 15,
        "estado_interno": "suspendido",
        "suspension_operativa": True,
        "bloqueado_nuevas_asignaciones": True,
        "en_observacion": False,
    })

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_service, "consultar_saldo_desglosado", mock_saldo), \
         patch.object(reputacion_service, "consultar_restricciones", mock_restricciones):
        response = client.get("/reputacion/me", headers=AUTH_HEADERS)

    assert response.status_code == 200
    cuerpo_crudo = response.text
    assert "puntaje" not in cuerpo_crudo
    assert "estado_interno" not in cuerpo_crudo
    assert "suspendido" not in cuerpo_crudo
    for fila in response.json()["roles"]:
        assert "puntaje" not in fila
        assert "estado_interno" not in fila


# ─── GET /reputacion/me/historial ────────────────────────────────────────

def test_historial_filtra_usuario_rol_orden_y_limit(make_query):
    movimientos = [{
        "id": "mov-1", "rol": "reportante", "tipo_movimiento": "otorgado",
        "puntos": 20, "regla": "reporte_valido", "tipo_origen": "reporte",
        "creado_at": "2026-08-01T00:00:00+00:00",
    }]
    tablas = {
        "usuarios": make_query(data=[_usuario_fila(None)]),
        "movimientos_puntos": make_query(data=movimientos),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reputacion_api, "supabase", supabase):
        response = client.get(
            "/reputacion/me/historial", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == movimientos
    tabla = tablas["movimientos_puntos"]
    tabla.eq.assert_any_call("usuario_id", "user-1")
    tabla.eq.assert_any_call("rol", "reportante")
    tabla.order.assert_called_once_with("creado_at", desc=True)
    tabla.limit.assert_called_once_with(50)


def test_historial_rol_no_aplicable_403_sin_tocar_movimientos_puntos(make_query):
    """Usuario reportante puro (rol_principal=None) pidiendo el historial
    de 'voluntario_interno' -- ese rol no aplica a su cuenta, debe
    rechazarse ANTES de tocar la tabla movimientos_puntos."""
    mov_query = make_query(data=[])
    tablas = {"usuarios": make_query(data=[_usuario_fila(None)]), "movimientos_puntos": mov_query}
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reputacion_api, "supabase", supabase):
        response = client.get(
            "/reputacion/me/historial", params={"rol": "voluntario_interno"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    mov_query.select.assert_not_called()
    llamadas_tabla = [llamada.args[0] for llamada in supabase.table.call_args_list]
    assert "movimientos_puntos" not in llamadas_tabla


def test_historial_limit_nunca_supera_200(make_query):
    tablas = {
        "usuarios": make_query(data=[_usuario_fila(None)]),
        "movimientos_puntos": make_query(data=[]),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reputacion_api, "supabase", supabase):
        response = client.get(
            "/reputacion/me/historial",
            params={"rol": "reportante", "limit": 9999},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    tablas["movimientos_puntos"].limit.assert_called_once_with(200)


# ─── GET /reputacion/me/insignias ────────────────────────────────────────

def test_insignias_filtra_usuario_y_rol(make_query):
    insignias = [{
        "id": "ins-1", "rol": "reportante", "codigo_insignia": "vigia_comunitario",
        "nivel": "cobre", "progreso": 1,
        "obtenido_at": "2026-08-01T00:00:00+00:00", "mejorado_at": None,
    }]
    tablas = {
        "usuarios": make_query(data=[_usuario_fila(None)]),
        "insignias": make_query(data=insignias),
    }
    supabase = _supabase_con_tablas(tablas)

    with patch.object(reputacion_api, "supabase", supabase):
        response = client.get(
            "/reputacion/me/insignias", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == insignias
    tabla = tablas["insignias"]
    tabla.eq.assert_any_call("usuario_id", "user-1")
    tabla.eq.assert_any_call("rol", "reportante")
