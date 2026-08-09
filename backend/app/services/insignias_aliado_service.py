from datetime import datetime, timezone

from app.db.supabase import supabase_admin as supabase

# "Apoyo crítico", "Recurso multiplicado" y "Comunidad que recompensa" son
# exclusivas de estos dos tipos (regla de negocio de Persona 4) — donante_
# comunitario solo puede ganar "Aliado de impacto" y "Constancia solidaria"
# (esas dos "aplican a todos los aliados", según el spec).
TIPOS_ALIADO_LOCAL_INSTITUCIONAL = {"aliado_local", "patrocinador_institucional"}

# Umbrales de nivel, de mayor a menor — el primero que se alcanza gana.
TIERS_ALIADO_IMPACTO = [(15, "oro"), (5, "plata"), (1, "cobre")]
NIVEL_ORDEN = {"cobre": 1, "plata": 2, "oro": 3}

UMBRAL_APOYO_CRITICO = 3
UMBRAL_MESES_CONSTANCIA = 3
UMBRAL_LOTE_MULTI_ASOCIACION = 2
UMBRAL_CANJES_COMUNIDAD = 10


def _contribuciones_entregadas(usuario_id: str) -> list[dict]:
    """'Entregada' = confirmada_at ya quedó fijo por confirmar_recepcion_qr*
    (red_aliados_service.py) — cubre tanto estado='entregada' (contribución
    directa) como estado='confirmada' cuando viene de un lote (ahí
    'confirmada' YA es el estado final, no uno intermedio). confirmada_at
    solo se llena en el momento de la confirmación física por QR en ambos
    flujos, así que es la señal fiable de "entregada" sin importar el
    nombre del estado. Una contribución 'comprometida', 'rechazada' o
    'retirada' nunca tiene confirmada_at."""
    resultado = supabase.table("contribuciones").select(
        "id, confirmada_at, necesidades(urgencia)"
    ).eq("usuario_id", usuario_id).not_.is_("confirmada_at", "null").execute()
    return resultado.data or []


def _tiene_lote_multi_asociacion_confirmado(perfil_apoyo_id: str) -> bool:
    lotes = supabase.table("lotes").select("id").eq("perfil_apoyo_id", perfil_apoyo_id).execute()
    lote_ids = [fila["id"] for fila in (lotes.data or [])]
    if not lote_ids:
        return False

    asignaciones = supabase.table("lote_asociaciones").select("lote_id").eq(
        "estado", "confirmada"
    ).in_("lote_id", lote_ids).execute()

    conteo_por_lote: dict[str, int] = {}
    for fila in (asignaciones.data or []):
        conteo_por_lote[fila["lote_id"]] = conteo_por_lote.get(fila["lote_id"], 0) + 1

    return any(cuenta >= UMBRAL_LOTE_MULTI_ASOCIACION for cuenta in conteo_por_lote.values())


def _canjes_confirmados(perfil_apoyo_id: str) -> int:
    recompensas = supabase.table("recompensas").select("id").eq(
        "propietario_id", perfil_apoyo_id
    ).execute()
    recompensa_ids = [r["id"] for r in (recompensas.data or [])]
    if not recompensa_ids:
        return 0
    canjes = supabase.table("canjes_recompensa").select("id").in_(
        "recompensa_id", recompensa_ids
    ).eq("estado", "confirmado").execute()
    return len(canjes.data or [])


def _alcanza_meses_consecutivos(fechas_iso: list[str]) -> bool:
    """Índice absoluto de mes (año*12 + mes) para que diciembre→enero
    siga contando como consecutivo."""
    indices = set()
    for fecha in fechas_iso:
        if not fecha:
            continue
        anio, mes = int(fecha[0:4]), int(fecha[5:7])
        indices.add(anio * 12 + mes)

    ordenados = sorted(indices)
    racha = 1
    for i in range(1, len(ordenados)):
        if ordenados[i] == ordenados[i - 1] + 1:
            racha += 1
            if racha >= UMBRAL_MESES_CONSTANCIA:
                return True
        else:
            racha = 1
    return len(ordenados) > 0 and racha >= UMBRAL_MESES_CONSTANCIA


