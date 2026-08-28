from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import reports
from app.main import app
from app.models.report import CerrarSeguimientoFallecimientoRequest
from app.services import deceased_followup_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-cierre"}
REPORTE_ID = "20000000-0000-0000-0000-000000000003"
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
        "resultado_final": "contacto_realizado",
        "idempotency_key": "cierre-fallecimiento-123",
        "nota_cierre": "La asociación verificó el expediente y el contacto.",
    }


@pytest.mark.parametrize(
    ("rol", "asociacion_id", "tipo_actor", "asociacion_esperada"),
    [
        ("asociacion", ASOCIACION_ID, "asociacion", ASOCIACION_ID),
        ("staff", ASOCIACION_ID, "asociacion", ASOCIACION_ID),
        ("admin", None, "administracion", None),
    ],
)
def test_endpoint_deriva_actor_de_la_sesion(
    rol: str,
    asociacion_id: str | None,
    tipo_actor: str,
    asociacion_esperada: str | None,
) -> None:
    respuesta = {
        "reporte_id": REPORTE_ID,
        "estado_seguimiento": "cerrado",
        "estado_reporte": "muerto",
    }
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario(rol, asociacion_id),
        ),
        patch.object(
            deceased_followup_service,
            "cerrar_seguimiento_fallecimiento",
            return_value=respuesta,
        ) as cerrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/seguimiento-fallecimiento/cerrar",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == respuesta
    argumentos = cerrar.call_args.args
    assert argumentos[:4] == (
        REPORTE_ID,
        USUARIO_ID,
        tipo_actor,
        asociacion_esperada,
    )
    assert argumentos[4].resultado_final == "contacto_realizado"


@pytest.mark.parametrize("rol", ["reportante", "voluntario_interno", "voluntario_externo"])
def test_endpoint_rechaza_roles_sin_autoridad(rol: str) -> None:
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario(rol, None),
        ),
        patch.object(
            deceased_followup_service,
            "cerrar_seguimiento_fallecimiento",
        ) as cerrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/seguimiento-fallecimiento/cerrar",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    cerrar.assert_not_called()


@pytest.mark.parametrize(
    ("codigo", "mensaje"),
    [
        (
            "revision_fallecimiento_pendiente",
            "Todos los resultados deben revisarse antes del cierre",
        ),
        (
            "duda_critica_impide_cierre_fallecimiento",
            "Existe una duda crítica y el caso no puede cerrarse",
        ),
        (
            "seguimiento_retiro_requerido_para_cierre",
            "Registra al menos una gestión de retiro antes del cierre",
        ),
    ],
)
def test_endpoint_explica_condicion_que_impide_cierre(
    codigo: str,
    mensaje: str,
) -> None:
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario("asociacion"),
        ),
        patch.object(
            deceased_followup_service,
            "cerrar_seguimiento_fallecimiento",
            side_effect=deceased_followup_service.SeguimientoFallecimientoError(
                codigo
            ),
        ),
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/seguimiento-fallecimiento/cerrar",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 409
    assert response.json()["detail"] == mensaje


def test_servicio_envia_contrato_completo_a_rpc() -> None:
    respuesta = {
        "reporte_id": REPORTE_ID,
        "seguimiento_id": "seguimiento-1",
        "estado_seguimiento": "cerrado",
        "estado_reporte": "muerto",
        "resultado_final": "contacto_realizado",
        "reutilizado": False,
    }
    base = MagicMock()
    base.rpc.return_value.execute.return_value = SimpleNamespace(data=respuesta)
    body = CerrarSeguimientoFallecimientoRequest(**_payload())

    with patch.object(deceased_followup_service, "supabase_admin", base):
        resultado = deceased_followup_service.cerrar_seguimiento_fallecimiento(
            REPORTE_ID,
            USUARIO_ID,
            "asociacion",
            ASOCIACION_ID,
            body,
        )

    assert resultado == respuesta
    base.rpc.assert_called_once_with(
        "cerrar_seguimiento_fallecimiento",
        {
            "p_reporte_id": REPORTE_ID,
            "p_usuario_id": USUARIO_ID,
            "p_tipo_actor": "asociacion",
            "p_asociacion_id": ASOCIACION_ID,
            "p_resultado_final": "contacto_realizado",
            "p_idempotency_key": "cierre-fallecimiento-123",
            "p_nota_cierre": (
                "La asociación verificó el expediente y el contacto."
            ),
        },
    )
