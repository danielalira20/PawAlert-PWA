from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import adoptions
from app.main import app
from app.models.adoption import (
    AdoptionApplicationAction,
    AdoptionApplicationReject,
    AdoptionApplicationRequestInformation,
)
from app.services import adoption_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer adoption-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
APPLICANT_ID = "10000000-0000-0000-0000-000000000009"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
PROFILE_ID = "30000000-0000-0000-0000-000000000003"
APPLICATION_ID = "40000000-0000-0000-0000-000000000004"
REQUIREMENT_ID = "50000000-0000-0000-0000-000000000005"


def _user(role: str = "asociacion", association_id: str | None = ASSOCIATION_ID):
    return {"id": USER_ID, "rol": role, "asociacion_id": association_id}


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
        }
    ]


def test_asociacion_consulta_bandeja_con_filtro_de_estado():
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "listar_solicitudes_asociacion",
            return_value=[],
        ) as list_applications,
    ):
        response = client.get(
            f"/associations/me/adoptions/{PROFILE_ID}/applications",
            params={"estado": "en_evaluacion"},
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json() == []
    list_applications.assert_called_once_with(
        PROFILE_ID,
        ASSOCIATION_ID,
        state="en_evaluacion",
    )


def test_rol_ajeno_no_consulta_expedientes_de_asociacion():
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("voluntario_externo", None),
        ),
        patch.object(adoption_service, "listar_solicitudes_asociacion") as list_,
    ):
        response = client.get(
            f"/associations/me/adoptions/{PROFILE_ID}/applications",
            headers=AUTH,
        )

    assert response.status_code == 403
    list_.assert_not_called()


def test_acciones_de_evaluacion_usan_actor_y_asociacion_autenticados():
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "solicitar_informacion_solicitud",
            return_value={"id": APPLICATION_ID, "estado": "requiere_informacion"},
        ) as request_information,
        patch.object(
            adoption_service,
            "seleccionar_solicitud",
            return_value={"id": APPLICATION_ID, "estado": "seleccionada"},
        ) as select,
        patch.object(
            adoption_service,
            "rechazar_solicitud",
            return_value={"id": APPLICATION_ID, "estado": "rechazada"},
        ) as reject,
    ):
        information_response = client.post(
            f"/adoption-applications/{APPLICATION_ID}/request-information",
            json={
                "informacion_solicitada": "Aclara quién cuidará al animal.",
                "idempotency_key": "association-information-001",
            },
            headers=AUTH,
        )
        select_response = client.post(
            f"/adoption-applications/{APPLICATION_ID}/select",
            json={"idempotency_key": "association-selection-001"},
            headers=AUTH,
        )
        reject_response = client.post(
            f"/adoption-applications/{APPLICATION_ID}/reject",
            json={
                "motivo_interno": "El espacio declarado no es compatible.",
                "categoria_publica": "condiciones_no_compatibles",
                "idempotency_key": "association-rejection-001",
            },
            headers=AUTH,
        )

    assert information_response.status_code == 200
    assert select_response.status_code == 200
    assert reject_response.status_code == 200
    for operation in (request_information, select, reject):
        assert operation.call_args.args[:3] == (
            APPLICATION_ID,
            ASSOCIATION_ID,
            USER_ID,
        )


def test_categoria_de_rechazo_fuera_del_contrato_se_rechaza():
    response = client.post(
        f"/adoption-applications/{APPLICATION_ID}/reject",
        json={
            "motivo_interno": "Motivo válido.",
            "categoria_publica": "acusacion_no_revisada",
            "idempotency_key": "association-rejection-002",
        },
        headers=AUTH,
    )
    assert response.status_code == 422


