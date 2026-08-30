from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api import adoptions
from app.main import app
from app.models.adoption import (
    AdoptionRequirementTemplateRetire,
    AdoptionRequirementTemplateWrite,
)
from app.services import adoption_service


client = TestClient(app)
AUTH = {"Authorization": "Bearer adoption-token"}
USER_ID = "10000000-0000-0000-0000-000000000001"
ASSOCIATION_ID = "20000000-0000-0000-0000-000000000002"
TEMPLATE_ID = "80000000-0000-0000-0000-000000000008"


def _user(role: str = "asociacion", association_id: str | None = ASSOCIATION_ID):
    return {"id": USER_ID, "rol": role, "asociacion_id": association_id}


def _payload(**overrides) -> dict:
    result = {
        "nombre": "Requisitos para perros",
        "descripcion": "Preguntas adicionales de la asociación.",
        "preguntas": [
            {
                "clave": "patio_seguro",
                "titulo": "Seguridad del patio",
                "descripcion": "Describe bardas y accesos.",
                "tipo_respuesta": "texto_largo",
                "opciones": [],
                "obligatorio": True,
                "es_sensible": False,
                "orden": 1,
            }
        ],
        "idempotency_key": "template-write-001",
    }
    result.update(overrides)
    return result


def _base_requirement() -> dict:
    return {
        "clave": "identidad_mayoria_edad",
        "titulo": "Identidad y mayoría de edad",
        "descripcion": "Documento para validar identidad.",
        "tipo_respuesta": "documento",
        "opciones": [],
        "obligatorio": True,
        "es_sensible": True,
        "orden": 10,
        "activo": True,
    }


def test_asociacion_consulta_su_panel_de_requisitos():
    result = {"requisitos_base": [], "plantillas": []}
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "listar_plantillas_requisitos",
            return_value=result,
        ) as list_templates,
    ):
        response = client.get(
            "/associations/me/adoption-requirement-templates",
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json() == result
    list_templates.assert_called_once_with(ASSOCIATION_ID)


def test_rol_ajeno_no_puede_administrar_plantillas():
    with (
        patch.object(
            adoptions,
            "_authenticated_user",
            return_value=_user("voluntario_externo", None),
        ),
        patch.object(adoption_service, "crear_plantilla_requisitos") as create,
    ):
        response = client.post(
            "/associations/me/adoption-requirement-templates",
            json=_payload(),
            headers=AUTH,
        )

    assert response.status_code == 403
    create.assert_not_called()


def test_documento_no_sensible_y_claves_repetidas_se_rechazan():
    document = _payload()
    document["preguntas"][0].update(
        {
            "tipo_respuesta": "documento",
            "es_sensible": False,
        }
    )
    assert client.post(
        "/associations/me/adoption-requirement-templates",
        json=document,
        headers=AUTH,
    ).status_code == 422

    duplicate = _payload()
    duplicate["preguntas"].append(
        {**duplicate["preguntas"][0], "orden": 2}
    )
    assert client.post(
        "/associations/me/adoption-requirement-templates",
        json=duplicate,
        headers=AUTH,
    ).status_code == 422


def test_servicio_no_envia_clave_base_como_pregunta_personalizada(make_query):
    base_query = make_query(data=[_base_requirement()])
    admin = MagicMock()
    admin.table.return_value = base_query
    body = AdoptionRequirementTemplateWrite(
        **_payload(
            preguntas=[
                {
                    **_payload()["preguntas"][0],
                    "clave": "identidad_mayoria_edad",
                }
            ]
        )
    )
    with (
        patch.object(adoption_service, "supabase_admin", admin),
        patch.object(adoption_service, "_rpc") as rpc,
    ):
        try:
            adoption_service.crear_plantilla_requisitos(
                ASSOCIATION_ID,
                USER_ID,
                body,
            )
        except adoption_service.AdoptionServiceError as error:
            assert error.code == "clave_requisito_adopcion_reservada"
            assert error.status_code == 422
        else:
            raise AssertionError("Se esperaba rechazar la clave reservada")
    rpc.assert_not_called()


def test_servicio_crea_plantilla_con_rpc_tipado(make_query):
    base_query = make_query(data=[_base_requirement()])
    admin = MagicMock()
    admin.table.return_value = base_query
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data={"id": TEMPLATE_ID, "version": 1, "estado": "borrador"}
    )
    admin.rpc.return_value = rpc
    with patch.object(adoption_service, "supabase_admin", admin):
        adoption_service.crear_plantilla_requisitos(
            ASSOCIATION_ID,
            USER_ID,
            AdoptionRequirementTemplateWrite(**_payload()),
        )

    operation, params = admin.rpc.call_args.args
    assert operation == "crear_plantilla_requisitos_adopcion"
    assert params["p_asociacion_id"] == ASSOCIATION_ID
    assert params["p_actor_usuario_id"] == USER_ID
    assert params["p_preguntas"][0]["clave"] == "patio_seguro"


