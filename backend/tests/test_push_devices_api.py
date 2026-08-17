import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.api import users


def _auth_y_usuario(make_query):
    consulta = make_query(data=[{"id": "usuario-1"}])
    auth = MagicMock()
    auth.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-1")
    )
    auth.table.return_value = consulta
    return auth, consulta


def test_registro_push_autentica_con_anon_y_escribe_con_service_role(
    monkeypatch, make_query
):
    auth, consulta_usuario = _auth_y_usuario(make_query)
    dispositivos = make_query(data=[{"id": "device-1"}])
    dispositivos.upsert.return_value = dispositivos
    admin = MagicMock()
    admin.table.return_value = dispositivos
    monkeypatch.setattr(users, "supabase", auth)
    monkeypatch.setattr(users, "supabase_admin", admin)

    resultado = asyncio.run(
        users.register_push_device(
            users.PushDeviceRequest(token="fcm-token", platform="web"),
            authorization="Bearer access-token",
        )
    )

    assert resultado["status"] == "ok"
    auth.table.assert_called_once_with("usuarios")
    admin.table.assert_called_once_with("dispositivos_push")
    datos = dispositivos.upsert.call_args.args[0]
    assert datos["usuario_id"] == "usuario-1"
    assert datos["last_seen_at"] != "now()"
    assert consulta_usuario.select.called


def test_baja_push_solo_elimina_token_del_usuario_actual(
    monkeypatch, make_query
):
    auth, _ = _auth_y_usuario(make_query)
    dispositivos = make_query(data=[])
    admin = MagicMock()
    admin.table.return_value = dispositivos
    monkeypatch.setattr(users, "supabase", auth)
    monkeypatch.setattr(users, "supabase_admin", admin)

    asyncio.run(
        users.unregister_push_device(
            "fcm-token", authorization="Bearer access-token"
        )
    )

    dispositivos.eq.assert_any_call("usuario_id", "usuario-1")
    dispositivos.eq.assert_any_call("token", "fcm-token")
    dispositivos.eq.assert_any_call("provider", "fcm")
