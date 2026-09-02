import asyncio
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import Headers

from app.api import adoptions
from app.main import app
from app.models.adoption import (
    AdoptionApplicationDraftUpdate,
)
from app.services import adoption_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer adoption-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
PROFILE_ID = "30000000-0000-0000-0000-000000000003"
APPLICATION_ID = "40000000-0000-0000-0000-000000000004"
REQUIREMENT_ID = "50000000-0000-0000-0000-000000000005"
PHOTO_ID = "60000000-0000-0000-0000-000000000006"


def _user() -> dict:
    return {"id": USER_ID, "rol": "reportante", "asociacion_id": None}


def _jpeg_simple() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (24, 24), color="white").save(buffer, format="JPEG")
    return buffer.getvalue()


def _snapshot() -> list[dict]:
    return [
        {
            "origen": "pawalert",
            "referencia_id": REQUIREMENT_ID,
            "clave": "identidad_mayoria_edad",
            "titulo": "Identidad y mayoría de edad",
            "descripcion": "Documento privado.",
            "tipo_respuesta": "documento",
            "opciones": [],
            "obligatorio": True,
            "es_sensible": True,
            "orden": 10,
        },
        {
            "origen": "pawalert",
            "referencia_id": REQUIREMENT_ID,
            "clave": "compromiso_veterinario",
            "titulo": "Compromiso veterinario",
            "descripcion": None,
            "tipo_respuesta": "booleano",
            "opciones": [],
            "obligatorio": True,
            "es_sensible": False,
            "orden": 20,
        },
    ]


def test_crear_borrador_usa_usuario_autenticado():
    result = {"id": APPLICATION_ID, "estado": "borrador"}
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "crear_borrador_solicitud",
            return_value=result,
        ) as create,
    ):
        response = client.post(
            f"/adoptions/{PROFILE_ID}/applications/draft",
            json={"idempotency_key": "application-draft-001"},
            headers=AUTH,
        )

    assert response.status_code == 201
    assert response.json() == result
    assert create.call_args.args[:2] == (PROFILE_ID, USER_ID)


def test_autoguardado_rechaza_claves_repetidas():
    response = client.patch(
        f"/adoption-applications/{APPLICATION_ID}/draft",
        json={
            "respuestas": [
                {"clave": "compromiso_veterinario", "valor": True},
                {"clave": "compromiso_veterinario", "valor": False},
            ],
            "idempotency_key": "application-save-001",
        },
        headers=AUTH,
    )
    assert response.status_code == 422


def test_servicio_traduce_actualizacion_y_eliminacion_sin_nulos():
    body = AdoptionApplicationDraftUpdate(
        respuestas=[
            {"clave": "compromiso_veterinario", "valor": True},
            {"clave": "animales_hogar", "eliminar": True},
        ],
        idempotency_key="application-save-002",
    )
    with patch.object(
        adoption_service,
        "_rpc",
        return_value={"id": APPLICATION_ID, "estado": "borrador"},
    ) as rpc:
        adoption_service.actualizar_respuestas_solicitud(
            APPLICATION_ID,
            USER_ID,
            body,
        )

    operation, params = rpc.call_args.args
    assert operation == "actualizar_respuestas_solicitud_adopcion"
    assert params["p_actor_usuario_id"] == USER_ID
    assert params["p_respuestas"] == [
        {"clave": "compromiso_veterinario", "valor": True},
        {"clave": "animales_hogar", "eliminar": True},
    ]


def test_documento_se_procesa_y_se_liga_al_expediente():
    upload = UploadFile(
        file=BytesIO(_jpeg_simple()),
        filename="identificacion.jpg",
        headers=Headers({"content-type": "image/jpeg"}),
    )
    storage_path = (
        f"adopciones/solicitudes/{APPLICATION_ID}/documento.jpg"
    )
    with (
        patch.object(
            adoption_service,
            "_obtener_solicitud_propia",
            return_value={
                "id": APPLICATION_ID,
                "estado": "borrador",
                "requisitos_snapshot": _snapshot(),
            },
        ),
        patch.object(
            adoption_service,
            "subir_bytes_adopcion",
            new=AsyncMock(return_value=storage_path),
        ),
        patch.object(
            adoption_service,
            "_rpc",
            return_value={"id": APPLICATION_ID, "estado": "borrador"},
        ) as rpc,
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.example/document",
                "expira_at": "2026-08-29T18:00:00+00:00",
            },
        ),
    ):
        result = asyncio.run(
            adoption_service.subir_documento_solicitud(
                APPLICATION_ID,
                USER_ID,
                upload,
                question_key="identidad_mayoria_edad",
                idempotency_key="application-document-001",
            )
        )

    _, params = rpc.call_args.args
    document = params["p_respuestas"][0]["documento"]
    assert document["storage_path"].startswith(
        f"adopciones/solicitudes/{APPLICATION_ID}/"
    )
    assert document["mime_type"] == "image/jpeg"
    assert "storage_path" not in str(result)
    assert result["documento"]["documento_url"].startswith("https://")


