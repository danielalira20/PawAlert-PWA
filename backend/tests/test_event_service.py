from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.models.event import EventUpdate
from app.services import event_service


EVENT_ID = "30000000-0000-0000-0000-000000000003"
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"


def _query(data=None, count=None):
    query = MagicMock()
    for method in (
        "select",
        "eq",
        "gt",
        "gte",
        "lte",
        "in_",
        "ilike",
        "contains",
        "order",
        "limit",
        "range",
    ):
        getattr(query, method).return_value = query
    query.execute.return_value = SimpleNamespace(data=data, count=count)
    return query


def test_actualizacion_rpc_no_inyecta_campos_omitidos():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data={
            "id": EVENT_ID,
            "estado": "borrador",
            "version_publica": 0,
            "updated_at": "2026-08-30T12:00:00+00:00",
            "event_id": "40000000-0000-0000-0000-000000000004",
            "reintento": False,
        }
    )
    body = EventUpdate(
        datos={"titulo": "Jornada actualizada"},
        idempotency_key="event-update-001",
    )
    with patch.object(
        event_service.supabase_admin, "rpc", return_value=rpc
    ) as call:
        event_service.actualizar_evento(
            EVENT_ID, ASSOCIATION_ID, USER_ID, body
        )

    assert call.call_args.args[1]["p_datos"] == {
        "titulo": "Jornada actualizada"
    }


def test_error_rpc_conocido_se_traduce_sin_exponer_backend():
    with patch.object(
        event_service.supabase_admin,
        "rpc",
        side_effect=RuntimeError("P0001 evento_no_publicable contexto SQL"),
    ):
        with pytest.raises(event_service.EventServiceError) as raised:
            event_service.publicar_evento(
                EVENT_ID,
                ASSOCIATION_ID,
                USER_ID,
                MagicMock(idempotency_key="event-publish-001"),
            )

    assert raised.value.status_code == 409
    assert "SQL" not in raised.value.detail


def test_listado_publico_aplica_visibilidad_filtros_y_paginacion():
    query = _query(data=[], count=31)
    admin = MagicMock()
    admin.table.return_value = query
    with patch.object(event_service, "supabase_admin", admin):
        result = event_service.listar_eventos_publicos(
            tipo="vacunacion",
            asociacion_id=ASSOCIATION_ID,
            municipio="Puebla",
            especie="perro",
            gratuito=True,
            desde=None,
            hasta=None,
            pagina=2,
            limite=20,
        )

    query.eq.assert_any_call("estado", "publicado")
    query.eq.assert_any_call("asociacion.activo", True)
    query.eq.assert_any_call("asociacion.verificado", True)
    query.eq.assert_any_call("tipo", "vacunacion")
    query.eq.assert_any_call("asociacion_id", ASSOCIATION_ID)
    query.eq.assert_any_call("es_gratuito", True)
    query.ilike.assert_called_once_with("municipio", "%Puebla%")
    query.contains.assert_called_once_with("especies_objetivo", ["perro"])
    query.range.assert_called_once_with(20, 39)
    assert result["total"] == 31
    assert result["tiene_mas"] is True


def test_consulta_publica_desconocida_devuelve_error_sanitizado():
    admin = MagicMock()
    admin.table.side_effect = RuntimeError("secret database connection")
    with patch.object(event_service, "supabase_admin", admin):
        with pytest.raises(event_service.EventServiceError) as raised:
            event_service.obtener_evento_publico(EVENT_ID)

    assert raised.value.status_code == 503
    assert "secret" not in raised.value.detail
