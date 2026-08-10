from datetime import date, datetime, timedelta, timezone
from fastapi import HTTPException
from app.db.supabase import supabase_admin as supabase
from app.services.reputacion_service import reservar_puntos, devolver_puntos

ROLES_ELEGIBLES_CANJE = {"reportante", "voluntario_interno", "voluntario_externo"}

def _validar_elegibilidad_usuario(rol: str | None):
    if not rol or rol not in ROLES_ELEGIBLES_CANJE:
        raise HTTPException(
            status_code=403,
            detail="Tu rol actual no permite canjear recompensas"
        )

def _validar_limites_canje(usuario_id: str, recompensa: dict):
    # Límite global: máximo 2 canjes en los últimos 30 días
    hace_30_dias = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    canjes_recientes = supabase.table("canjes_recompensa").select("id, estado").eq(
        "beneficiario_id", usuario_id
    ).gte("emitido_at", hace_30_dias).neq("estado", "cancelado").neq("estado", "reembolsado").execute()
    
    if len(canjes_recientes.data or []) >= 2:
        raise HTTPException(
            status_code=403,
            detail="Has alcanzado el límite máximo de 2 canjes en los últimos 30 días"
        )

    # Máximo 1 QR activo global (estado="emitido") en todo momento
    canjes_activos = supabase.table("canjes_recompensa").select("id").eq(
        "beneficiario_id", usuario_id
    ).eq("estado", "emitido").limit(1).execute()
    
    if canjes_activos.data:
        raise HTTPException(
            status_code=403,
            detail="Ya tienes un canje activo. Úsalo o espera a que expire antes de solicitar otro."
        )

    # Límite por patrocinador: pequeña=30d, mediana=90d, grande=365d
    dias_limite_patrocinador = 30
    if recompensa["nivel"] == "mediana":
        dias_limite_patrocinador = 90
    elif recompensa["nivel"] == "grande":
        dias_limite_patrocinador = 365

    hace_dias_patrocinador = (datetime.now(timezone.utc) - timedelta(days=dias_limite_patrocinador)).isoformat()

    # Buscar si ya canjeó algo del mismo patrocinador en ese tiempo
    canjes_mismo_patrocinador = supabase.table("canjes_recompensa").select(
        "id", "recompensas!inner(propietario_id)"
    ).eq(
        "beneficiario_id", usuario_id
    ).eq(
        "recompensas.propietario_id", recompensa["propietario_id"]
    ).gte("emitido_at", hace_dias_patrocinador).neq("estado", "cancelado").neq("estado", "reembolsado").limit(1).execute()

    if canjes_mismo_patrocinador.data:
        raise HTTPException(
            status_code=403,
            detail=f"Ya canjeaste una recompensa de este patrocinador en los últimos {dias_limite_patrocinador} días."
        )