def test_fallo_funcional_limpia_documento_recien_cargado():
    upload = UploadFile(
        file=BytesIO(b"%PDF-1.4\ncontenido\n%%EOF"),
        filename="comprobante.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    storage_path = f"adopciones/solicitudes/{APPLICATION_ID}/doc.pdf"
    with (
        patch.object(
            adoption_service,
            "_obtener_solicitud_propia",
            return_value={
                "id": APPLICATION_ID,
                "estado": "borrador",
                "requisitos_snapshot": _snapshot(),
            },
        ),
        patch.object(
            adoption_service,
            "subir_bytes_adopcion",
            new=AsyncMock(return_value=storage_path),
        ),
        patch.object(
            adoption_service,
            "_rpc",
            side_effect=adoption_service.AdoptionServiceError(
                "solicitud_adopcion_respuestas_no_editables"
            ),
        ),
        patch.object(
            adoption_service,
            "eliminar_objeto_adopcion",
            return_value=True,
        ) as remove,
    ):
        try:
            asyncio.run(
                adoption_service.subir_documento_solicitud(
                    APPLICATION_ID,
                    USER_ID,
                    upload,
                    question_key="identidad_mayoria_edad",
                    idempotency_key="application-document-002",
                )
            )
        except adoption_service.AdoptionServiceError as error:
            assert error.code == "solicitud_adopcion_respuestas_no_editables"
        else:
            raise AssertionError("Se esperaba AdoptionServiceError")

    remove.assert_called_once_with(storage_path)


def test_listado_propio_no_expone_paths_ni_motivo_interno(make_query):
    applications = make_query(
        data=[
            {
                "id": APPLICATION_ID,
                "perfil_adopcion_id": PROFILE_ID,
                "asociacion_id": ASSOCIATION_ID,
                "requisitos_snapshot": _snapshot(),
                "estado": "rechazada",
                "informacion_solicitada": None,
                "informacion_solicitada_at": None,
                "entrevista_programada_at": None,
                "entrevista_modalidad": None,
                "entrevista_detalle_privado": None,
                "categoria_rechazo_publica": "condiciones_no_compatibles",
                "motivo_rechazo_interno": "dato que no debe salir",
                "enviada_at": "2026-08-29T10:00:00+00:00",
                "retirada_at": None,
                "vencimiento_at": "2026-09-28T10:00:00+00:00",
                "creada_at": "2026-08-29T09:00:00+00:00",
                "actualizada_at": "2026-08-29T11:00:00+00:00",
            }
        ]
    )
    profiles = make_query(
        data=[
            {
                "id": PROFILE_ID,
                "nombre_publico": "Sol",
                "estado": "publicado",
                "zona_general": "Puebla capital",
            }
        ]
    )
    associations = make_query(
        data=[
            {
                "id": ASSOCIATION_ID,
                "nombre": "Patitas",
                "acerca_de": None,
                "logo_url": None,
            }
        ]
    )
    private_path = f"adopciones/solicitudes/{APPLICATION_ID}/doc.pdf"
    answers = make_query(
        data=[
            {
                "solicitud_adopcion_id": APPLICATION_ID,
                "pregunta_clave_snapshot": "identidad_mayoria_edad",
                "respuesta_json": None,
                "documento_storage_path": private_path,
                "documento_mime_type": "application/pdf",
                "documento_size_bytes": 500,
            }
        ]
    )
    photos = make_query(data=[])
    queries = {
        "solicitudes_adopcion": applications,
        "perfiles_adopcion": profiles,
        "asociaciones": associations,
        "respuestas_solicitud_adopcion": answers,
        "fotos_perfil_adopcion": photos,
    }
    admin = MagicMock()
    admin.table.side_effect = lambda table: queries[table]
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.example/document",
                "expira_at": "2026-08-29T18:00:00+00:00",
            },
        ),
    ):
        result = adoption_service.listar_mis_solicitudes(USER_ID)

    serialized = str(result)
    assert result[0]["categoria_rechazo_publica"] == "condiciones_no_compatibles"
    assert result[0]["respuestas"][0]["documento"]["documento_url"]
    assert private_path not in serialized
    assert "dato que no debe salir" not in serialized


def test_rpc_de_envio_y_retiro_reciben_solo_actor_autenticado():
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "enviar_solicitud",
            return_value={"id": APPLICATION_ID, "estado": "enviada"},
        ) as submit,
        patch.object(
            adoption_service,
            "retirar_solicitud",
            return_value={"id": APPLICATION_ID, "estado": "retirada"},
        ) as withdraw,
    ):
        submit_response = client.post(
            f"/adoption-applications/{APPLICATION_ID}/submit",
            json={"idempotency_key": "application-submit-001"},
            headers=AUTH,
        )
        withdraw_response = client.post(
            f"/adoption-applications/{APPLICATION_ID}/withdraw",
            json={
                "motivo": "Cambió mi situación familiar",
                "idempotency_key": "application-withdraw-001",
            },
            headers=AUTH,
        )

    assert submit_response.status_code == 200
    assert withdraw_response.status_code == 200
    assert submit.call_args.args[:2] == (APPLICATION_ID, USER_ID)
    assert withdraw.call_args.args[:2] == (APPLICATION_ID, USER_ID)
