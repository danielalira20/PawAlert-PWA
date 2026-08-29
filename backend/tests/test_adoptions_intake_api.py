from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import adoptions
from app.main import app
from app.models.adoption import AdoptionIntakeCreate, AdoptionProfilePause
from app.services import adoption_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer adoption-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
CUSTODY_ID = "30000000-0000-0000-0000-000000000003"
ANIMAL_ID = "40000000-0000-0000-0000-000000000004"
REQUEST_ID = "50000000-0000-0000-0000-000000000005"
PROFILE_ID = "60000000-0000-0000-0000-000000000006"


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
