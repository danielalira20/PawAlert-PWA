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
# GET /reputacion/me* usa DOS clientes distintos del lado real, y los
# mocks tienen que respetar esa separación o dejan de ser una prueba de
# verdad (bug real detectado en producción: ver comentario al inicio de
# reputacion.py):
# - `supabase` (key anon) SOLO para _obtener_usuario_autenticado
#   (auth.get_user + tabla usuarios, sin RLS restrictivo ahí).
# - `supabase_admin` (service_role) para movimientos_puntos/insignias --
#   esas tablas tienen RLS + REVOKE ALL FROM anon/authenticated (0046/
#   0047), así que `supabase` SIEMPRE recibiría "permission denied" en
#   producción real. Un mock que no distinga los dos clientes no puede
#   atrapar ese bug -- por eso las pruebas de /me/historial y
#   /me/insignias mockean cada cliente por separado.
# - reputacion_service.consultar_saldo_desglosado/consultar_restricciones
#   se mockean directo como funciones (no vía RPC) porque GET /me no
#   necesita ejercitar la capa de reputacion_service.py otra vez -- eso
#   ya lo cubre test_reputacion_service.py.

def _supabase_con_tablas(tablas: dict) -> MagicMock:
    """Mock del cliente `supabase` (anon) -- solo usuarios/auth."""
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    supabase.auth.get_user.return_value = SimpleNamespace(user=SimpleNamespace(id="auth-user-1"))
    return supabase


def _supabase_admin_con_tablas(tablas: dict) -> MagicMock:
    """Mock del cliente `supabase_admin` (service_role) -- movimientos_puntos/insignias."""
    supabase_admin = MagicMock()
    supabase_admin.table.side_effect = lambda nombre: tablas[nombre]
    return supabase_admin


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
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"movimientos_puntos": make_query(data=movimientos)}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/historial", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == movimientos
    tabla = tablas_admin["movimientos_puntos"]
    tabla.eq.assert_any_call("usuario_id", "user-1")
    tabla.eq.assert_any_call("rol", "reportante")
    tabla.order.assert_called_once_with("creado_at", desc=True)
    tabla.limit.assert_called_once_with(50)


def test_historial_rol_no_aplicable_403_sin_tocar_movimientos_puntos(make_query):
    """Usuario reportante puro (rol_principal=None) pidiendo el historial
    de 'voluntario_interno' -- ese rol no aplica a su cuenta, debe
    rechazarse ANTES de tocar la tabla movimientos_puntos."""
    mov_query = make_query(data=[])
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"movimientos_puntos": mov_query}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/historial", params={"rol": "voluntario_interno"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    mov_query.select.assert_not_called()
    llamadas_tabla_admin = [llamada.args[0] for llamada in supabase_admin.table.call_args_list]
    assert "movimientos_puntos" not in llamadas_tabla_admin


def test_historial_limit_nunca_supera_200(make_query):
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"movimientos_puntos": make_query(data=[])}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/historial",
            params={"rol": "reportante", "limit": 9999},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    tablas_admin["movimientos_puntos"].limit.assert_called_once_with(200)


# ─── Regresión: movimientos_puntos/insignias DEBEN usar supabase_admin ──
#
# Bug real detectado en producción local (no en tests viejos, porque los
# mocks de entonces no distinguían RLS real): get_mi_historial_puntos y
# get_mis_insignias usaban `supabase` (key anon) para leer
# movimientos_puntos/insignias -- tablas con RLS habilitado + REVOKE ALL
# FROM anon, authenticated (0046/0047_gamificacion_ajustes.sql), así que
# el cliente anon SIEMPRE recibe "permission denied" ahí sin importar el
# token. Estas pruebas dejan `supabase` (anon) SIN esa tabla configurada
# a propósito -- si alguien revierte el fix y vuelve a escribir
# `supabase.table("movimientos_puntos"/"insignias")`, el lookup revienta
# con KeyError (mock sin configurar), no pasa en silencio.

def test_historial_usa_supabase_admin_no_supabase_para_movimientos_puntos(make_query):
    movimientos = [{
        "id": "mov-1", "rol": "reportante", "tipo_movimiento": "otorgado",
        "puntos": 20, "regla": "reporte_valido", "tipo_origen": "reporte",
        "creado_at": "2026-08-01T00:00:00+00:00",
    }]
    # `supabase` (anon) solo conoce "usuarios" -- si el endpoint pidiera
    # movimientos_puntos a ESTE cliente, KeyError -> 500, la prueba falla.
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"movimientos_puntos": make_query(data=movimientos)}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/historial", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == movimientos
    tablas_admin["movimientos_puntos"].select.assert_called_once()
    llamadas_supabase_anon = [llamada.args[0] for llamada in supabase.table.call_args_list]
    assert "movimientos_puntos" not in llamadas_supabase_anon


