from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.services import clip_gray_scheduler_service


def test_scheduler_activa_y_libera_cada_claim():
    with (
        patch.object(
            clip_gray_scheduler_service,
            "_claim_due",
            return_value=["reporte-1", "reporte-2"],
        ),
        patch.object(
            clip_gray_scheduler_service,
            "activar_reporte_por_vencimiento_clip",
        ) as activar,
        patch.object(clip_gray_scheduler_service, "_release_claim") as liberar,
    ):
        resultado = clip_gray_scheduler_service.procesar_vencimientos_clip()

    assert resultado == {
        "reclamados": 2,
        "activados": 2,
        "omitidos": 0,
        "fallidos": 0,
    }
    assert activar.call_count == 2
    assert liberar.call_count == 2


def test_scheduler_aisla_conflictos_y_errores():
    with (
        patch.object(
            clip_gray_scheduler_service,
            "_claim_due",
            return_value=["conflicto", "fallo", "correcto"],
        ),
        patch.object(
            clip_gray_scheduler_service,
            "activar_reporte_por_vencimiento_clip",
            side_effect=[
                HTTPException(status_code=409, detail="cambio de estado"),
                RuntimeError("fallo temporal"),
                {"estado": "asignado"},
            ],
        ),
        patch.object(clip_gray_scheduler_service, "_release_claim") as liberar,
    ):
        resultado = clip_gray_scheduler_service.procesar_vencimientos_clip()

    assert resultado == {
        "reclamados": 3,
        "activados": 1,
        "omitidos": 1,
        "fallidos": 1,
    }
    assert liberar.call_count == 3


def test_claim_usa_rpc_privada_con_token_y_limite():
    supabase_admin = MagicMock()
    llamada = MagicMock()
    llamada.execute.return_value = SimpleNamespace(
        data=[{"reporte_id": "reporte-1"}]
    )
    supabase_admin.rpc.return_value = llamada

    with patch.object(
        clip_gray_scheduler_service, "supabase_admin", supabase_admin
    ):
        resultado = clip_gray_scheduler_service._claim_due("token-1", 25)

    assert resultado == ["reporte-1"]
    supabase_admin.rpc.assert_called_once_with(
        "claim_due_clip_gray_reports",
        {"p_claim_token": "token-1", "p_limit": 25},
    )
