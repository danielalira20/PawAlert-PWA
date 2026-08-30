from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import events
from app.main import app
from app.services import event_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer event-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
EVENT_ID = "30000000-0000-0000-0000-000000000003"


def _user(role="asociacion", association_id=ASSOCIATION_ID):
    return {"id": USER_ID, "rol": role, "asociacion_id": association_id}


def _operation(state="borrador"):
    return {
        "id": EVENT_ID,
        "estado": state,
        "version_publica": 0,
        "updated_at": "2026-08-30T12:00:00+00:00",
        "event_id": "40000000-0000-0000-0000-000000000004",
        "reintento": False,
    }


def test_listado_publico_no_requiere_autenticacion_y_envia_filtros():
    result = {
        "items": [],
        "pagina": 2,
        "limite": 10,
        "total": 0,
        "tiene_mas": False,
    }
    with patch.object(
        event_service, "listar_eventos_publicos", return_value=result
    ) as list_events:
        response = client.get(
            "/events?tipo=vacunacion&municipio=Puebla&especie=perro"
            "&gratuito=true&desde=2026-09-01T00:00:00%2B00:00"
            "&hasta=2026-10-01T00:00:00%2B00:00&pagina=2&limite=10"
        )

    assert response.status_code == 200
    assert response.json() == result
    assert list_events.call_args.kwargs["tipo"] == "vacunacion"
    assert list_events.call_args.kwargs["municipio"] == "Puebla"
    assert list_events.call_args.kwargs["especie"] == "perro"
    assert list_events.call_args.kwargs["gratuito"] is True
    assert list_events.call_args.kwargs["pagina"] == 2


def test_listado_publico_rechaza_fechas_sin_zona_o_invertidas():
    assert client.get("/events?desde=2026-09-01T10:00:00").status_code == 422
    response = client.get(
        "/events?desde=2026-10-01T00:00:00%2B00:00"
        "&hasta=2026-09-01T00:00:00%2B00:00"
    )
    assert response.status_code == 422


def test_mapa_rechaza_limites_geograficos_invertidos():
    with patch.object(event_service, "listar_eventos_mapa") as map_events:
        response = client.get("/events/map?latitud_min=20&latitud_max=19")

    assert response.status_code == 422
    map_events.assert_not_called()


def test_asociacion_crea_borrador_con_su_contexto():
    with (
        patch.object(events, "_authenticated_user", return_value=_user()),
        patch.object(
            event_service, "crear_borrador", return_value=_operation()
        ) as create,
    ):
        response = client.post(
            "/associations/me/events",
            json={
                "datos": {"titulo": "Jornada de vacunación"},
                "idempotency_key": "event-create-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 201
    assert response.json()["estado"] == "borrador"
    assert create.call_args.args[:2] == (ASSOCIATION_ID, USER_ID)


def test_rol_ajeno_no_puede_administrar_eventos():
    with (
        patch.object(
            events,
            "_authenticated_user",
            return_value=_user("voluntario_externo", None),
        ),
        patch.object(event_service, "crear_borrador") as create,
    ):
        response = client.post(
            "/associations/me/events",
            json={"datos": {}, "idempotency_key": "event-create-002"},
            headers=AUTH,
        )

    assert response.status_code == 403
    create.assert_not_called()


def test_error_de_dominio_se_traduce_a_respuesta_http():
    with (
        patch.object(events, "_authenticated_user", return_value=_user()),
        patch.object(
            event_service,
            "publicar_evento",
            side_effect=event_service.EventServiceError(
                "evento_no_publicable"
            ),
        ),
    ):
        response = client.post(
            f"/associations/me/events/{EVENT_ID}/publish",
            json={"idempotency_key": "event-publish-001"},
            headers=AUTH,
        )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "El evento no puede publicarse desde su estado actual."
    }


def test_usuario_autenticado_guarda_evento_sin_reservar_cupo():
    result = {
        "id": "50000000-0000-0000-0000-000000000005",
        "evento_id": EVENT_ID,
        "guardado": True,
        "event_id": "40000000-0000-0000-0000-000000000004",
        "reintento": False,
    }
    with (
        patch.object(events, "_authenticated_user", return_value=_user()),
        patch.object(
            event_service, "guardar_evento", return_value=result
        ) as save,
    ):
        response = client.post(
            f"/events/{EVENT_ID}/save",
            json={"idempotency_key": "event-save-001"},
            headers=AUTH,
        )

    assert response.status_code == 201
    assert response.json()["guardado"] is True
    save.assert_called_once()
