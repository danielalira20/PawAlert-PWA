from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import MagicMock, patch

from app.db import supabase as supabase_module


def test_cliente_supabase_se_reutiliza_solo_dentro_del_mismo_hilo():
    proxy = supabase_module.ThreadLocalSupabaseClient("clave-prueba")
    barrera = Barrier(2)

    def crear_en_hilo():
        barrera.wait()
        primero = proxy._client()
        segundo = proxy._client()
        assert primero is segundo
        return primero

    with patch.object(
        supabase_module,
        "create_client",
        side_effect=lambda *_: MagicMock(),
    ) as crear:
        with ThreadPoolExecutor(max_workers=2) as executor:
            clientes = list(executor.map(lambda _: crear_en_hilo(), range(2)))

    assert clientes[0] is not clientes[1]
    assert crear.call_count == 2
