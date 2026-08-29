import asyncio
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import UploadFile

from app.api import adoptions
from app.main import app
from app.models.adoption import (
    AdoptionIntakeCreate,
    AdoptionProfilePause,
    AdoptionProfilePhotoRemove,
    AdoptionProfileUpdate,
)
from app.services import adoption_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer adoption-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
CUSTODY_ID = "30000000-0000-0000-0000-000000000003"
ANIMAL_ID = "40000000-0000-0000-0000-000000000004"
REQUEST_ID = "50000000-0000-0000-0000-000000000005"
PROFILE_ID = "60000000-0000-0000-0000-000000000006"
PHOTO_ID = "70000000-0000-0000-0000-000000000007"


def _user(role: str, association_id: str | None = None) -> dict:
    return {"id": USER_ID, "rol": role, "asociacion_id": association_id}


def _intake_payload() -> dict:
    return {
        "animal_id": ANIMAL_ID,
        "origen_individuo": 1,
        "nombre_temporal": "Luna",
        "fotos_propuesta_paths": ["adopciones/ingresos/luna/frente.jpg"],
        "salud_conocida": "Estable y bajo observación.",
        "tratamientos_conocidos": "Desparasitación.",
        "temperamento_observado": "Tranquila con personas.",
        "compatibilidad_observada": {"perros": "por_confirmar"},
        "motivo_propuesta": "Está lista para comenzar valoración.",
        "idempotency_key": "intake-unique-001",
    }


def _jpeg_simple() -> bytes:
    output = BytesIO()
    Image.new("RGB", (80, 60), "orange").save(output, format="JPEG")
    return output.getvalue()


def test_hogar_temporal_crea_propuesta_con_actor_autenticado():
    result = {"id": REQUEST_ID, "estado": "pendiente"}
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("voluntario_externo"),
        ),
        patch.object(
            adoption_service,
            "proponer_ingreso_desde_custodia",
            return_value=result,
        ) as create,
    ):
        response = client.post(
            f"/custody/{CUSTODY_ID}/adoption-intake-requests",
            json=_intake_payload(),
            headers=AUTH,
        )

    assert response.status_code == 201
    assert response.json() == result
    assert create.call_args.args[:2] == (CUSTODY_ID, USER_ID)


def test_rol_ajeno_no_puede_proponer_desde_custodia():
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("reportante"),
        ),
        patch.object(
            adoption_service,
            "proponer_ingreso_desde_custodia",
        ) as create,
    ):
        response = client.post(
            f"/custody/{CUSTODY_ID}/adoption-intake-requests",
            json=_intake_payload(),
            headers=AUTH,
        )

    assert response.status_code == 403
    create.assert_not_called()


def test_asociacion_resuelve_solo_con_su_contexto():
    result = {"id": REQUEST_ID, "estado": "aprobada", "perfil_adopcion_id": PROFILE_ID}
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("staff", ASSOCIATION_ID),
        ),
        patch.object(
            adoption_service,
            "resolver_ingreso",
            return_value=result,
        ) as resolve,
    ):
        response = client.post(
            f"/adoption-intake-requests/{REQUEST_ID}/resolve",
            json={
                "decision": "aprobar",
                "motivo": "La asociación revisó el ingreso.",
                "idempotency_key": "resolve-unique-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json() == result
    assert resolve.call_args.args[:3] == (REQUEST_ID, ASSOCIATION_ID, USER_ID)


def test_asociacion_sin_vinculo_no_puede_operar_perfiles():
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("asociacion"),
        ),
        patch.object(adoption_service, "crear_perfil_formal") as create,
    ):
        response = client.post(
            "/associations/me/adoptions",
            json={"datos": {}, "idempotency_key": "formal-unique-001"},
            headers=AUTH,
        )

    assert response.status_code == 403
    create.assert_not_called()


