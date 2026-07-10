from fastapi import APIRouter
from app.db.supabase import supabase

router = APIRouter()


@router.get("/generales", status_code=200)
async def obtener_stats_generales():
    """Estadísticas agregadas de toda la plataforma (no de un usuario en
    particular). Visibles para cualquiera en Mi Perfil, sin importar su
    rol. No requiere autenticación: son datos públicos y agregados.

    Definiciones (confirmadas con Jasmin):
    - asociaciones_activas: asociaciones con activo = true
    - animales_rescatados: reportes con estado_reporte = 'cerrado'
    - reportes_atendidos: cualquier reporte que ya salió de 'pendiente'
      (asignado, en_camino, en_atencion, rescatado, cerrado, sin_cobertura)
    """
    asociaciones_activas = supabase.table("asociaciones").select(
        "id", count="exact"
    ).eq("activo", True).execute()

    animales_rescatados = supabase.table("reportes").select(
        "id", count="exact"
    ).eq("estado_reporte", "cerrado").execute()

    reportes_atendidos = supabase.table("reportes").select(
        "id", count="exact"
    ).neq("estado_reporte", "pendiente").execute()

    return {
        "asociaciones_activas": asociaciones_activas.count or 0,
        "reportes_atendidos": reportes_atendidos.count or 0,
        "animales_rescatados": animales_rescatados.count or 0,
    }