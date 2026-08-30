from unittest.mock import MagicMock, patch

from app.services import deceased_followup_service


def test_auditoria_envia_actor_y_total_al_rpc() -> None:
    base = MagicMock()

    with patch.object(deceased_followup_service, "supabase_admin", base):
        deceased_followup_service._auditar_contactos_retiro_mostrados(
            "reporte-1",
            "usuario-1",
            "voluntario",
            2,
        )

    base.rpc.assert_called_once_with(
        "registrar_contactos_retiro_mostrados",
        {
            "p_reporte_id": "reporte-1",
            "p_usuario_id": "usuario-1",
            "p_tipo_actor": "voluntario",
            "p_total_contactos": 2,
        },
    )
    base.rpc.return_value.execute.assert_called_once_with()


def test_auditoria_no_se_intenta_sin_contactos() -> None:
    base = MagicMock()

    with patch.object(deceased_followup_service, "supabase_admin", base):
        deceased_followup_service._auditar_contactos_retiro_mostrados(
            "reporte-1",
            "usuario-1",
            "asociacion",
            0,
        )

    base.rpc.assert_not_called()


def test_error_de_auditoria_no_bloquea_el_flujo() -> None:
    base = MagicMock()
    base.rpc.side_effect = RuntimeError("servicio no disponible")

    with patch.object(deceased_followup_service, "supabase_admin", base):
        deceased_followup_service._auditar_contactos_retiro_mostrados(
            "reporte-1",
            "usuario-1",
            "administracion",
            1,
        )
