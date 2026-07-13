
"""La funcion SQL candidatos_para_reporte hace las exclusiones pesadas;
aqui vive el score explicable de 4 componentes y el top 3.
"""
from datetime import datetime

from app.db.supabase import supabase

from datetime import datetime
from zoneinfo import ZoneInfo

TZ_MEXICO = ZoneInfo("America/Mexico_City")

PESOS = {
    "proximidad": 0.40,
    "compatibilidad": 0.25,
    "disponibilidad": 0.20,
    "carga": 0.15,
}
MAX_CASOS_SIMULTANEOS = 2
DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]


def obtener_candidatos(reporte_id: str) -> dict:
    """Devuelve el top 3 con desglose de score, listo para el endpoint."""
    reporte = _obtener_reporte(reporte_id)
    crudos = supabase.rpc(
        "candidatos_para_reporte", {"p_reporte_id": reporte_id}
    ).execute().data or []

    rechazaron = _voluntarios_que_rechazaron(reporte_id)

    candidatos = []
    for c in crudos:
        if c["usuario_id"] in rechazaron:
            continue  # ya rechazo este caso; no volver a ofrecerselo
        if c["casos_activos"] >= MAX_CASOS_SIMULTANEOS:
            continue  # filtro de carga

        desglose = {
            "proximidad": round(_score_proximidad(c["distancia_km"]) * PESOS["proximidad"]),
            "compatibilidad": round(_score_compatibilidad(reporte, c) * PESOS["compatibilidad"]),
            "disponibilidad": round(_score_disponibilidad(c["disponibilidad"]) * PESOS["disponibilidad"]),
            "carga": round(_score_carga(c["casos_activos"]) * PESOS["carga"]),
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
    """Especie del reporte en sus especies -> 60. Tamanio -> +40.
    Si el reporte no trae tamanio, los 40 se otorgan (no castigar por dato faltante)."""
    puntos = 0.0
    especie = reporte.get("tipo_animal")
    if especie and especie in (candidato["especies"] or []):
        puntos += 60.0
    tamanio = reporte.get("tamanio")
    if not tamanio or tamanio in (candidato["tamanios"] or []):
        puntos += 40.0
    return puntos


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


def _score_carga(casos_activos: int) -> float:
    """0 casos -> 100, 1 caso -> 50 (2+ ya fue excluido)."""
    return 100.0 if casos_activos == 0 else 50.0


def _obtener_reporte(reporte_id: str) -> dict:
    res = supabase.table("reportes").select(
        "id, tipo_animal, tamanio, condicion, asociacion_asignada_id, "
        "latitud, longitud, candidatos_presentados_at"
    ).eq("id", reporte_id).single().execute()
    return res.data

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