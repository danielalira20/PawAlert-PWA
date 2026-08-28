from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import deceased_followup_service


client = TestClient(app)


def test_cron_rechaza_solicitud_sin_secreto() -> None:
    with patch.object(settings, "cron_secret", "cron_test"):
        response = client.post("/internal/deceased-followups/run")

    assert response.status_code == 401


def test_cron_ejecuta_escalamiento_con_limite_controlado() -> None:
    resumen = {
        "procesados": 3,
        "escalados_asociacion": 2,
        "escalados_administracion": 1,
        "notificaciones_encoladas": 4,
    }
    with (
        patch.object(settings, "cron_secret", "cron_test"),
        patch(
            "app.services.deceased_followup_service."
            "escalar_seguimientos_vencidos",
            return_value=resumen,
        ) as escalar,
    ):
        response = client.post(
            "/internal/deceased-followups/run",
            headers={"X-Cron-Secret": "cron_test"},
        )

    assert response.status_code == 200
    assert response.json() == resumen
    escalar.assert_called_once_with(limit=100)


def test_servicio_valida_y_normaliza_respuesta_rpc() -> None:
    execute = MagicMock(return_value=MagicMock(data=[{
        "procesados": 2,
        "escalados_asociacion": 1,
        "escalados_administracion": 1,
        "notificaciones_encoladas": 3,
        "campo_futuro": True,
    }]))
    rpc = MagicMock(return_value=MagicMock(execute=execute))

    with patch.object(deceased_followup_service.supabase_admin, "rpc", rpc):
        resultado = deceased_followup_service.escalar_seguimientos_vencidos(25)

    rpc.assert_called_once_with(
        "escalar_seguimientos_fallecimiento",
        {"p_limit": 25},
    )
    assert resultado == {
        "procesados": 2,
        "escalados_asociacion": 1,
        "escalados_administracion": 1,
        "notificaciones_encoladas": 3,
    }


def test_servicio_rechaza_resumen_inconsistente() -> None:
    execute = MagicMock(return_value=MagicMock(data={
        "procesados": 4,
        "escalados_asociacion": 1,
        "escalados_administracion": 1,
        "notificaciones_encoladas": 2,
    }))
    rpc = MagicMock(return_value=MagicMock(execute=execute))

    with (
        patch.object(deceased_followup_service.supabase_admin, "rpc", rpc),
        patch.object(deceased_followup_service.logger, "exception"),
    ):
        try:
            deceased_followup_service.escalar_seguimientos_vencidos()
        except deceased_followup_service.SeguimientoFallecimientoError as error:
            assert error.codigo == "respuesta_escalamiento_fallecimiento_invalida"
        else:
            raise AssertionError("Se esperaba una respuesta invalida")
