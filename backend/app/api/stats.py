from datetime import datetime

from fastapi import APIRouter, Header
from app.db.supabase import supabase
from app.utils.animal_shaping import shape_animal_embed
from app.api.admin import _verificar_admin
from app.models.report import ESTADOS_REPORTE_OPERATIVOS, ESTADOS_REPORTE_TERMINALES
from app.services.report_service import _agregar_por_zona

router = APIRouter()

ESTADOS_DUPLICADO = {"duplicado", "duplicado_vinculable", "duplicado_informativo"}


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


def _tiempo_promedio_aceptacion_horas() -> float | None:
    propuestas = supabase.table("propuestas_asignacion").select(
        "reporte_id, respondida_at"
    ).eq("estado", "confirmada").execute()
    filas = [f for f in (propuestas.data or []) if f.get("respondida_at")]
    if not filas:
        return None

    reporte_ids = list({f["reporte_id"] for f in filas})
    reportes = supabase.table("reportes").select(
        "id, created_at"
    ).in_("id", reporte_ids).execute()
    creado_por_id = {r["id"]: r["created_at"] for r in (reportes.data or [])}

    def _parse(valor: str) -> datetime:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))

    diferencias_horas = []
    for fila in filas:
        creado_at = creado_por_id.get(fila["reporte_id"])
        if not creado_at:
            continue
        delta = _parse(fila["respondida_at"]) - _parse(creado_at)
        diferencias_horas.append(delta.total_seconds() / 3600)

    if not diferencias_horas:
        return None
    return round(sum(diferencias_horas) / len(diferencias_horas), 2)


def _agrupar_conteo(valores: list) -> dict:
    conteo: dict = {}
    for valor in valores:
        if valor is None:
            continue
        conteo[valor] = conteo.get(valor, 0) + 1
    return conteo


@router.get("/admin", status_code=200)
async def obtener_stats_admin(authorization: str = Header(None)):
    """Panel de estadísticas para administración (Capa 12).

    Definiciones:
    - casos_activos_actuales: reportes en un estado operativo (no terminal).
    - tiempo_promedio_aceptacion_horas: promedio de horas entre
      reportes.created_at y propuestas_asignacion.respondida_at, para
      propuestas con estado='confirmada'.
    - tasa_duplicados / tasa_fraude_detectado: fracción (0-1) sobre el total
      de reportes. Fraude se define como estado_moderacion='rechazado' —
      es la señal más cercana a "confirmado" (pasó por moderación humana),
      a diferencia de una sospecha automática (phash_alerta) o un motivo de
      denuncia sin confirmar (posible_fraude).
    - recursos_mas_solicitados: top 5 categorías de `necesidades` por conteo.
    - casos_sin_cobertura_por_zona: conteo de reportes en sin_cobertura,
      agrupados por (municipio, colonia).
    - mapa_calor_activo / mapa_calor_historico: reportes agregados por zona
      (misma cuadrícula que el mapa público, ver report_service._agregar_por_zona),
      separados por si su estado es operativo o terminal.
    """
    _verificar_admin(authorization)

    reportes = supabase.table("reportes").select(
        "id, estado_reporte, estado_moderacion, latitud, longitud, "
        "urgency_nivel, municipio, colonia"
    ).execute()
    filas = reportes.data or []
    total = len(filas)

    casos_activos_actuales = sum(
        1 for f in filas if f.get("estado_reporte") in ESTADOS_REPORTE_OPERATIVOS
    )
    duplicados = sum(1 for f in filas if f.get("estado_reporte") in ESTADOS_DUPLICADO)
    fraude = sum(1 for f in filas if f.get("estado_moderacion") == "rechazado")

    sin_cobertura = [f for f in filas if f.get("estado_reporte") == "sin_cobertura"]
    casos_sin_cobertura_por_zona = _agrupar_conteo(
        [(f.get("municipio"), f.get("colonia")) for f in sin_cobertura]
    )

    activos = [f for f in filas if f.get("estado_reporte") in ESTADOS_REPORTE_OPERATIVOS]
    terminales = [f for f in filas if f.get("estado_reporte") in ESTADOS_REPORTE_TERMINALES]

    necesidades = supabase.table("necesidades").select("categoria").execute()
    conteo_categorias = _agrupar_conteo([n.get("categoria") for n in (necesidades.data or [])])
    recursos_mas_solicitados = [
        {"categoria": categoria, "cantidad": cantidad}
        for categoria, cantidad in sorted(
            conteo_categorias.items(), key=lambda item: item[1], reverse=True
        )[:5]
    ]

    return {
        "casos_activos_actuales": casos_activos_actuales,
        "tiempo_promedio_aceptacion_horas": _tiempo_promedio_aceptacion_horas(),
        "tasa_duplicados": round(duplicados / total, 4) if total else 0.0,
        "tasa_fraude_detectado": round(fraude / total, 4) if total else 0.0,
        "recursos_mas_solicitados": recursos_mas_solicitados,
        "casos_sin_cobertura_por_zona": [
            {"municipio": municipio, "colonia": colonia, "cantidad": cantidad}
            for (municipio, colonia), cantidad in casos_sin_cobertura_por_zona.items()
        ],
        "mapa_calor_activo": _agregar_por_zona(activos),
        "mapa_calor_historico": _agregar_por_zona(terminales),
    }