def test_error_de_estado_se_comunica_como_conflicto():
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("asociacion", ASSOCIATION_ID),
        ),
        patch.object(
            adoption_service,
            "pausar_perfil",
            side_effect=adoption_service.AdoptionServiceError(
                "perfil_adopcion_no_pausable"
            ),
        ),
    ):
        response = client.post(
            f"/associations/me/adoptions/{PROFILE_ID}/pause",
            json={
                "motivo": "Pausa temporal solicitada.",
                "idempotency_key": "pause-unique-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 409
    assert "publicado" in response.json()["detail"]


def test_servicio_envia_parametros_tipados_a_rpc():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data={"id": REQUEST_ID, "estado": "pendiente"}
    )
    with patch.object(
        adoption_service.supabase_admin,
        "rpc",
        return_value=rpc,
    ) as call:
        adoption_service.proponer_ingreso_desde_custodia(
            CUSTODY_ID,
            USER_ID,
            AdoptionIntakeCreate(**_intake_payload()),
        )

    operation, params = call.call_args.args
    assert operation == "proponer_ingreso_adopcion_desde_custodia"
    assert params["p_custodia_id"] == CUSTODY_ID
    assert params["p_actor_usuario_id"] == USER_ID
    assert params["p_animal_id"] == ANIMAL_ID


def test_servicio_no_filtra_detalle_crudo_de_error_desconocido():
    rpc = MagicMock()
    rpc.execute.side_effect = RuntimeError("secret database connection detail")
    with patch.object(
        adoption_service.supabase_admin,
        "rpc",
        return_value=rpc,
    ):
        try:
            adoption_service.pausar_perfil(
                PROFILE_ID,
                ASSOCIATION_ID,
                USER_ID,
                AdoptionProfilePause(
                    motivo="Pausa temporal.",
                    idempotency_key="pause-unique-002",
                ),
            )
        except adoption_service.AdoptionServiceError as error:
            assert error.status_code == 503
            assert "secret" not in error.detail
        else:
            raise AssertionError("Se esperaba AdoptionServiceError")


def test_ruta_de_foto_ajena_al_bucket_privado_se_rechaza_antes_del_servicio():
    payload = _intake_payload()
    payload["fotos_propuesta_paths"] = ["reportes/publicos/luna.jpg"]
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("voluntario_externo"),
        ),
        patch.object(
            adoption_service,
            "proponer_ingreso_desde_custodia",
        ) as create,
    ):
        response = client.post(
            f"/custody/{CUSTODY_ID}/adoption-intake-requests",
            json=payload,
            headers=AUTH,
        )

    assert response.status_code == 422
    create.assert_not_called()


def test_identificador_invalido_no_llega_al_servicio():
    with patch.object(
        adoption_service,
        "pausar_perfil",
    ) as pause:
        response = client.post(
            "/associations/me/adoptions/no-es-uuid/pause",
            json={
                "motivo": "Pausa temporal.",
                "idempotency_key": "pause-unique-003",
            },
            headers=AUTH,
        )

    assert response.status_code == 422
    pause.assert_not_called()