def test_insignias_usa_supabase_admin_no_supabase_para_insignias(make_query):
    insignias = [{
        "id": "ins-1", "rol": "reportante", "codigo_insignia": "vigia_comunitario",
        "nivel": "cobre", "progreso": 1,
        "obtenido_at": "2026-08-01T00:00:00+00:00", "mejorado_at": None,
    }]
    # `supabase` (anon) solo conoce "usuarios" -- si el endpoint pidiera
    # insignias a ESTE cliente, KeyError -> 500, la prueba falla.
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"insignias": make_query(data=insignias)}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/insignias", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == insignias
    tablas_admin["insignias"].select.assert_called_once()
    llamadas_supabase_anon = [llamada.args[0] for llamada in supabase.table.call_args_list]
    assert "insignias" not in llamadas_supabase_anon


# ─── GET /reputacion/me/insignias ────────────────────────────────────────

def test_insignias_filtra_usuario_y_rol(make_query):
    insignias = [{
        "id": "ins-1", "rol": "reportante", "codigo_insignia": "vigia_comunitario",
        "nivel": "cobre", "progreso": 1,
        "obtenido_at": "2026-08-01T00:00:00+00:00", "mejorado_at": None,
    }]
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"insignias": make_query(data=insignias)}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/insignias", params={"rol": "reportante"}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == insignias
    tabla = tablas_admin["insignias"]
    tabla.eq.assert_any_call("usuario_id", "user-1")
    tabla.eq.assert_any_call("rol", "reportante")


# ─── GET /reputacion/me/notificaciones ──────────────────────────────────

def test_notificaciones_filtra_usuario_orden_y_limit(make_query):
    notificaciones = [{
        "id": "notif-1", "tipo": "bono_bienvenida",
        "mensaje": "¡Bienvenido a PawAlert! Ganaste 30 puntos por tu primer reporte.",
        "tipo_origen": "reporte", "evento_origen_id": "rep-1",
        "leida": False, "created_at": "2026-08-01T00:00:00+00:00",
    }]
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"notificaciones_reputacion": make_query(data=notificaciones)}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get("/reputacion/me/notificaciones", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == notificaciones
    tabla = tablas_admin["notificaciones_reputacion"]
    tabla.eq.assert_called_once_with("usuario_id", "user-1")
    tabla.order.assert_called_once_with("created_at", desc=True)
    tabla.limit.assert_called_once_with(50)


def test_notificaciones_limit_nunca_supera_200(make_query):
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"notificaciones_reputacion": make_query(data=[])}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.get(
            "/reputacion/me/notificaciones", params={"limit": 9999}, headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    tablas_admin["notificaciones_reputacion"].limit.assert_called_once_with(200)


# ─── PATCH /reputacion/me/notificaciones/{id}/leer ──────────────────────

def test_marcar_notificacion_leida_actualiza_leida_true(make_query):
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {
        "notificaciones_reputacion": make_query(data=[{"id": "notif-1", "leida": True}]),
    }
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.patch(
            "/reputacion/me/notificaciones/notif-1/leer", headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    tabla = tablas_admin["notificaciones_reputacion"]
    actualizado = tabla.update.call_args[0][0]
    assert actualizado["leida"] is True
    tabla.eq.assert_any_call("id", "notif-1")
    tabla.eq.assert_any_call("usuario_id", "user-1")


def test_marcar_notificacion_leida_404_si_no_es_del_usuario(make_query):
    """update.data vacío -- ya sea porque el id no existe, o porque
    existe pero es de OTRO usuario (el .eq("usuario_id", ...) del router
    nunca deja que un usuario marque como leída la notificación de
    alguien más)."""
    tablas_auth = {"usuarios": make_query(data=[_usuario_fila(None)])}
    tablas_admin = {"notificaciones_reputacion": make_query(data=[])}
    supabase = _supabase_con_tablas(tablas_auth)
    supabase_admin = _supabase_admin_con_tablas(tablas_admin)

    with patch.object(reputacion_api, "supabase", supabase), \
         patch.object(reputacion_api, "supabase_admin", supabase_admin):
        response = client.patch(
            "/reputacion/me/notificaciones/notif-ajena/leer", headers=AUTH_HEADERS,
        )

    assert response.status_code == 404