def test_bandeja_no_expone_borradores_ni_paths_privados(make_query):
    associations = make_query(
        data=[
            {
                "id": ASSOCIATION_ID,
                "activo": True,
                "verificado": True,
            }
        ]
    )
    profiles = make_query(
        data=[
            {
                "id": PROFILE_ID,
                "nombre_publico": "Sol",
                "estado": "publicado",
            }
        ]
    )
    applications = make_query(
        data=[
            {
                "id": APPLICATION_ID,
                "perfil_adopcion_id": PROFILE_ID,
                "solicitante_usuario_id": APPLICANT_ID,
                "requisitos_snapshot": _snapshot(),
                "estado": "rechazada",
                "informacion_solicitada": None,
                "informacion_solicitada_at": None,
                "entrevista_programada_at": None,
                "entrevista_modalidad": None,
                "entrevista_detalle_privado": None,
                "seleccionada_at": None,
                "motivo_rechazo_interno": "Nota privada de evaluación.",
                "categoria_rechazo_publica": "condiciones_no_compatibles",
                "rechazada_at": "2026-08-29T12:00:00+00:00",
                "enviada_at": "2026-08-29T10:00:00+00:00",
                "retirada_at": None,
                "vencimiento_at": "2026-09-28T10:00:00+00:00",
                "creada_at": "2026-08-29T09:00:00+00:00",
                "actualizada_at": "2026-08-29T12:00:00+00:00",
            }
        ]
    )
    applicants = make_query(
        data=[
            {
                "id": APPLICANT_ID,
                "nombre": "Ana",
                "apellido_paterno": "López",
                "apellido_materno": None,
                "email": "ana@example.com",
                "telefono": "+522221234567",
            }
        ]
    )
    private_path = f"adopciones/solicitudes/{APPLICATION_ID}/identidad.pdf"
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
    queries = {
        "asociaciones": associations,
        "perfiles_adopcion": profiles,
        "solicitudes_adopcion": applications,
        "usuarios": applicants,
        "respuestas_solicitud_adopcion": answers,
    }
    admin = MagicMock()
    admin.table.side_effect = lambda table: queries[table]
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(
            adoption_service,
            "crear_url_firmada_adopcion",
            return_value={
                "url": "https://signed.example/identity",
                "expira_at": "2026-08-29T18:00:00+00:00",
            },
        ),
    ):
        result = adoption_service.listar_solicitudes_asociacion(
            PROFILE_ID,
            ASSOCIATION_ID,
            state="rechazada",
        )

    serialized = str(result)
    assert result[0]["solicitante"]["nombre"] == "Ana"
    assert result[0]["motivo_rechazo_interno"] == "Nota privada de evaluación."
    assert result[0]["respuestas"][0]["documento"]["documento_url"]
    assert private_path not in serialized
    applications.neq.assert_called_once_with("estado", "borrador")
    applications.eq.assert_any_call("asociacion_id", ASSOCIATION_ID)
    applications.eq.assert_any_call("estado", "rechazada")
    profiles.eq.assert_any_call("asociacion_id", ASSOCIATION_ID)


def test_asociacion_inactiva_no_recibe_datos_de_solicitantes(make_query):
    associations = make_query(
        data=[
            {
                "id": ASSOCIATION_ID,
                "activo": False,
                "verificado": True,
            }
        ]
    )
    admin = MagicMock()
    admin.table.return_value = associations
    with patch.object(adoption_service, "supabase_admin", admin):
        try:
            adoption_service.listar_solicitudes_asociacion(
                PROFILE_ID,
                ASSOCIATION_ID,
                state=None,
            )
        except adoption_service.AdoptionServiceError as error:
            assert error.code == "asociacion_no_operativa"
            assert error.status_code == 403
        else:
            raise AssertionError("Se esperaba bloquear la asociación inactiva")

    assert admin.table.call_count == 1


def test_servicios_de_decision_respetan_contrato_rpc():
    with patch.object(adoption_service, "_rpc", return_value={}) as rpc:
        adoption_service.solicitar_informacion_solicitud(
            APPLICATION_ID,
            ASSOCIATION_ID,
            USER_ID,
            AdoptionApplicationRequestInformation(
                informacion_solicitada="Confirma el horario habitual.",
                idempotency_key="association-information-003",
            ),
        )
        adoption_service.seleccionar_solicitud(
            APPLICATION_ID,
            ASSOCIATION_ID,
            USER_ID,
            AdoptionApplicationAction(
                idempotency_key="association-selection-003"
            ),
        )
        adoption_service.rechazar_solicitud(
            APPLICATION_ID,
            ASSOCIATION_ID,
            USER_ID,
            AdoptionApplicationReject(
                motivo_interno="No cumple el requisito de seguridad.",
                categoria_publica="requisitos_no_cumplidos",
                idempotency_key="association-rejection-003",
            ),
        )

    operations = [call.args[0] for call in rpc.call_args_list]
    assert operations == [
        "solicitar_informacion_solicitud_adopcion",
        "seleccionar_solicitud_adopcion",
        "rechazar_solicitud_adopcion",
    ]
    reject_params = rpc.call_args_list[-1].args[1]
    assert reject_params["p_asociacion_id"] == ASSOCIATION_ID
    assert reject_params["p_motivo_interno"].startswith("No cumple")
    assert reject_params["p_categoria_publica"] == "requisitos_no_cumplidos"