def test_panel_no_expone_actores_y_conserva_versiones_retiradas(make_query):
    queries = {
        "asociaciones": make_query(
            data=[
                {
                    "id": ASSOCIATION_ID,
                    "activo": True,
                    "verificado": True,
                }
            ]
        ),
        "requisitos_base_adopcion": make_query(data=[_base_requirement()]),
        "plantillas_requisitos_adopcion": make_query(
            data=[
                {
                    "id": TEMPLATE_ID,
                    "version": 1,
                    "nombre": "Versión original",
                    "descripcion": None,
                    "requisitos_base_version": "pawalert-v1",
                    "estado": "retirada",
                    "activada_at": "2026-08-28T10:00:00+00:00",
                    "retirada_at": "2026-08-29T10:00:00+00:00",
                    "creada_at": "2026-08-27T10:00:00+00:00",
                    "actualizada_at": "2026-08-29T10:00:00+00:00",
                    "creada_por_usuario_id": "dato-privado",
                }
            ]
        ),
        "preguntas_requisito_adopcion": make_query(
            data=[
                {
                    "plantilla_id": TEMPLATE_ID,
                    **_payload()["preguntas"][0],
                }
            ]
        ),
    }
    admin = MagicMock()
    admin.table.side_effect = lambda table: queries[table]
    with patch.object(adoption_service, "supabase_admin", admin):
        result = adoption_service.listar_plantillas_requisitos(ASSOCIATION_ID)

    assert result["plantillas"][0]["estado"] == "retirada"
    assert result["plantillas"][0]["preguntas"][0]["clave"] == "patio_seguro"
    assert "dato-privado" not in str(result)


def test_activar_plantilla_conserva_contexto_de_asociacion():
    result = {"id": TEMPLATE_ID, "version": 2, "estado": "activa"}
    with (
        patch.object(adoptions, "_authenticated_user", return_value=_user()),
        patch.object(
            adoption_service,
            "activar_plantilla_requisitos",
            return_value=result,
        ) as activate,
    ):
        response = client.post(
            (
                "/associations/me/adoption-requirement-templates/"
                f"{TEMPLATE_ID}/activate"
            ),
            json={"idempotency_key": "template-activate-001"},
            headers=AUTH,
        )

    assert response.status_code == 200
    assert response.json() == result
    assert activate.call_args.args[:3] == (
        TEMPLATE_ID,
        ASSOCIATION_ID,
        USER_ID,
    )


def test_retiro_envia_motivo_e_idempotencia_a_rpc():
    body = AdoptionRequirementTemplateRetire(
        motivo="La asociación usará solamente los requisitos base.",
        idempotency_key="template-retire-001",
    )
    with patch.object(
        adoption_service,
        "_rpc",
        return_value={"id": TEMPLATE_ID, "estado": "retirada"},
    ) as rpc:
        adoption_service.retirar_plantilla_requisitos(
            TEMPLATE_ID,
            ASSOCIATION_ID,
            USER_ID,
            body,
        )

    operation, params = rpc.call_args.args
    assert operation == "retirar_plantilla_requisitos_adopcion"
    assert params == {
        "p_plantilla_id": TEMPLATE_ID,
        "p_asociacion_id": ASSOCIATION_ID,
        "p_actor_usuario_id": USER_ID,
        "p_motivo": "La asociación usará solamente los requisitos base.",
        "p_idempotency_key": "template-retire-001",
    }