def test_asociacion_actualiza_solo_los_campos_enviados():
    result = {"id": PROFILE_ID, "estado": "borrador"}
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("asociacion", ASSOCIATION_ID),
        ),
        patch.object(
            adoption_service,
            "actualizar_perfil",
            return_value=result,
        ) as update,
    ):
        response = client.patch(
            f"/associations/me/adoptions/{PROFILE_ID}",
            json={
                "datos": {"nombre_publico": "  Sol  "},
                "idempotency_key": "profile-update-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json() == result
    body = update.call_args.args[3]
    assert body.datos.nombre_publico == "Sol"
    assert body.datos.model_fields_set == {"nombre_publico"}


def test_carga_de_foto_usa_formulario_privado_y_contexto_de_asociacion():
    result = {
        "id": PHOTO_ID,
        "estado": "borrador",
        "foto_url": "https://signed.test/photo",
    }
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("staff", ASSOCIATION_ID),
        ),
        patch.object(
            adoption_service,
            "subir_foto_perfil",
            new=AsyncMock(return_value=result),
        ) as upload,
    ):
        response = client.post(
            f"/associations/me/adoptions/{PROFILE_ID}/photos",
            files={"photo": ("sol.jpg", _jpeg_simple(), "image/jpeg")},
            data={
                "orden": "2",
                "texto_alternativo": "Sol descansando",
                "idempotency_key": "profile-photo-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 201
    assert response.json() == result
    assert upload.call_args.args[:3] == (PROFILE_ID, ASSOCIATION_ID, USER_ID)
    assert upload.call_args.kwargs == {
        "order": 2,
        "alternative_text": "Sol descansando",
        "idempotency_key": "profile-photo-001",
    }


def test_rechazar_foto_sin_motivo_no_llega_al_servicio():
    with patch.object(adoption_service, "revisar_foto_perfil") as review:
        response = client.post(
            (
                f"/associations/me/adoptions/{PROFILE_ID}/photos/"
                f"{PHOTO_ID}/review"
            ),
            json={
                "aprobada": False,
                "idempotency_key": "photo-review-001",
            },
            headers=AUTH,
        )

    assert response.status_code == 422
    review.assert_not_called()


def test_servicio_de_actualizacion_no_inyecta_defaults_no_enviados():
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data={"id": PROFILE_ID, "estado": "borrador"}
    )
    body = AdoptionProfileUpdate(
        datos={"nombre_publico": "Sol"},
        idempotency_key="profile-update-002",
    )
    with patch.object(
        adoption_service.supabase_admin,
        "rpc",
        return_value=rpc,
    ) as call:
        adoption_service.actualizar_perfil(
            PROFILE_ID,
            ASSOCIATION_ID,
            USER_ID,
            body,
        )

    assert call.call_args.args[1]["p_datos"] == {"nombre_publico": "Sol"}


def test_fallo_de_rpc_limpia_foto_recien_subida():
    upload_file = UploadFile(
        file=BytesIO(_jpeg_simple()),
        filename="sol.jpg",
    )
    with (
        patch.object(
            adoption_service,
            "_obtener_perfil_asociacion",
            return_value={"id": PROFILE_ID, "estado": "borrador"},
        ),
        patch.object(
            adoption_service,
            "subir_bytes_adopcion",
            new=AsyncMock(
                return_value=f"adopciones/perfiles/{PROFILE_ID}/foto.jpg"
            ),
        ),
        patch.object(
            adoption_service,
            "_rpc",
            side_effect=adoption_service.AdoptionServiceError(
                "perfil_adopcion_no_editable"
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
                adoption_service.subir_foto_perfil(
                    PROFILE_ID,
                    ASSOCIATION_ID,
                    USER_ID,
                    upload_file,
                    order=1,
                    alternative_text="Sol",
                    idempotency_key="profile-photo-002",
                )
            )
        except adoption_service.AdoptionServiceError as error:
            assert error.code == "perfil_adopcion_no_editable"
        else:
            raise AssertionError("Se esperaba AdoptionServiceError")

    removed_path = remove.call_args.args[0]
    assert removed_path.startswith(f"adopciones/perfiles/{PROFILE_ID}/")


def test_listado_firma_fotos_sin_exponer_storage_path(make_query):
    profile_query = make_query(
        data=[{"id": PROFILE_ID, "estado": "borrador"}]
    )
    private_path = f"adopciones/perfiles/{PROFILE_ID}/sol.jpg"
    photo_query = make_query(
        data=[
            {
                "id": PHOTO_ID,
                "perfil_adopcion_id": PROFILE_ID,
                "storage_path": private_path,
                "mime_type": "image/jpeg",
                "size_bytes": 1234,
                "orden": 1,
                "aprobada_publicacion": False,
            }
        ]
    )
    admin = MagicMock()
    admin.table.side_effect = lambda table: (
        profile_query if table == "perfiles_adopcion" else photo_query
    )
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.test/sol",
                "expira_at": "2026-08-29T12:00:00+00:00",
            },
        ),
    ):
        result = adoption_service.listar_perfiles_asociacion(ASSOCIATION_ID)

    assert result[0]["fotos"][0]["foto_url"] == "https://signed.test/sol"
    assert private_path not in str(result)


def test_ingreso_reemplaza_paths_privados_por_urls_temporales(make_query):
    private_path = "adopciones/ingresos/custodia/sol.jpg"
    request_query = make_query(
        data=[
            {
                "id": REQUEST_ID,
                "estado": "pendiente",
                "fotos_propuesta_paths": [private_path],
            }
        ]
    )
    admin = MagicMock()
    admin.table.return_value = request_query
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.test/intake",
                "expira_at": "2026-08-29T12:00:00+00:00",
            },
        ),
    ):
        result = adoption_service.listar_ingresos_asociacion(ASSOCIATION_ID)

    assert "fotos_propuesta_paths" not in result[0]
    assert result[0]["fotos_propuesta"][0]["foto_url"] == (
        "https://signed.test/intake"
    )
    assert private_path not in str(result)


def test_retiro_no_devuelve_path_privado_y_reporta_limpieza_pendiente():
    body = AdoptionProfilePhotoRemove(
        motivo="La fotografía quedó desactualizada.",
        idempotency_key="photo-remove-001",
    )
    private_path = f"adopciones/perfiles/{PROFILE_ID}/sol.jpg"
    with (
        patch.object(
            adoption_service,
            "_rpc",
            return_value={
                "id": PHOTO_ID,
                "estado": "borrador",
                "storage_path": private_path,
            },
        ),
        patch.object(
            adoption_service,
            "eliminar_objeto_adopcion",
            return_value=False,
        ),
    ):
        result = adoption_service.retirar_foto_perfil(
            PROFILE_ID,
            PHOTO_ID,
            ASSOCIATION_ID,
            USER_ID,
            body,
        )

    assert "storage_path" not in result
    assert result["storage_cleanup_pending"] is True