def _upsert_insignia(usuario_id: str, rol: str, codigo: str, nivel: str | None, progreso: int, ahora: str) -> dict:
    """Idempotente — llamarla varias veces con el mismo resultado no
    duplica filas (UNIQUE usuario_id+rol+codigo_insignia) ni retrocede un
    nivel ya alcanzado. `obtenido_at` solo se fija la primera vez;
    `mejorado_at` se actualiza cada vez que sube de nivel."""
    existente = supabase.table("insignias").select("*").eq(
        "usuario_id", usuario_id
    ).eq("rol", rol).eq("codigo_insignia", codigo).execute()

    if not existente.data:
        creada = supabase.table("insignias").insert({
            "usuario_id": usuario_id,
            "rol": rol,
            "codigo_insignia": codigo,
            "nivel": nivel,
            "progreso": progreso,
            "obtenido_at": ahora,
        }).execute()
        return creada.data[0]

    actual = existente.data[0]
    cambios: dict = {"progreso": progreso}
    if nivel and NIVEL_ORDEN.get(nivel, 0) > NIVEL_ORDEN.get(actual.get("nivel") or "", 0):
        cambios["nivel"] = nivel
        cambios["mejorado_at"] = ahora

    actualizada = supabase.table("insignias").update(cambios).eq("id", actual["id"]).execute()
    return actualizada.data[0]


def evaluar_insignias_aliado(usuario_id: str) -> list[dict]:
    """Se llama después de que una contribución/lote queda confirmado por
    QR (ver hooks en red_aliados_service.py). Nunca debe tronar el flujo
    que la llama — quien la invoca la envuelve en try/except, mismo
    criterio que el resto del proyecto: 'la gamificación es secundaria'."""
    perfil = supabase.table("perfil_apoyo").select("id, tipo").eq("usuario_id", usuario_id).execute()
    if not perfil.data:
        return []

    perfil_apoyo_id = perfil.data[0]["id"]
    tipo = perfil.data[0]["tipo"]

    entregadas = _contribuciones_entregadas(usuario_id)
    total_entregadas = len(entregadas)
    ahora = datetime.now(timezone.utc).isoformat()

    resultados: list[dict] = []

    # Aliado de impacto — todos los tipos de perfil_apoyo.
    nivel_impacto = next((nivel for umbral, nivel in TIERS_ALIADO_IMPACTO if total_entregadas >= umbral), None)
    if nivel_impacto:
        resultados.append(_upsert_insignia(usuario_id, tipo, "aliado_de_impacto", nivel_impacto, total_entregadas, ahora))

    if tipo in TIPOS_ALIADO_LOCAL_INSTITUCIONAL:
        criticas = sum(1 for c in entregadas if (c.get("necesidades") or {}).get("urgencia") == "critico")
        if criticas >= UMBRAL_APOYO_CRITICO:
            resultados.append(_upsert_insignia(usuario_id, tipo, "apoyo_critico", None, criticas, ahora))

    if _alcanza_meses_consecutivos([c.get("confirmada_at") for c in entregadas]):
        resultados.append(_upsert_insignia(usuario_id, tipo, "constancia_solidaria", None, total_entregadas, ahora))

    if tipo in TIPOS_ALIADO_LOCAL_INSTITUCIONAL and _tiene_lote_multi_asociacion_confirmado(perfil_apoyo_id):
        resultados.append(_upsert_insignia(usuario_id, tipo, "recurso_multiplicado", None, 1, ahora))

    if tipo in TIPOS_ALIADO_LOCAL_INSTITUCIONAL:
        total_canjes = _canjes_confirmados(perfil_apoyo_id)
        if total_canjes >= UMBRAL_CANJES_COMUNIDAD:
            resultados.append(_upsert_insignia(
                usuario_id, tipo, "comunidad_que_recompensa", None, total_canjes, ahora
            ))

    return resultados


def obtener_mis_insignias_aliado(usuario_id: str) -> list[dict]:
    """Solo las insignias del rol de aliado del usuario — si en el futuro
    el mismo usuario también tiene insignias de reportante/voluntario
    (Personas 1-3), esas viven bajo otro `rol` y no se mezclan aquí.

    Antes de consultar se evalúa de forma tolerante a fallos para recuperar
    contribuciones históricas que fueron confirmadas antes de que existiera
    el motor de insignias. La evaluación es idempotente, por lo que abrir el
    panel varias veces no crea duplicados ni retrocede niveles."""
    try:
        evaluar_insignias_aliado(usuario_id)
    except Exception:
        # La gamificación es secundaria: un fallo nunca debe impedir abrir
        # el perfil ni consultar las insignias que ya existan.
        pass

    perfil = supabase.table("perfil_apoyo").select("tipo").eq("usuario_id", usuario_id).execute()
    if not perfil.data:
        return []

    tipo = perfil.data[0]["tipo"]
    resultado = supabase.table("insignias").select("*").eq(
        "usuario_id", usuario_id
    ).eq("rol", tipo).order("obtenido_at").execute()
    return resultado.data or []
