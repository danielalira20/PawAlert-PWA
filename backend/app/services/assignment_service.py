from app.db.supabase import supabase

def asignar_asociacion(latitud: float, longitud: float) -> dict | None:
    resultado = supabase.rpc(
        "encontrar_asociacion_cercana",
        {
            "reporte_lat": latitud,
            "reporte_lng": longitud
        }
    ).execute()

    if resultado.data and len(resultado.data) > 0:
        return resultado.data[0]
    return None

def obtener_contactos_emergencia(tipo_animal: str, municipio: str | None) -> list:
    resultado = supabase.table("contactos_emergencia").select("*").eq("activo", True).execute()

    if not resultado.data:
        return []

    contactos_filtrados = [
        c for c in resultado.data
        if (c["tipos_animales"] is None or tipo_animal in c["tipos_animales"])
        and (c["municipio"] is None or municipio is None or c["municipio"].lower() == municipio.lower())
    ]

    return contactos_filtrados[:3]