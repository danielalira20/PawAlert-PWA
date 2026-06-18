from supabase import create_client, Client
from app.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_key)
supabase_admin: Client = create_client(settings.supabase_url, settings.supabase_service_key)

def get_fresh_client() -> Client:
    """Crea un cliente nuevo y aislado para operaciones de login (sign_in_with_password).
    NO usar el cliente `supabase` compartido para esto: sign_in_with_password guarda
    la sesión dentro del cliente, y como `supabase` es global y se reutiliza en TODO
    el backend, dejaría a todas las peticiones futuras (de cualquier usuario) actuando
    como el último que inició sesión, rompiendo el acceso de lectura para todos."""
    return create_client(settings.supabase_url, settings.supabase_key)

