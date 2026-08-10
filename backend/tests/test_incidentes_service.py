from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import incidentes_service
from app.services.incidentes_service import (
    PermisoDenegadoError,
    IncidenteNoEncontradoError,
    IncidenteEnEstadoInvalidoError,
)


# ─── Helpers ────────────────────────────────────────────────────────────
#
# incidentes_service solo usa un cliente propio (supabase_admin, alias
# `supabase` dentro del módulo) -- a diferencia de reputacion_service.py
# o admin.py, no llama a ningún otro service ni a un segundo cliente, así
# que mockear `incidentes_service.supabase` basta para aislar todo este
# archivo de la red real.

def _supabase(tablas: dict) -> MagicMock:
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    return supabase


# ─── registrar_incidente ────────────────────────────────────────────────

def test_registrar_incidente_asociacion_ajena_lanza_permiso_denegado(make_query):
    tablas = {
        "reportes": make_query(data=[{"asociacion_asignada_id": "aso-X"}]),
        "usuarios": make_query(data=[{"asociacion_id": "aso-Y"}]),  # el actor pertenece a OTRA asociación
    }
    with patch.object(incidentes_service, "supabase", _supabase(tablas)):
        with pytest.raises(PermisoDenegadoError):
            incidentes_service.registrar_incidente(
                usuario_id="user-afectado",
                rol="reportante",
                tipo_incidente="info_incorrecta",
                descripcion="Descripción del incidente",
                registrado_por="staff-aso-y",
                actor_tipo="asociacion",
                reporte_id="rep-1",
            )


def test_registrar_incidente_admin_puede_sobre_cualquier_reporte_incluso_sin_reporte_id(make_query):
    tablas = {
        "incidente_tipos_catalogo": make_query(data=[{"id": "cat-1"}]),
        "incidentes": make_query(data=[{"id": "inc-1", "estado": "pendiente"}]),
    }
    supabase = _supabase(tablas)
    with patch.object(incidentes_service, "supabase", supabase):
        resultado = incidentes_service.registrar_incidente(
            usuario_id="user-1",
            rol="reportante",
            tipo_incidente="abuso_grave",
            descripcion="Descripción del incidente",
            registrado_por="admin-1",
            actor_tipo="admin",
            reporte_id=None,
        )

    assert resultado["id"] == "inc-1"
    tablas["incidentes"].insert.assert_called_once()
    # reporte_id=None + actor_tipo="admin" no debe tocar ni "reportes" ni
    # "usuarios" -- _es_admin corta _validar_permiso_sobre_reporte antes.
    # (si el código sí las tocara, side_effect de _supabase ya habría
    # lanzado KeyError al buscar una tabla que no está en `tablas`; esta
    # aserción además deja explícito qué tablas se esperaban.)
    tablas_tocadas = {c.args[0] for c in supabase.table.call_args_list}
    assert tablas_tocadas == {"incidente_tipos_catalogo", "incidentes"}


def test_registrar_incidente_tipo_no_valido_para_rol_lanza_value_error(make_query):
    tablas = {"incidente_tipos_catalogo": make_query(data=[])}
    with patch.object(incidentes_service, "supabase", _supabase(tablas)):
        with pytest.raises(ValueError):
            incidentes_service.registrar_incidente(
                usuario_id="user-1",
                rol="reportante",
                tipo_incidente="no_existe",
                descripcion="Descripción del incidente",
                registrado_por="admin-1",
                actor_tipo="admin",
                reporte_id=None,
            )


# ─── confirmar_incidente ────────────────────────────────────────────────

def test_confirmar_incidente_usuario_afectado_no_puede_confirmar_propio(make_query):
    tablas = {
        "incidentes": make_query(data=[{
            "id": "inc-1", "estado": "pendiente", "usuario_id": "user-1", "reporte_id": None,
        }]),
    }
    supabase = _supabase(tablas)
    with patch.object(incidentes_service, "supabase", supabase):
        with pytest.raises(PermisoDenegadoError):
            incidentes_service.confirmar_incidente("inc-1", confirmado_por="user-1", actor_tipo="admin")

    # La validación es 100% en Python, antes de tocar la RPC.
    supabase.rpc.assert_not_called()


def test_confirmar_incidente_ya_confirmado_lanza_estado_invalido(make_query):
    tablas = {
        "incidentes": make_query(data=[{
            "id": "inc-1", "estado": "confirmado", "usuario_id": "user-1", "reporte_id": None,
        }]),
    }
    with patch.object(incidentes_service, "supabase", _supabase(tablas)):
        with pytest.raises(IncidenteEnEstadoInvalidoError):
            incidentes_service.confirmar_incidente("inc-1", confirmado_por="admin-1", actor_tipo="admin")


def test_confirmar_incidente_reporte_falso_admin_llama_rpc_con_incidente_correcto(make_query):
    """Camino feliz -- y el caso real que dispara
    reputacion_service.procesar_reporte_falso_confirmado:
    tipo_incidente='reporte_falso', rol='reportante', actor_tipo='admin'.
    Confirma que la RPC confirmar_incidente_atomico se llama con el
    incidente_id correcto y el confirmador correcto."""
    tablas = {
        "incidentes": make_query(data=[{
            "id": "inc-1", "estado": "pendiente", "usuario_id": "user-afectado",
            "rol": "reportante", "tipo_incidente": "reporte_falso", "reporte_id": "rep-1",
        }]),
    }
    supabase = _supabase(tablas)
    rpc_llamada = MagicMock()
    rpc_llamada.execute.return_value = SimpleNamespace(data={"id": "inc-1", "estado": "confirmado"})
    supabase.rpc.return_value = rpc_llamada

    with patch.object(incidentes_service, "supabase", supabase):
        resultado = incidentes_service.confirmar_incidente("inc-1", confirmado_por="admin-1", actor_tipo="admin")

    assert resultado == {"id": "inc-1", "estado": "confirmado"}
    supabase.rpc.assert_called_once_with("confirmar_incidente_atomico", {
        "p_incidente_id": "inc-1",
        "p_confirmado_por": "admin-1",
    })


def test_rechazar_incidente_inexistente_lanza_no_encontrado(make_query):
    tablas = {"incidentes": make_query(data=[])}
    with patch.object(incidentes_service, "supabase", _supabase(tablas)):
        with pytest.raises(IncidenteNoEncontradoError):
            incidentes_service.rechazar_incidente(
                "inc-inexistente", actor_id="admin-1", actor_tipo="admin", motivo="x",
            )


# ─── revertir_incidente ──────────────────────────────────────────────────

def test_revertir_incidente_actor_no_admin_lanza_permiso_denegado_sin_llamar_rpc():
    supabase = MagicMock()
    with patch.object(incidentes_service, "supabase", supabase):
        with pytest.raises(PermisoDenegadoError):
            incidentes_service.revertir_incidente("inc-1", admin_id="user-1", actor_tipo="asociacion")

    supabase.rpc.assert_not_called()
    supabase.table.assert_not_called()


# ─── obtener_tipos_incidente ─────────────────────────────────────────────

def test_obtener_tipos_incidente_filtra_por_rol(make_query):
    tabla = make_query(data=[{"clave": "abandono", "valor_reduccion": 15, "descripcion": "Abandono del caso"}])
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with patch.object(incidentes_service, "supabase", supabase):
        resultado = incidentes_service.obtener_tipos_incidente("voluntario_interno")

    assert resultado == [{"clave": "abandono", "valor_reduccion": 15, "descripcion": "Abandono del caso"}]
    tabla.eq.assert_any_call("rol", "voluntario_interno")
    tabla.eq.assert_any_call("activo", True)
