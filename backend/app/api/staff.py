from fastapi import APIRouter, HTTPException, Header
from app.db.supabase import supabase

router = APIRouter()


def _obtener_staff_autenticado(authorization: str | None) -> dict:
    """Valida el JWT y regresa el usuario verificando que sea staff."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.replace("Bearer ", "")
    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    resultado = supabase.table("usuarios").select(
        "id, asociacion_id, rol_id"
    ).eq("auth_user_id", auth_response.user.id).execute()

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario = resultado.data[0]

    # Verificar que el usuario tiene rol de staff
    rol = supabase.table("roles").select("nombre").eq(
        "id", usuario["rol_id"]
    ).execute()

    if not rol.data or rol.data[0]["nombre"] != "staff":
        raise HTTPException(status_code=403, detail="Solo el staff puede acceder a este endpoint")

    return usuario


@router.get("/me/reportes", status_code=200)
async def get_reportes_staff(authorization: str = Header(None)):
    """Devuelve los reportes asignados al staff logueado.

    IMPORTANTE: antes este endpoint excluía 'cerrado' y 'sin_cobertura' (solo
    servía para el dashboard de casos activos). Ahora trae TODOS los reportes
    del staff para poder calcular estadísticas de impacto histórico en Mi
    Perfil — pero los buckets que ya consume el dashboard (pendientes/
    en_accion/completados) se comportan exactamente igual que antes, no se
    les quitó ni agregó nada. Solo se sumó el bucket nuevo `historial`.
    """
    usuario = _obtener_staff_autenticado(authorization)

    resultado = supabase.table("reportes").select(
        "id, estado_reporte, municipio, colonia, calle, referencia, "
        "latitud, longitud, created_at, "
        "asociaciones(nombre, contacto_telefono), "
        "animal(id, sexo, edad_aproximada, descripcion, "
        "tipo_animal_catalogo(clave), condicion_catalogo(clave), tamanio_catalogo(clave), "
        "animal_fotos(foto_url, orden))"
    ).eq("staff_asignado_id", usuario["id"]).order("created_at", desc=True).execute()

    pendientes = []
    en_accion = []
    completados = []
    historial = [] 

    for r in resultado.data or []:
        animal = r.get("animal") or {}
        fotos = animal.get("animal_fotos") or []
        foto_url = None
        if fotos:
            fotos_ordenadas = sorted(fotos, key=lambda f: f.get("orden", 0))
            foto_url = fotos_ordenadas[0]["foto_url"]

        reporte = {
            "id": r["id"],
            "estado_reporte": r.get("estado_reporte"),
            "municipio": r.get("municipio"),
            "colonia": r.get("colonia"),
            "calle": r.get("calle"),
            "referencia": r.get("referencia"),
            "latitud": r.get("latitud"),
            "longitud": r.get("longitud"),
            "created_at": str(r["created_at"]),
            "foto_url": foto_url,
            "asociacion": {
                "nombre": r.get("asociaciones", {}).get("nombre"),
                "telefono": r.get("asociaciones", {}).get("contacto_telefono"),
            },
            "animal": {
                "tipo_animal": animal.get("tipo_animal_catalogo", {}).get("clave"),
                "condicion": animal.get("condicion_catalogo", {}).get("clave"),
                "tamanio": animal.get("tamanio_catalogo", {}).get("clave"),
                "sexo": animal.get("sexo"),
                "edad_aproximada": animal.get("edad_aproximada"),
                "descripcion": animal.get("descripcion"),
            }
        }

        estado = r.get("estado_reporte")
        if estado == "en_camino":
            pendientes.append(reporte)
        elif estado == "en_atencion":
            en_accion.append(reporte)
        elif estado == "rescatado":
            completados.append(reporte)
        elif estado in ("cerrado", "sin_cobertura"):
            historial.append(reporte)

    return {
        "pendientes": pendientes,
        "en_accion": en_accion,
        "completados": completados,
        "historial": historial,
    }