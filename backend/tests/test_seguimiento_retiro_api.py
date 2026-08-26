from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.models.report import SeguimientoRetiroAnimalRequest
from app.services import deceased_followup_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-seguimiento"}
REPORTE_ID = "20000000-0000-0000-0000-000000000003"
RESULTADO_ID = "50000000-0000-0000-0000-000000000031"
USUARIO_ID = "00000000-0000-0000-0000-000000000005"
ASOCIACION_ID = "10000000-0000-0000-0000-000000000001"


def _usuario(rol: str, asociacion_id: str | None = ASOCIACION_ID) -> dict:
    return {
        "id": USUARIO_ID,
        "asociacion_id": asociacion_id,
        "rol": rol,
    }


def _payload() -> dict:
    return {
        "accion": "contacto_oficial_realizado",
        "idempotency_key": "seguimiento-123",
        "folio": "PA-2026-01",
        "nombre_servicio": "Protección Animal",
        "nota": "Se recibió el folio y se esperan indicaciones.",
    }


@pytest.mark.parametrize(
    ("rol", "asociacion_id", "tipo_actor_esperado", "asociacion_esperada"),
    [
        ("voluntario_interno", ASOCIACION_ID, "voluntario", None),
        ("voluntario_externo", None, "voluntario", None),
        ("asociacion", ASOCIACION_ID, "asociacion", ASOCIACION_ID),
        ("staff", ASOCIACION_ID, "asociacion", ASOCIACION_ID),
        ("admin", None, "administracion", None),
    ],
)
def test_endpoint_deriva_actor_desde_el_rol_autenticado(
    rol: str,
    asociacion_id: str | None,
    tipo_actor_esperado: str,
    asociacion_esperada: str | None,
) -> None:
    respuesta = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "seguimiento_retiro_id": "60000000-0000-0000-0000-000000000001",
    }
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario(rol, asociacion_id),
        ),
        patch.object(
            deceased_followup_service,
            "registrar_seguimiento_retiro",
            return_value=respuesta,
        ) as registrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/{RESULTADO_ID}/seguimiento-retiro",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json() == respuesta
    argumentos = registrar.call_args.args
    assert argumentos[:5] == (
        REPORTE_ID,
        RESULTADO_ID,
        USUARIO_ID,
        tipo_actor_esperado,
        asociacion_esperada,
    )
    assert argumentos[5].accion == "contacto_oficial_realizado"


def test_endpoint_rechaza_rol_sin_capacidad_operativa() -> None:
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario("reportante", None),
        ),
        patch.object(
            deceased_followup_service,
            "registrar_seguimiento_retiro",
        ) as registrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/{RESULTADO_ID}/seguimiento-retiro",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    registrar.assert_not_called()


def test_endpoint_no_revela_resultado_ajeno() -> None:
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario("voluntario_externo", None),
        ),
        patch.object(
            deceased_followup_service,
            "registrar_seguimiento_retiro",
            side_effect=deceased_followup_service.SeguimientoFallecimientoError(
                "voluntario_seguimiento_no_autorizado"
            ),
        ),
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/{RESULTADO_ID}/seguimiento-retiro",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "No puedes registrar acciones en este seguimiento"
    )


def test_servicio_envia_contrato_completo_a_la_rpc() -> None:
    respuesta = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "seguimiento_retiro_id": "60000000-0000-0000-0000-000000000001",
        "reutilizado": False,
    }
    base = MagicMock()
    base.rpc.return_value.execute.return_value = SimpleNamespace(data=respuesta)
    body = SeguimientoRetiroAnimalRequest(**_payload())

    with patch.object(deceased_followup_service, "supabase_admin", base):
        resultado = deceased_followup_service.registrar_seguimiento_retiro(
            REPORTE_ID,
            RESULTADO_ID,
            USUARIO_ID,
            "asociacion",
            ASOCIACION_ID,
            body,
        )

    assert resultado == respuesta
    base.rpc.assert_called_once_with(
        "registrar_seguimiento_retiro_animal",
        {
            "p_reporte_id": REPORTE_ID,
            "p_resultado_id": RESULTADO_ID,
            "p_usuario_id": USUARIO_ID,
            "p_tipo_actor": "asociacion",
            "p_asociacion_id": ASOCIACION_ID,
            "p_accion": "contacto_oficial_realizado",
            "p_idempotency_key": "seguimiento-123",
            "p_folio": "PA-2026-01",
            "p_nombre_servicio": "Protección Animal",
            "p_destino_informado": None,
            "p_nota": "Se recibió el folio y se esperan indicaciones.",
            "p_evidencia_lugar_id": None,
        },
    )
