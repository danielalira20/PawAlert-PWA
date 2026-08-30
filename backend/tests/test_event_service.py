import asyncio
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import UploadFile
from PIL import Image

from app.models.event import EventUpdate
from app.services import event_service


EVENT_ID = "30000000-0000-0000-0000-000000000003"
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"


def _jpeg_simple() -> bytes:
    output = BytesIO()
    Image.new("RGB", (80, 60), "orange").save(output, format="JPEG")
    return output.getvalue()


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


def test_error_especifico_no_se_confunde_con_su_prefijo():
    with patch.object(
        event_service.supabase_admin,
        "rpc",
        side_effect=RuntimeError("evento_no_encontrado_asociacion"),
    ):
        with pytest.raises(event_service.EventServiceError) as raised:
            event_service.publicar_evento(
                EVENT_ID,
                ASSOCIATION_ID,
                USER_ID,
                MagicMock(idempotency_key="event-publish-002"),
            )

    assert raised.value.code == "evento_no_encontrado_asociacion"


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


def test_subida_reemplaza_imagen_firma_url_y_limpia_anterior():
    old_path = f"eventos/{EVENT_ID}/anterior.jpg"
    new_path = f"eventos/{EVENT_ID}/nueva.jpg"
    rpc_result = {
        "id": EVENT_ID,
        "estado": "borrador",
        "version_publica": 0,
        "updated_at": "2026-08-30T12:00:00+00:00",
        "event_id": "40000000-0000-0000-0000-000000000004",
        "storage_path": new_path,
        "previous_storage_path": old_path,
        "mime_type": "image/jpeg",
        "size_bytes": 100,
        "texto_alternativo": "Jornada comunitaria",
        "reintento": False,
    }
    image = UploadFile(file=BytesIO(_jpeg_simple()), filename="evento.jpg")
    with (
        patch.object(
            event_service,
            "_obtener_evento_asociacion",
            return_value={"id": EVENT_ID, "estado": "borrador"},
        ),
        patch.object(
            event_service,
            "subir_bytes_evento",
            new=AsyncMock(return_value=new_path),
        ),
        patch.object(event_service, "_rpc", return_value=rpc_result) as rpc,
        patch.object(
            event_service,
            "crear_url_firmada_evento",
            return_value={
                "url": "https://signed.test/event",
                "expira_at": "2026-08-30T18:00:00+00:00",
            },
        ),
        patch.object(
            event_service, "eliminar_objeto_evento", return_value=True
        ) as remove,
    ):
        result = asyncio.run(
            event_service.subir_imagen_evento(
                EVENT_ID,
                ASSOCIATION_ID,
                USER_ID,
                image,
                alternative_text="  Jornada comunitaria  ",
                idempotency_key="event-image-001",
            )
        )

    assert result["imagen_url"] == "https://signed.test/event"
    assert result["imagen_mime_type"] == "image/jpeg"
    assert "storage_path" not in str(result)
    remove.assert_called_once_with(old_path)
    params = rpc.call_args.args[1]
    assert params["p_storage_path"] == new_path
    assert params["p_texto_alternativo"] == "Jornada comunitaria"


def test_error_de_dominio_limpia_imagen_recien_subida():
    new_path = f"eventos/{EVENT_ID}/nueva.jpg"
    image = UploadFile(file=BytesIO(_jpeg_simple()), filename="evento.jpg")
    with (
        patch.object(
            event_service,
            "_obtener_evento_asociacion",
            return_value={"id": EVENT_ID, "estado": "borrador"},
        ),
        patch.object(
            event_service,
            "subir_bytes_evento",
            new=AsyncMock(return_value=new_path),
        ),
        patch.object(
            event_service,
            "_rpc",
            side_effect=event_service.EventServiceError("evento_no_editable"),
        ),
        patch.object(
            event_service, "eliminar_objeto_evento", return_value=True
        ) as remove,
    ):
        with pytest.raises(event_service.EventServiceError):
            asyncio.run(
                event_service.subir_imagen_evento(
                    EVENT_ID,
                    ASSOCIATION_ID,
                    USER_ID,
                    image,
                    alternative_text="Jornada comunitaria",
                    idempotency_key="event-image-002",
                )
            )

    remove.assert_called_once_with(new_path)


