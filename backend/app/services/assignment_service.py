from app.db.supabase import supabase

def asignar_asociacion(latitud: float, longitud: float, excluir_ids: list[str] | None = None, tipo_animal: str | None = None) -> dict | None:
    resultado = supabase.rpc(
        "encontrar_asociacion_cercana",
        {
            "reporte_lat": latitud,
            "reporte_lng": longitud,
            "excluir_ids": excluir_ids or [],
            "p_tipo_animal": tipo_animal 
        }
    ).execute()

    if resultado.data and len(resultado.data) > 0:
        return resultado.data[0]
    return None

    if resultado.data and len(resultado.data) > 0:
        return resultado.data[0]
    return None

def obtener_contactos_emergencia(tipo_animal: str, municipio: str | None, estado: str | None = None) -> list:
    resultado = supabase.table("contactos_emergencia").select("*").eq("activo", True).execute()

    if not resultado.data:
        return []

    def aplica_tipo(c):
        return c["tipos_animales"] is None or tipo_animal in c["tipos_animales"]

    # Nivel 1 — municipio exacto
    por_municipio = [
        c for c in resultado.data
        if aplica_tipo(c) and c.get("municipio") and municipio
        and c["municipio"].lower() == municipio.lower()
        and not c.get("estado")
    ]
    if por_municipio:
        return por_municipio[:3]

    # Nivel 2 — estado
    por_estado = [
        c for c in resultado.data
        if aplica_tipo(c) and c.get("estado") and estado
        and c["estado"].lower() == estado.lower()
        and not c.get("municipio")
    ]
    if por_estado:
        return por_estado[:3]

    # Nivel 3 — mensaje genérico (lista vacía)
    return []
