from app.db.supabase import supabase_admin
from app.services.coverage_service import _distancia_km
from app.services.push_notification_service import queue_and_send_push

reporte_id = "6a972789-2058-40fe-94ce-aa12c18b93bd"
latitud = 19.0414
longitud = -98.2063

print("Buscando voluntarios...")
voluntarios = supabase_admin.table("voluntarios").select("usuario_id, capacidades(latitud, longitud, radio_max_km)").eq("estado", "activo_nivel_2").eq("disponible_operativamente", True).execute()

for vol in voluntarios.data:
    cap = vol.get("capacidades") or {}
    if isinstance(cap, list): 
        cap = cap[0] if cap else {}
    
    v_lat = cap.get("latitud")
    v_lon = cap.get("longitud")
    v_radio = cap.get("radio_max_km") or 10
    
    if v_lat and v_lon:
        dist = _distancia_km(float(v_lat), float(v_lon), latitud, longitud)
        if dist <= float(v_radio):
            print(f"✅ ¡Voluntario {vol['usuario_id']} encontrado a {round(dist, 2)} km!")
            try:
                res = queue_and_send_push(
                    usuario_id=vol["usuario_id"],
                    tipo_evento="caso_cercano",
                    idempotency_key=f"caso_cercano:{reporte_id}:{vol['usuario_id']}",
                    payload={"mensaje": "Test de consola", "reporte_id": reporte_id},
                    reporte_id=reporte_id
                )
                print(f"👉 Resultado de la inserción: {res}")
            except Exception as e:
                print(f"❌ Error al insertar: {e}")