def test_error_incierto_de_rpc_conserva_imagen_por_posible_commit():
    new_path = f"eventos/{EVENT_ID}/nueva.jpg"
    image = UploadFile(file=BytesIO(_jpeg_simple()), filename="evento.jpg")
    with (
        patch.object(
            event_service,
            "_obtener_evento_asociacion",
            return_value={"id": EVENT_ID, "estado": "borrador"},
        ),
        patch.object(
            event_service,
            "subir_bytes_evento",
            new=AsyncMock(return_value=new_path),
        ),
        patch.object(
            event_service,
            "_rpc",
            side_effect=event_service.EventServiceError(
                "evento_operacion_no_disponible"
            ),
        ),
        patch.object(event_service, "eliminar_objeto_evento") as remove,
    ):
        with pytest.raises(event_service.EventServiceError):
            asyncio.run(
                event_service.subir_imagen_evento(
                    EVENT_ID,
                    ASSOCIATION_ID,
                    USER_ID,
                    image,
                    alternative_text="Jornada comunitaria",
                    idempotency_key="event-image-004",
                )
            )

    remove.assert_not_called()


def test_imagen_invalida_no_llega_a_storage():
    image = UploadFile(file=BytesIO(b"not-an-image"), filename="evento.jpg")
    with (
        patch.object(
            event_service,
            "_obtener_evento_asociacion",
            return_value={"id": EVENT_ID, "estado": "borrador"},
        ),
        patch.object(
            event_service, "subir_bytes_evento", new=AsyncMock()
        ) as upload,
    ):
        with pytest.raises(event_service.EventServiceError) as raised:
            asyncio.run(
                event_service.subir_imagen_evento(
                    EVENT_ID,
                    ASSOCIATION_ID,
                    USER_ID,
                    image,
                    alternative_text="Jornada comunitaria",
                    idempotency_key="event-image-003",
                )
            )

    assert raised.value.code == "imagen_evento_invalida"
    upload.assert_not_called()


def test_retiro_no_expone_path_y_reporta_limpieza_pendiente():
    old_path = f"eventos/{EVENT_ID}/anterior.jpg"
    body = MagicMock(idempotency_key="event-image-remove-001")
    with (
        patch.object(
            event_service,
            "_obtener_evento_asociacion",
            return_value={"id": EVENT_ID, "estado": "borrador"},
        ),
        patch.object(
            event_service,
            "_rpc",
            return_value={
                "id": EVENT_ID,
                "estado": "borrador",
                "version_publica": 0,
                "updated_at": "2026-08-30T12:00:00+00:00",
                "event_id": "40000000-0000-0000-0000-000000000004",
                "previous_storage_path": old_path,
                "reintento": False,
            },
        ),
        patch.object(
            event_service, "eliminar_objeto_evento", return_value=False
        ) as remove,
    ):
        result = event_service.retirar_imagen_evento(
            EVENT_ID, ASSOCIATION_ID, USER_ID, body
        )

    assert result["storage_cleanup_pending"] is True
    assert old_path not in str(result)
    remove.assert_called_once_with(old_path)


def test_resumen_publico_firma_imagen_sin_exponer_path():
    path = f"eventos/{EVENT_ID}/principal.jpg"
    with patch.object(
        event_service,
        "crear_url_firmada_evento",
        return_value={
            "url": "https://signed.test/public",
            "expira_at": "2026-08-30T18:00:00+00:00",
        },
    ):
        result = event_service._public_summary(
            {"id": EVENT_ID, "imagen_storage_path": path}
        )

    assert result["imagen_url"] == "https://signed.test/public"
    assert result["imagen_url_expira_at"] == (
        "2026-08-30T18:00:00+00:00"
    )
    assert path not in str(result)


def test_panel_de_asociacion_firma_imagen_y_retira_path_privado():
    path = f"eventos/{EVENT_ID}/principal.jpg"
    query = _query(
        data=[
            {
                "id": EVENT_ID,
                "estado": "borrador",
                "imagen_storage_path": path,
            }
        ]
    )
    admin = MagicMock()
    admin.table.return_value = query
    with (
        patch.object(event_service, "supabase_admin", admin),
        patch.object(
            event_service,
            "crear_url_firmada_evento",
            return_value={
                "url": "https://signed.test/private-panel",
                "expira_at": "2026-08-30T18:00:00+00:00",
            },
        ),
    ):
        result = event_service.listar_eventos_asociacion(
            ASSOCIATION_ID,
            estado="borrador",
            limite=10,
        )

    assert result[0]["imagen_url"] == "https://signed.test/private-panel"
    assert path not in str(result)
