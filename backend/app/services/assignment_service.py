from app.db.supabase import supabase, supabase_admin

def asignar_asociacion(
    latitud: float,
    longitud: float,
    excluir_ids: list[str] | None = None,
    tipos_animales: list[str] | None = None,
    es_critico: bool = False,
) -> dict | None:
    resultado = supabase_admin.rpc(
        "encontrar_asociacion_operativa",
        {
            "reporte_lat": latitud,
            "reporte_lng": longitud,
            "excluir_ids": excluir_ids or [],
            "p_tipos_animales": tipos_animales,
            "p_es_critico": es_critico,
        }
    ).execute()

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

from datetime import datetime, timezone

def procesar_timeouts_asociaciones() -> dict:
    """
    Busca asignaciones en estado 'notificada' que hayan superado
    el timeout de la asociación, las expira y busca la siguiente opción.
    Implementa bloqueo optimista para evitar condiciones de carrera.
    """
    # 1. Obtener asignaciones pendientes con info de reporte y asociación
    asignaciones = supabase_admin.table("reporte_asignaciones").select(
        "id, reporte_id, asociacion_id, assigned_at, "
        "asociaciones(timeout_grave, timeout_herido, timeout_estable, nombre), "
        "reportes(animal(condicion_catalogo(clave)), latitud, longitud, municipio)"
    ).eq("estado", "notificada").execute()

    if not asignaciones.data:
        return {"procesados": 0, "reasignados": 0, "sin_cobertura": 0}

    procesados = 0
    reasignados = 0
    sin_cobertura = 0
    ahora = datetime.now(timezone.utc)

    for asig in asignaciones.data:
        reporte = asig.get("reportes") or {}
        animales = reporte.get("animal") or []
        condiciones = [a.get("condicion_catalogo", {}).get("clave") for a in animales if a.get("condicion_catalogo")]

        # Determinar tiempo límite según gravedad
        if "grave" in condiciones:
            timeout_minutos = asig["asociaciones"].get("timeout_grave", 10)
        elif "herido" in condiciones:
            timeout_minutos = asig["asociaciones"].get("timeout_herido", 30)
        else:
            timeout_minutos = asig["asociaciones"].get("timeout_estable", 60)

        asignado_en = datetime.fromisoformat(asig["assigned_at"].replace("Z", "+00:00"))
        minutos_transcurridos = (ahora - asignado_en).total_seconds() / 60.0

        if minutos_transcurridos > timeout_minutos:
            procesados += 1
            reporte_id = asig["reporte_id"]
            asociacion_actual_id = asig["asociacion_id"]

            # 2. PROTECCIÓN DE CONCURRENCIA (Bloqueo Optimista)
            # Solo actualiza si el estado SIGUE SIENDO "notificada". Si la asociación
            # aceptó el reporte en este mismo milisegundo, la BD rechaza este update.
            update_asig = supabase_admin.table("reporte_asignaciones").update({
                "estado": "expirada"
            }).eq("id", asig["id"]).eq("estado", "notificada").select().execute()

            # Si devuelve lista vacía, alguien nos ganó y ya no debemos tocar este reporte
            if not update_asig.data:
                continue 

            # Registrar en historial que se les acabó el tiempo
            supabase_admin.table("historial_reporte").insert({
                "reporte_id": reporte_id,
                "tipo_evento": "asignacion_expirada",
                "descripcion": f"El tiempo de respuesta de {asig['asociaciones']['nombre']} se agotó.",
                "datos_extra": {"asociacion_id": asociacion_actual_id, "timeout_aplicado": timeout_minutos}
            }).execute()

            # 3. Obtener historial para no volver a asignárselo a los que ya expiraron/rechazaron
            historial = supabase_admin.table("reporte_asignaciones").select("asociacion_id").eq("reporte_id", reporte_id).execute()
            excluir_ids = [h["asociacion_id"] for h in (historial.data or [])]

            # 4. Llamar al Stored Procedure SQL para encontrar la siguiente
            nueva_aso = asignar_asociacion(
                latitud=reporte["latitud"],
                longitud=reporte["longitud"],
                excluir_ids=excluir_ids,
                es_critico="grave" in condiciones
            )

            if nueva_aso:
                # Se reasigna exitosamente a la siguiente asociación
                supabase_admin.table("reportes").update({
                    "asociacion_asignada_id": nueva_aso["id"]
                }).eq("id", reporte_id).execute()

                estado_notificada_id = supabase_admin.table("asignacion_estados").select("id").eq("clave", "notificada").execute()
                
                supabase_admin.table("reporte_asignaciones").insert({
                    "reporte_id": reporte_id,
                    "asociacion_id": nueva_aso["id"],
                    "estado_id": estado_notificada_id.data[0]["id"] if estado_notificada_id.data else None,
                    "estado": "notificada",
                }).execute()

                supabase_admin.table("historial_reporte").insert({
                    "reporte_id": reporte_id,
                    "tipo_evento": "reasignacion_automatica",
                    "descripcion": f"Reasignado automáticamente a {nueva_aso['nombre']} por falta de respuesta.",
                }).execute()
                reasignados += 1
            else:
                # 5. ESCALAMIENTO A ADMINISTRACIÓN (Sin cobertura)
                estado_sin_cobertura_id = supabase_admin.table("reporte_estados").select("id").eq("clave", "sin_cobertura").execute()
                
                update_rep = supabase_admin.table("reportes").update({
                    "asociacion_asignada_id": None,
                    "estado_reporte": "sin_cobertura",
                    "estado_cobertura": None,
                    "estado_id": estado_sin_cobertura_id.data[0]["id"] if estado_sin_cobertura_id.data else None
                }).eq("id", reporte_id).eq("estado_reporte", "asignado").select().execute()

                if update_rep.data:
                    supabase_admin.table("historial_reporte").insert({
                        "reporte_id": reporte_id,
                        "tipo_evento": "sin_cobertura",
                        "descripcion": "No hay más asociaciones disponibles en la zona tras expirar el tiempo.",
                    }).execute()

                    # Escalar insertando en la tabla de casos administrativos
                    supabase_admin.table("casos_administrativos").insert({
                        "reporte_id": reporte_id,
                        "tipo": "reporte_sin_coordinadora",
                        "prioridad": "alta",
                        "detalle": "Todas las asociaciones compatibles expiraron o rechazaron el caso. Requiere intervención manual.",
                    }).execute()
                    sin_cobertura += 1

    return {
        "procesados_por_timeout": procesados,
        "reasignados_exitosamente": reasignados,
        "escalados_a_administracion": sin_cobertura
    }