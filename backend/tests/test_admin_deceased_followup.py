from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import admin
from app.main import app
from app.models.report import RevisionResultadoSinVidaRequest
from app.services import deceased_followup_service


client = TestClient(app)


def _admin() -> dict:
    return {"id": "admin-1", "roles": {"nombre": "admin"}}


def test_listado_admin_solo_usa_bandeja_escalada() -> None:
    casos = [{"reporte_id": "reporte-1", "estado": "escalado_administracion"}]
    with (
        patch.object(admin, "_verificar_admin", return_value=_admin()),
        patch.object(
            deceased_followup_service,
            "listar_seguimientos_administracion",
            return_value=casos,
        ) as listar,
    ):
        response = client.get(
            "/admin/seguimientos-fallecimiento",
            headers={"Authorization": "Bearer test"},
        )

    assert response.status_code == 200
    assert response.json() == casos
    listar.assert_called_once_with()


def test_admin_puede_consultar_detalle_escalado() -> None:
    detalle = {"seguimiento": {"estado": "escalado_administracion"}}
    with (
        patch.object(admin, "_verificar_admin", return_value=_admin()),
        patch.object(
            deceased_followup_service,
            "obtener_detalle_seguimiento_administracion",
            return_value=detalle,
        ) as obtener,
    ):
        response = client.get(
            "/admin/seguimientos-fallecimiento/reporte-1",
            headers={"Authorization": "Bearer test"},
        )

    assert response.status_code == 200
    assert response.json() == detalle
    obtener.assert_called_once_with("reporte-1")


def test_admin_puede_revisar_resultado_escalado() -> None:
    resultado = {
        "reporte_id": "reporte-1",
        "resultado_id": "resultado-1",
        "estado_resultado": "sin_vida_confirmado",
    }
    with (
        patch.object(admin, "_verificar_admin", return_value=_admin()),
        patch.object(
            deceased_followup_service,
            "revisar_resultado_administracion",
            return_value=resultado,
        ) as revisar,
    ):
        response = client.post(
            "/admin/seguimientos-fallecimiento/reporte-1/resultados/"
            "resultado-1/revision",
            headers={"Authorization": "Bearer test"},
            json={"decision": "confirmar", "notas": "Revisión administrativa"},
        )

    assert response.status_code == 200
    argumentos = revisar.call_args.args
    assert argumentos[:3] == ("reporte-1", "resultado-1", "admin-1")
    assert isinstance(argumentos[3], RevisionResultadoSinVidaRequest)


def test_admin_no_puede_abrir_un_seguimiento_no_escalado() -> None:
    with (
        patch.object(admin, "_verificar_admin", return_value=_admin()),
        patch.object(
            deceased_followup_service,
            "obtener_detalle_seguimiento_administracion",
            side_effect=deceased_followup_service.SeguimientoFallecimientoError(
                "seguimiento_no_encontrado"
            ),
        ),
    ):
        response = client.get(
            "/admin/seguimientos-fallecimiento/reporte-1",
            headers={"Authorization": "Bearer test"},
        )

    assert response.status_code == 404