def crear_canje(recompensa_id: str, usuario_id: str, rol: str | None) -> dict:
    _validar_elegibilidad_usuario(rol)
    
    recompensa = supabase.table("recompensas").select(
        "id, estado, unidades_disponibles, costo, propietario_id, inicio, vencimiento, nivel"
    ).eq("id", recompensa_id).execute()
    
    if not recompensa.data:
        raise HTTPException(status_code=404, detail="Recompensa no encontrada")
    
    fila_recompensa = recompensa.data[0]
    
    hoy = date.today().isoformat()
    if (fila_recompensa["estado"] != "activa" or 
        fila_recompensa["unidades_disponibles"] <= 0 or
        fila_recompensa["inicio"] > hoy or 
        fila_recompensa["vencimiento"] < hoy):
        raise HTTPException(status_code=400, detail="Esta recompensa ya no está disponible")
    
    _validar_limites_canje(usuario_id, fila_recompensa)
    
    # 1. Reservar los puntos
    try:
        movimiento = reservar_puntos(
            usuario_id=usuario_id,
            rol=rol,
            regla="canje_recompensa",
            tipo_origen="canje",
            evento_origen_id=recompensa_id, # Usamos el ID de la recompensa como origen temporal
            puntos=fila_recompensa["costo"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # 2. Emitir el canje vía RPC de Miguel (reserva inventario y crea el código)
    resultado_rpc = supabase.rpc("emitir_canje_recompensa", {
        "p_recompensa_id": recompensa_id,
        "p_beneficiario_id": usuario_id,
    }).execute()
    
    if not resultado_rpc.data:
        # Falló el inventario (alguien nos ganó la última unidad).
        # Hay que devolver los puntos reservados.
        devolver_puntos(
            usuario_id=usuario_id,
            rol=rol,
            regla="canje_recompensa",
            tipo_origen="canje",
            evento_origen_id=recompensa_id,
            puntos=fila_recompensa["costo"]
        )
        raise HTTPException(status_code=409, detail="No fue posible emitir el canje. Inventario agotado.")
        
    canje = resultado_rpc.data[0] if isinstance(resultado_rpc.data, list) else resultado_rpc.data
    canje_id = canje["id"]
    
    # 3. Establecer la fecha de expiración y vincular el evento_origen_id real de los puntos
    fecha_expiracion = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    
    actualizado = supabase.table("canjes_recompensa").update({
        "fecha_expiracion": fecha_expiracion
    }).eq("id", canje_id).execute()
    
    canje_final = actualizado.data[0] if actualizado.data else canje
    
    # Actualizamos el movimiento de puntos para que apunte al canje_id en lugar de recompensa_id
    # Esto es seguro porque es la reserva de este usuario que acabamos de crear
    if movimiento and "id" in movimiento:
        supabase.table("movimientos_puntos").update({
            "evento_origen_id": canje_id
        }).eq("id", movimiento["id"]).execute()
    else:
        # Fallback por si la RPC no retorna el ID por alguna razon
        supabase.table("movimientos_puntos").update({
            "evento_origen_id": canje_id
        }).eq("usuario_id", usuario_id).eq("evento_origen_id", recompensa_id).eq("tipo_origen", "canje").execute()
    
    return canje_final

def expirar_canjes_vencidos() -> int:
    ahora = datetime.now(timezone.utc).isoformat()
    canjes_vencidos = supabase.table("canjes_recompensa").select(
        "id, beneficiario_id, costo_snapshot, recompensa_id"
    ).eq("estado", "emitido").lt("fecha_expiracion", ahora).execute()
    
    total_expirados = 0
    for canje in (canjes_vencidos.data or []):
        try:
            # 1. Devolver inventario en la tabla recompensas
            # Necesitamos una RPC o hacer la actualización atómica? 
            # La tabla recompensas no tiene un devolver_unidad, hacemos update directo:
            # En la vida real, lo mejor sería una RPC, pero aquí lo manejamos con cuidado.
            recompensa = supabase.table("recompensas").select("unidades_disponibles, estado").eq("id", canje["recompensa_id"]).execute().data[0]
            nuevo_estado = "activa" if recompensa["estado"] == "agotada" else recompensa["estado"]
            supabase.table("recompensas").update({
                "unidades_disponibles": recompensa["unidades_disponibles"] + 1,
                "estado": nuevo_estado
            }).eq("id", canje["recompensa_id"]).execute()
            
            # 2. Cambiar estado a expirado
            supabase.table("canjes_recompensa").update({
                "estado": "expirado"
            }).eq("id", canje["id"]).execute()
            
            # 3. Devolver los puntos reservados
            usuario = supabase.table("usuarios").select("roles(nombre)").eq("id", canje["beneficiario_id"]).execute()
            rol = (usuario.data[0].get("roles") or {}).get("nombre") if usuario.data else None
            
            devolver_puntos(
                usuario_id=canje["beneficiario_id"],
                rol=rol,
                regla="canje_recompensa",
                tipo_origen="canje",
                evento_origen_id=canje["id"],
                puntos=canje["costo_snapshot"]
            )
            
            total_expirados += 1
        except Exception as e:
            print(f"[WARN] No se pudo expirar el canje {canje['id']}: {e}")
            
    return total_expirados

def reembolsar_canje(canje_id: str, motivo: str, admin_id: str) -> dict:
    canje_res = supabase.table("canjes_recompensa").select("*").eq("id", canje_id).execute()
    if not canje_res.data:
        raise HTTPException(status_code=404, detail="Canje no encontrado")
        
    canje = canje_res.data[0]
    if canje["estado"] not in ["confirmado", "cancelado"]:
        raise HTTPException(status_code=400, detail=f"No se puede reembolsar un canje en estado {canje['estado']}")
        
    actualizado = supabase.table("canjes_recompensa").update({
        "estado": "reembolsado",
        "motivo_cancelacion": f"{motivo} (Por Admin: {admin_id})"
    }).eq("id", canje_id).execute()
    
    canje_actualizado = actualizado.data[0]
    
    # Devolver puntos
    usuario = supabase.table("usuarios").select("roles(nombre)").eq("id", canje["beneficiario_id"]).execute()
    rol = (usuario.data[0].get("roles") or {}).get("nombre") if usuario.data else None
    
    devolver_puntos(
        usuario_id=canje["beneficiario_id"],
        rol=rol,
        regla="canje_recompensa",
        tipo_origen="canje",
        evento_origen_id=canje_id,
        puntos=canje["costo_snapshot"]
    )
    
    return canje_actualizado

def obtener_mis_canjes(usuario_id: str) -> list[dict]:
    resultado = supabase.table("canjes_recompensa").select(
        "*, recompensas(nombre, nivel, sucursal_lugar, propietario_id)"
    ).eq("beneficiario_id", usuario_id).order("emitido_at", desc=True).execute()
    return resultado.data or []
