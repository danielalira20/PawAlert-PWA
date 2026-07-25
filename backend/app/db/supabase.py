from threading import local

from supabase import create_client, Client
from app.config import settings


class ThreadLocalSupabaseClient:
    """Entrega un cliente aislado por hilo de FastAPI.

    Los endpoints síncronos se ejecutan en el threadpool de Starlette. Compartir
    un único cliente HTTP/2 entre esos hilos puede provocar errores transitorios
    cuando, por ejemplo, la asociación consulta candidatos al mismo tiempo que
    un voluntario acepta el caso.
    """

    def __init__(self, key: str):
        self._key = key
        self._local = local()

    def _client(self) -> Client:
        cliente = getattr(self._local, "client", None)
        if cliente is None:
            cliente = create_client(settings.supabase_url, self._key)
            self._local.client = cliente
        return cliente

    def __getattr__(self, nombre):
        return getattr(self._client(), nombre)


supabase = ThreadLocalSupabaseClient(settings.supabase_key)
supabase_admin = ThreadLocalSupabaseClient(settings.supabase_service_key)

def get_fresh_client() -> Client:
    """Crea un cliente nuevo y aislado para operaciones de login (sign_in_with_password).
    NO usar el cliente `supabase` compartido para esto: sign_in_with_password guarda
    la sesión dentro del cliente, y como `supabase` es global y se reutiliza en TODO
    el backend, dejaría a todas las peticiones futuras (de cualquier usuario) actuando
    como el último que inició sesión, rompiendo el acceso de lectura para todos."""
    return create_client(settings.supabase_url, settings.supabase_key)
