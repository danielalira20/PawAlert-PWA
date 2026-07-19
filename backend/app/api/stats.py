from fastapi import APIRouter
from app.db.supabase import supabase
from app.utils.animal_shaping import shape_animal_embed

router = APIRouter()


@router.get("/generales", status_code=200)
async def obtener_stats_generales():
    """Estadísticas agregadas de toda la plataforma (no de un usuario en
    particular). Visibles para cualquiera en Mi Perfil, sin importar su
    rol. No requiere autenticación: son datos públicos y agregados.

    Definiciones (confirmadas con Jasmin):
    - asociaciones_activas: asociaciones con activo = true y verificado = true
    - animales_rescatados: suma de `cantidad` de los animales de reportes
      con estado_reporte = 'cerrado' (no cuenta filas de reportes)
    - reportes_atendidos: cualquier reporte que ya salió de 'pendiente'
      (asignado, en_camino, en_atencion, rescatado, cerrado, sin_cobertura)
    """
    asociaciones_activas = supabase.table("asociaciones").select(
        "id", count="exact"
    ).eq("activo", True).eq("verificado", True).execute()

    animales_rescatados_data = supabase.table("reportes").select(
        "id, animal(cantidad)"
    ).eq("estado_reporte", "cerrado").execute()

    animales_rescatados = 0
    for r in (animales_rescatados_data.data or []):
        animales_crudos, _ = shape_animal_embed(r.get("animal"))
        animales_rescatados += sum(a.get("cantidad") or 1 for a in animales_crudos)

    reportes_atendidos = supabase.table("reportes").select(
        "id", count="exact"
    ).neq("estado_reporte", "pendiente").execute()

    return {
        "asociaciones_activas": asociaciones_activas.count or 0,
        "reportes_atendidos": reportes_atendidos.count or 0,
        "animales_rescatados": animales_rescatados,
    }