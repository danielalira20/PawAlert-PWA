
"""La funcion SQL candidatos_para_reporte hace las exclusiones pesadas;
aqui vive el score explicable de 4 componentes y el top 3.
"""
from datetime import datetime

from app.db.supabase import supabase
from app.utils.animal_shaping import shape_animal_embed

from datetime import datetime
from zoneinfo import ZoneInfo

TZ_MEXICO = ZoneInfo("America/Mexico_City")

PESOS = {
    "proximidad": 0.40,
    "compatibilidad": 0.25,
    "disponibilidad": 0.20,
    "carga": 0.15,
}
MAX_ANIMALES_CASA_HOGAR = 2
DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]


def obtener_candidatos(reporte_id: str) -> dict:
    """Devuelve el top 3 con desglose de score, listo para el endpoint."""
    reporte = _obtener_reporte(reporte_id)
    especies_del_caso = {a["tipo_animal"] for a in reporte["animales"] if a.get("tipo_animal")}
    total_animales_caso = sum(a.get("cantidad") or 1 for a in reporte["animales"])

    crudos = supabase.rpc(
        "candidatos_para_reporte", {"p_reporte_id": reporte_id}
    ).execute().data or []

    rechazaron = _voluntarios_que_rechazaron(reporte_id)

    candidatos = []
    for c in crudos:
        if c["usuario_id"] in rechazaron:
            continue  # ya rechazo este caso; no volver a ofrecerselo
        if especies_del_caso and not especies_del_caso.issubset(set(c["especies"] or [])):
            continue  # debe aceptar TODAS las especies del caso
        if c.get("ofrece_casa_hogar") and total_animales_caso > MAX_ANIMALES_CASA_HOGAR:
            continue  # limite fisico de casa-hogar, aplica a interno y externo por igual
        disponible = (c["capacidad_animales"] or 0) - (c["carga_actual"] or 0)
        if disponible < total_animales_caso:
            continue  # filtro de carga, por suma de animales del caso

        desglose = {
            "proximidad": round(_score_proximidad(c["distancia_km"]) * PESOS["proximidad"]),
            "compatibilidad": round(_score_compatibilidad(reporte, c) * PESOS["compatibilidad"]),
            "disponibilidad": round(_score_disponibilidad(c["disponibilidad"]) * PESOS["disponibilidad"]),
            "carga": round(_score_carga(c["capacidad_animales"], c["carga_actual"]) * PESOS["carga"]),
        }
        candidatos.append({
            "voluntario_id": c["voluntario_id"],
            "usuario_id": c["usuario_id"],
            "nombre": c["nombre"],
            "tipo": c["rol"],  # voluntario_interno | voluntario_externo
            "etiqueta": "Voluntario externo verificado"
                        if c["rol"] == "voluntario_externo" else None,
            "distancia_km": float(c["distancia_km"]),
            "score": {"total": sum(desglose.values()), **desglose},
        })

    candidatos.sort(key=lambda x: x["score"]["total"], reverse=True)
    return {"candidatos": candidatos[:3]}


# --- Componentes del score (cada uno devuelve 0-100 SIN peso) ---

def _score_proximidad(distancia_km) -> float:
    """max(0, 100 - km*10): 0km=100, 5km=50, 10km=0."""
    return max(0.0, 100.0 - float(distancia_km) * 10.0)


def _score_compatibilidad(reporte, candidato) -> float:
    """Especie ya es filtro duro (se valida antes de llegar aqui) -- el score
    ahora solo mide tamanio: +100 si el candidato acepta el tamanio (o no hay
    dato), no castiga por dato faltante."""
    tamanios_del_caso = {a["tamanio"] for a in reporte["animales"] if a.get("tamanio")}
    if not tamanios_del_caso or tamanios_del_caso & set(candidato["tamanios"] or []):
        return 100.0
    return 0.0


def _score_disponibilidad(disponibilidad: dict) -> float:
    """100 si el dia y la hora actual caen dentro de lo declarado, 0 si no.
    Formato acordado: {"dias":["lun","mar"],"horarios":[{"de":"09:00","a":"18:00"}]}
    Sin datos declarados -> 0 (quien no declara disponibilidad no compite en este componente)."""
    ahora = datetime.now(TZ_MEXICO)
    dias = (disponibilidad or {}).get("dias") or []
    horarios = (disponibilidad or {}).get("horarios") or []
    if DIAS[ahora.weekday()] not in dias:
        return 0.0
    hora_actual = ahora.strftime("%H:%M")
    for h in horarios:
        if h.get("de", "00:00") <= hora_actual <= h.get("a", "23:59"):
            return 100.0
    return 0.0


def _score_carga(capacidad_animales, carga_actual) -> float:
    """0% de espacio libre -> 0, 100% libre -> 100."""
    capacidad_animales = capacidad_animales or 0
    if capacidad_animales <= 0:
        return 0.0
    disponible = max(0, capacidad_animales - (carga_actual or 0))
    return round(100.0 * disponible / capacidad_animales, 1)


def _obtener_reporte(reporte_id: str) -> dict:
    res = supabase.table("reportes").select(
        "id, asociacion_asignada_id, latitud, longitud, candidatos_presentados_at, "
        "animal(orden, cantidad, tipo_animal_catalogo(clave), tamanio_catalogo(clave), condicion_catalogo(clave))"
    ).eq("id", reporte_id).single().execute()
    data = res.data
    animales_crudos, _ = shape_animal_embed(data.get("animal"))
    data["animales"] = [
        {
            "tipo_animal": (a.get("tipo_animal_catalogo") or {}).get("clave"),
            "tamanio": (a.get("tamanio_catalogo") or {}).get("clave"),
            "condicion": (a.get("condicion_catalogo") or {}).get("clave"),
            "cantidad": a.get("cantidad"),
        }
        for a in animales_crudos
    ]
    return data

def _voluntarios_que_rechazaron(reporte_id: str) -> set:
    """Usuarios que ya rechazaron este caso (leido del historial).
    Evita que el escalamiento o la asociacion les vuelvan a asignar el mismo caso."""
    res = (
        supabase.table("historial_reporte")
        .select("usuario_id")
        .eq("reporte_id", reporte_id)
        .eq("tipo_evento", "voluntario_rechaza")
        .execute()
    )
    return {r["usuario_id"] for r in (res.data or []) if r.get("usuario_id")}