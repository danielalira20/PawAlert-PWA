"""
Motor de reputación (Persona 1 - Jass): puntos, trust score e insignias.

Implementación real sobre las funciones SQL de 0048_reputacion_reportante.sql
(que a su vez viven sobre el esquema de 0045/0046 de Miguel, y sobre el
ajuste de CHECKs de 0047_gamificacion_ajustes.sql). Sigue el
mismo estilo que insignias_aliado_service.py: cliente supabase_admin,
import diferido en los puntos de enganche, dict simple para reglas.

A diferencia del patrón de Miguel (except Exception: pass, silencioso),
aquí se usa print(f"[WARN] ...") — decisión explícita del equipo, porque
estas funciones mueven puntos canjeables y se quiere rastro de fallos.

TODO antes de mergear a migracion:
- Correr 0047_gamificacion_ajustes.sql y 0048_reputacion_reportante.sql
  manualmente en Supabase (0045/0046 de Miguel deben estar corridas
  primero).
- Confirmar con el equipo si conclusion_clave se agrega en frontend
  (AssociationStatusScreen.tsx / StaffAsignacionScreen.tsx) antes de
  reemplazar la comparación por string literal de CONCLUSIONES_VALIDAS.
"""

from datetime import datetime, timezone
from uuid import UUID

from app.db.supabase import supabase_admin as supabase

# ============================================================
# Catálogo de reglas del reportante (documento de asignación de tareas).
# Vive aquí, junto al servicio que lo usa — mismo espíritu que
# CONDICION_SEVERIDAD en animal_shaping.py, sin capa extra de indirección.
# ============================================================

ROL_REPORTANTE = "reportante"
# Interno y externo se guardan por separado (ver 0047_gamificacion_ajustes.sql,
# sección 1/1b) porque una cuenta nunca transiciona de un tipo al otro:
# no hay riesgo de "resetear" historial al cambiar de tipo, ya que ese
# cambio no existe hoy en el producto. Persona 2 (Daniela) usa
# ROL_VOLUNTARIO_INTERNO, Persona 3 (Diego) usa ROL_VOLUNTARIO_EXTERNO.
ROL_VOLUNTARIO_INTERNO = "voluntario_interno"
ROL_VOLUNTARIO_EXTERNO = "voluntario_externo"

REGLA_BONO_BIENVENIDA = "bono_bienvenida"
REGLA_REPORTE_VALIDO = "reporte_valido"
REGLA_TRUST_REPORTE_VALIDADO = "trust_reporte_validado"
REGLA_TRUST_DESENLACE = "trust_desenlace_confirmado"
REGLA_TRUST_RACHA_10 = "trust_racha_10_validos"
REGLA_REPORTE_VALIDO_REVERTIDO = "reporte_valido_revertido"
REGLA_TRUST_REPORTE_FALSO = "trust_reporte_falso_confirmado"
# Regla real que confirmar_incidente_atomico escribe desde 0051 cuando
# se confirma un incidente tipo 'reporte_falso' para rol reportante
# ('incidente_confirmado_<clave>'). REGLA_TRUST_REPORTE_FALSO de arriba
# quedo sin uso tras migrar procesar_reporte_falso_confirmado al
# sistema de Incidentes (era la regla de la reduccion directa vieja,
# bloqueada por 0050) -- se conserva solo por si algun movimiento
# historico previo a la migracion todavia la referencia.
REGLA_INCIDENTE_REPORTE_FALSO = "incidente_confirmado_reporte_falso"

# Bono único de bienvenida/primer aporte: +30. Antes eran dos reglas
# separadas (bono_bienvenida + primer_aporte_verificado, 30+30=60) según
# un documento anterior; se fusionaron en una sola por instrucción
# explícita del documento de asignación más reciente, para evitar doble
# conteo. El primer reporte exitoso entrega 50 puntos (30 + 20 del
# reporte válido), no 80.
PUNTOS_BONO_BIENVENIDA = 30
PUNTOS_REPORTE_VALIDO = 20
LIMITE_REPORTES_VALIDOS_MES = 5

TRUST_INCREMENTO_VALIDADO = 3
TRUST_INCREMENTO_DESENLACE = 2
TRUST_INCREMENTO_RACHA = 10
TRUST_LIMITE_INCREMENTO_MES_REPORTANTE = 15
# Sin uso funcional desde la migracion a incidentes_service (el valor
# real ahora vive en incidente_tipos_catalogo, clave='reporte_falso',
# rol='reportante'). Se conserva como referencia -- si algun dia no
# coincide con el catalogo, es señal de que uno de los dos quedo
# desactualizado.
TRUST_REDUCCION_FALSO_CONFIRMADO = 25

# Reglas del voluntario interno (Persona 2). Estos valores provienen de
# la propuesta aprobada por el equipo. Los puntos de enganche se mantienen
# aquí para que los endpoints solo notifiquen el evento confirmado y no
# dupliquen reglas de gamificación.
REGLA_BUSQUEDA_DOCUMENTADA_INTERNA = "busqueda_documentada_interna"
REGLA_TRUST_BUSQUEDA_DOCUMENTADA_INTERNA = "trust_busqueda_documentada_interna"
REGLA_LLEGADA_REFUGIO_INTERNA = "llegada_refugio_interna"
REGLA_BONO_VOLUNTARIO_INTERNO = "postulacion_interna_aprobada"
REGLA_TRUST_RESPUESTA_PROPUESTA_INTERNA = "trust_respuesta_propuesta_interna"
REGLA_RESCATE_COMPLETADO_INTERNO = "rescate_completado_interno"
REGLA_TRUST_RESCATE_COMPLETADO_INTERNO = "trust_rescate_completado_interno"
PUNTOS_BUSQUEDA_DOCUMENTADA_INTERNA = 15
TRUST_BUSQUEDA_DOCUMENTADA_INTERNA = 2
PUNTOS_LLEGADA_REFUGIO_INTERNA = 5
PUNTOS_BONO_VOLUNTARIO_INTERNO = 30
TRUST_RESPUESTA_PROPUESTA_INTERNA = 1
LIMITE_RESPUESTAS_PROPUESTA_MES = 5
PUNTOS_RESCATE_COMPLETADO_INTERNO = 40
TRUST_RESCATE_COMPLETADO_INTERNO = 5
TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO = 20

# conclusion es texto libre de UI (OPCIONES_CIERRE en AssociationStatusScreen.tsx
# / StaffAsignacionScreen.tsx), sin catálogo en backend. Comparar contra esto
# es un riesgo aceptado temporalmente — ver TODO arriba.
CONCLUSIONES_VALIDAS = {
    "Animal rescatado y estable",
    "Animal en tratamiento veterinario",
    "Animal en hogar temporal",
    "Animal adoptado",
}

TIPO_ORIGEN_REPORTE = "reporte"
TIPO_ORIGEN_MODERACION = "moderacion"
TIPO_ORIGEN_BUSQUEDA = "busqueda_no_localizado"
TIPO_ORIGEN_HITO_RESCATE = "hito_rescate"
TIPO_ORIGEN_POSTULACION = "postulacion"
TIPO_ORIGEN_PROPUESTA_ASIGNACION = "propuesta_asignacion"


# ============================================================
# Contrato genérico (llamado también por Persona 2/3/5 con sus propias
# reglas/tipo_origen).
# ============================================================

def otorgar_puntos(
    usuario_id: str,
    rol: str,
    regla: str,
    tipo_origen: str,
    evento_origen_id: str,
    puntos: int,
    limite_ocurrencias_mes: int | None = None,
) -> dict | None:
    """Otorga puntos de forma idempotente. Retorna None si ya se había
    otorgado para este (regla, evento_origen_id), o si se alcanzó el
    límite mensual de ocurrencias (en ese caso se loguea, no se
    propaga la excepción — es un "no toca pagar esta vez", no un error)."""
    try:
        resultado = supabase.rpc("otorgar_puntos_atomico", {
            "p_usuario_id": usuario_id,
            "p_rol": rol,
            "p_regla": regla,
            "p_tipo_origen": tipo_origen,
            "p_evento_origen_id": evento_origen_id,
            "p_puntos": puntos,
            "p_limite_ocurrencias_mes": limite_ocurrencias_mes,
        }).execute()
        return resultado.data[0] if resultado.data else None
    except Exception as e:
        print(f"[WARN] otorgar_puntos fallo (usuario={usuario_id}, regla={regla}): {e}")
        return None


def reservar_puntos(
    usuario_id: str,
    rol: str,
    regla: str,
    tipo_origen: str,
    evento_origen_id: str,
    puntos: int,
) -> dict:
    """Aparta puntos del saldo disponible. A diferencia de otorgar_puntos,
    SÍ propaga la excepción (SaldoInsuficiente / duplicado no aplica aquí
    porque la propia RPC retorna el movimiento existente si ya se
    procesó) — quien reserva (ej. Persona 5 al crear un canje) necesita
    saber si falló para no crear el canje sin respaldo de puntos."""
    resultado = supabase.rpc("reservar_puntos_atomico", {
        "p_usuario_id": usuario_id,
        "p_rol": rol,
        "p_regla": regla,
        "p_tipo_origen": tipo_origen,
        "p_evento_origen_id": evento_origen_id,
        "p_puntos": puntos,
    }).execute()
    if not resultado.data:
        raise ValueError("No fue posible reservar los puntos")
    return resultado.data[0]


def devolver_puntos(
    usuario_id: str,
    rol: str,
    regla: str,
    tipo_origen: str,
    evento_origen_id: str,
    puntos: int,
) -> dict | None:
    try:
        resultado = supabase.rpc("devolver_puntos_atomico", {
            "p_usuario_id": usuario_id,
            "p_rol": rol,
            "p_regla": regla,
            "p_tipo_origen": tipo_origen,
            "p_evento_origen_id": evento_origen_id,
            "p_puntos": puntos,
        }).execute()
        return resultado.data[0] if resultado.data else None
    except Exception as e:
        print(f"[WARN] devolver_puntos fallo (usuario={usuario_id}, regla={regla}): {e}")
        return None


def revertir_puntos(
    usuario_id: str,
    rol: str,
    regla: str,
    tipo_origen: str,
    evento_origen_id: str,
    puntos: int,
) -> dict | None:
    """Corrección administrativa: resta puntos ya otorgados porque el
    evento que los originó resultó fraudulento (ej. reporte marcado
    falso por moderación después de haber pagado). `regla` debe ser
    distinta a la regla del otorgamiento original (ver comentario en
    0048_reputacion_reportante.sql)."""
    try:
        resultado = supabase.rpc("revertir_puntos_atomico", {
            "p_usuario_id": usuario_id,
            "p_rol": rol,
            "p_regla": regla,
            "p_tipo_origen": tipo_origen,
            "p_evento_origen_id": evento_origen_id,
            "p_puntos": puntos,
        }).execute()
        return resultado.data[0] if resultado.data else None
    except Exception as e:
        print(f"[WARN] revertir_puntos fallo (usuario={usuario_id}, regla={regla}): {e}")
        return None


def ajustar_trust_score(
    usuario_id: str,
    rol: str,
    tipo: str,
    valor: int,
    regla: str,
    motivo: str | None,
    tipo_origen: str,
    evento_origen_id: str | None,
    responsable_confirmacion_id: str | None = None,
    limite_incremento_mes: int | None = None,
) -> dict | None:
    """IMPORTANTE (desde 0050_bloquear_reduccion_directa.sql): si
    tipo='reduccion', la RPC ahora RECHAZA la llamada a menos que
    tipo_origen sea exactamente 'incidente'. La unica via legitima para
    restar trust score es incidentes_service.registrar_incidente ->
    incidentes_service.confirmar_incidente -- ese flujo ya llama a esta
    misma funcion internamente con tipo_origen='incidente'. NO llames
    esta funcion directo con tipo='reduccion' desde Persona 2/3: la RPC
    va a fallar (el error queda atrapado por el try/except de abajo y
    se loguea con [WARN], no rompe el flujo llamador, pero tampoco
    aplica la reduccion -- si ves ese warning en logs, es señal de que
    alguien esta usando el camino viejo por error).

    Los incrementos (tipo='incremento') no tienen esta restriccion y
    siguen siendo directos, como siempre.
    """
    try:
        resultado = supabase.rpc("ajustar_trust_score_atomico", {
            "p_usuario_id": usuario_id,
            "p_rol": rol,
            "p_tipo": tipo,
            "p_valor": valor,
            "p_regla": regla,
            "p_motivo": motivo,
            "p_tipo_origen": tipo_origen,
            "p_evento_origen_id": evento_origen_id,
            "p_responsable_confirmacion_id": responsable_confirmacion_id,
            "p_limite_incremento_mes": limite_incremento_mes,
        }).execute()
        return resultado.data if isinstance(resultado.data, dict) else (resultado.data[0] if resultado.data else None)
    except Exception as e:
        print(f"[WARN] ajustar_trust_score fallo (usuario={usuario_id}, regla={regla}): {e}")
        return None


def consultar_saldo(usuario_id: str, rol: str) -> int:
    resultado = (
        supabase.table("movimientos_puntos")
        .select("puntos")
        .eq("usuario_id", usuario_id)
        .eq("rol", rol)
        .execute()
    )
    return sum(fila["puntos"] for fila in (resultado.data or []))


def evaluar_insignias_reportante(usuario_id: str) -> list[dict]:
    """Vigía comunitario (1/5/15 reportes válidos), Impacto real (3
    reportes propios con desenlace válido). Sigue el mismo patrón que
    evaluar_insignias_aliado (Miguel): calcula desde las tablas de
    origen, no desde movimientos_puntos, y hace upsert solo de lo que
    cambió. Evidencia confiable queda pendiente (ver nota abajo)."""
    try:
        actualizadas: list[dict] = []

        conteo_validos = (
            supabase.table("movimientos_puntos")
            .select("id", count="exact")
            .eq("usuario_id", usuario_id)
            .eq("rol", ROL_REPORTANTE)
            .eq("regla", REGLA_REPORTE_VALIDO)
            .eq("tipo_movimiento", "otorgado")
            .execute()
        )
        total_validos = conteo_validos.count or 0
        nivel_vigia = (
            "oro" if total_validos >= 15 else
            "plata" if total_validos >= 5 else
            "cobre" if total_validos >= 1 else None
        )
        if nivel_vigia:
            fila = _upsert_insignia(usuario_id, ROL_REPORTANTE, "vigia_comunitario", nivel_vigia, total_validos)
            if fila:
                actualizadas.append(fila)

        conteo_desenlace = (
            supabase.table("trust_score_movimientos")
            .select("id", count="exact")
            .eq("usuario_id", usuario_id)
            .eq("rol", ROL_REPORTANTE)
            .eq("regla", REGLA_TRUST_DESENLACE)
            .execute()
        )
        total_desenlaces = conteo_desenlace.count or 0
        if total_desenlaces >= 3:
            fila = _upsert_insignia(usuario_id, ROL_REPORTANTE, "impacto_real", "oro", total_desenlaces)
            if fila:
                actualizadas.append(fila)

        # Evidencia confiable queda pendiente: requiere una señal de
        # "evidencia aceptada sin discrepancia de ubicación" que hoy vive
        # dispersa entre analisis_ia_estado/requiere_revision (animal_fotos)
        # y estado_coordenadas (EXIF) — no hay un único flag consolidado
        # todavía. Anotado como pendiente, no implementado en este pase.

        return actualizadas
    except Exception as e:
        print(f"[WARN] evaluar_insignias_reportante fallo (usuario={usuario_id}): {e}")
        return []


def _upsert_insignia(usuario_id: str, rol: str, codigo: str, nivel: str | None, progreso: int) -> dict | None:
    existente = (
        supabase.table("insignias")
        .select("*")
        .eq("usuario_id", usuario_id)
        .eq("rol", rol)
        .eq("codigo_insignia", codigo)
        .execute()
    )
    ahora = datetime.now(timezone.utc).isoformat()
    if existente.data:
        fila = existente.data[0]
        if fila.get("nivel") == nivel and fila.get("progreso") == progreso:
            return None
        actualizado = (
            supabase.table("insignias")
            .update({
                "nivel": nivel,
                "progreso": progreso,
                "mejorado_at": ahora if nivel != fila.get("nivel") else fila.get("mejorado_at"),
            })
            .eq("usuario_id", usuario_id).eq("rol", rol).eq("codigo_insignia", codigo)
            .execute()
        )
        return actualizado.data[0] if actualizado.data else None
    creado = (
        supabase.table("insignias")
        .insert({
            "usuario_id": usuario_id, "rol": rol, "codigo_insignia": codigo,
            "nivel": nivel, "progreso": progreso, "obtenido_at": ahora,
        })
        .execute()
    )
    return creado.data[0] if creado.data else None


# ============================================================
# Reglas específicas por rol — puntos de enganche reales.
# ============================================================

def procesar_busqueda_documentada_interna(busqueda_id: str, usuario_id: str | None) -> None:
    """Premia una búsqueda documentada de voluntario interno una vez que
    la asociación o staff resolvió el registro pendiente. La búsqueda es
    el evento idempotente, por lo que reintentar la resolución no duplica
    puntos ni Trust Score."""
    if not usuario_id:
        return

    otorgar_puntos(
        usuario_id, ROL_VOLUNTARIO_INTERNO, REGLA_BUSQUEDA_DOCUMENTADA_INTERNA,
        TIPO_ORIGEN_BUSQUEDA, busqueda_id, PUNTOS_BUSQUEDA_DOCUMENTADA_INTERNA,
    )
    ajustar_trust_score(
        usuario_id, ROL_VOLUNTARIO_INTERNO, "incremento",
        TRUST_BUSQUEDA_DOCUMENTADA_INTERNA,
        REGLA_TRUST_BUSQUEDA_DOCUMENTADA_INTERNA,
        "Búsqueda documentada validada por la asociación",
        TIPO_ORIGEN_BUSQUEDA, busqueda_id,
        limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def procesar_aprobacion_voluntario_interno(
    postulacion_id: str,
    usuario_id: str | None,
) -> None:
    """Entrega una sola vez en la vida el bono inicial del voluntario
    interno. Se usa usuario_id como evento idempotente para que una futura
    re-postulación no vuelva a generar el bono."""
    if not usuario_id:
        return

    otorgar_puntos(
        usuario_id, ROL_VOLUNTARIO_INTERNO, REGLA_BONO_VOLUNTARIO_INTERNO,
        TIPO_ORIGEN_POSTULACION, usuario_id, PUNTOS_BONO_VOLUNTARIO_INTERNO,
    )


def procesar_respuesta_propuesta_interna(
    propuesta_id: str,
    usuario_id: str | None,
) -> None:
    """Suma +1 de Trust Score por aceptar o rechazar a tiempo, con máximo
    de cinco puntos mensuales por esta regla y veinte incrementos totales
    al mes para el rol voluntario."""
    if not usuario_id:
        return

    try:
        inicio_mes = datetime.now(timezone.utc).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0,
        ).isoformat()
        movimientos = (
            supabase.table("trust_score_movimientos")
            .select("valor")
            .eq("usuario_id", usuario_id)
            .eq("rol", ROL_VOLUNTARIO_INTERNO)
            .eq("tipo", "incremento")
            .eq("regla", REGLA_TRUST_RESPUESTA_PROPUESTA_INTERNA)
            .gte("creado_at", inicio_mes)
            .execute()
        )
        acumulado = sum(int(fila.get("valor") or 0) for fila in (movimientos.data or []))
        if acumulado >= LIMITE_RESPUESTAS_PROPUESTA_MES:
            return
    except Exception as error:
        print(
            "[WARN] no se pudo consultar el límite mensual de respuestas "
            f"(usuario={usuario_id}): {error}"
        )
        return

    ajustar_trust_score(
        usuario_id, ROL_VOLUNTARIO_INTERNO, "incremento",
        TRUST_RESPUESTA_PROPUESTA_INTERNA,
        REGLA_TRUST_RESPUESTA_PROPUESTA_INTERNA,
        "Propuesta de asignación respondida dentro del plazo",
        TIPO_ORIGEN_PROPUESTA_ASIGNACION, propuesta_id,
        limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def procesar_rescate_completado_interno(
    reporte_id: str,
    usuario_id: str | None,
    conclusion: str | None,
) -> None:
    """Premia al voluntario interno originalmente asignado cuando la
    asociación cierra un caso real y documentado."""
    if not usuario_id or conclusion not in CONCLUSIONES_VALIDAS:
        return

    otorgar_puntos(
        usuario_id, ROL_VOLUNTARIO_INTERNO, REGLA_RESCATE_COMPLETADO_INTERNO,
        TIPO_ORIGEN_REPORTE, reporte_id, PUNTOS_RESCATE_COMPLETADO_INTERNO,
    )
    ajustar_trust_score(
        usuario_id, ROL_VOLUNTARIO_INTERNO, "incremento",
        TRUST_RESCATE_COMPLETADO_INTERNO,
        REGLA_TRUST_RESCATE_COMPLETADO_INTERNO,
        "Rescate concluido y documentado correctamente",
        TIPO_ORIGEN_REPORTE, reporte_id,
        limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def procesar_llegada_refugio_interna(reporte_id: str, usuario_id: str | None) -> None:
    """Otorga el incentivo por una llegada al refugio ya comprobada por
    las validaciones operativas del hito (foto, GPS y cercanía). No cambia
    Trust Score porque la propuesta aprobada solo asigna puntos aquí."""
    if not usuario_id:
        return

    otorgar_puntos(
        usuario_id, ROL_VOLUNTARIO_INTERNO, REGLA_LLEGADA_REFUGIO_INTERNA,
        TIPO_ORIGEN_HITO_RESCATE, reporte_id, PUNTOS_LLEGADA_REFUGIO_INTERNA,
    )

def procesar_reporte_valido(reporte_id: str, usuario_id: str | None) -> None:
    """Punto de enganche: aceptación temprana (_aceptar_asignacion en
    report_acceptance.py) y el job de 7 días (evaluar_reportes_validados_
    por_tiempo). Idempotente entre ambos caminos gracias al UNIQUE
    (regla, evento_origen_id) — usa reporte_id como evento_origen_id en
    los dos casos, así que no importa cuál dispare primero, el segundo
    intento simplemente no hace nada.

    No paga si usuario_id es None (reporte de invitado sin cuenta) — no
    hay a quién otorgarle puntos.
    """
    if not usuario_id:
        return

    otorgar_puntos(
        usuario_id, ROL_REPORTANTE, REGLA_BONO_BIENVENIDA,
        TIPO_ORIGEN_REPORTE, usuario_id,  # evento_origen_id = usuario_id: se entrega una sola vez EN LA VIDA, no por reporte
        PUNTOS_BONO_BIENVENIDA,
    )
    otorgar_puntos(
        usuario_id, ROL_REPORTANTE, REGLA_REPORTE_VALIDO,
        TIPO_ORIGEN_REPORTE, reporte_id,
        PUNTOS_REPORTE_VALIDO,
        limite_ocurrencias_mes=LIMITE_REPORTES_VALIDOS_MES,
    )
    ajustar_trust_score(
        usuario_id, ROL_REPORTANTE, "incremento", TRUST_INCREMENTO_VALIDADO,
        REGLA_TRUST_REPORTE_VALIDADO, "Reporte validado", TIPO_ORIGEN_REPORTE,
        reporte_id, limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_REPORTANTE,
    )
    _evaluar_racha_reportante(usuario_id)
    evaluar_insignias_reportante(usuario_id)


def procesar_cierre_reporte(reporte_id: str, usuario_id: str | None, conclusion: str | None) -> None:
    """Punto de enganche: cambiar_estado_reporte, rama nuevo_estado ==
    'cerrado'. NO otorga puntos de gamificación (regla explícita del
    documento de asignación) — solo Trust Score e insignia Impacto real,
    y solo si conclusion es uno de los desenlaces válidos."""
    if not usuario_id or conclusion not in CONCLUSIONES_VALIDAS:
        return

    ajustar_trust_score(
        usuario_id, ROL_REPORTANTE, "incremento", TRUST_INCREMENTO_DESENLACE,
        REGLA_TRUST_DESENLACE, f"Desenlace confirmado: {conclusion}", TIPO_ORIGEN_REPORTE,
        reporte_id, limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_REPORTANTE,
    )
    evaluar_insignias_reportante(usuario_id)


def procesar_reporte_falso_confirmado(reporte_id: str, usuario_id: str | None, admin_id: str) -> None:
    """Punto de enganche: resolver_moderacion_reporte (admin.py), rama
    estado == 'rechazado'. Revierte los puntos ya pagados (si los hubo —
    revertir_puntos no falla si nunca se pagaron, simplemente no hay nada
    que revertir porque el evento_origen_id de REGLA_REPORTE_VALIDO_REVERTIDO
    nunca choca con nada), reduce Trust Score vía el sistema de
    Incidentes (0050 bloquea la reduccion directa: ajustar_trust_score
    con tipo='reduccion' ahora exige tipo_origen='incidente'), y rompe
    la racha.

    HISTORIAL DEL BUG: esta funcion originalmente llamaba
    ajustar_trust_score(..., "reduccion", ..., TIPO_ORIGEN_MODERACION, ...)
    directo. Cuando 0050 cerro esa puerta, la reduccion empezo a
    fallar en silencio (atrapada por el try/except de ajustar_trust_score,
    solo un [WARN] en logs) sin que ningun test lo detectara, porque el
    suite mockea la RPC y nunca ejecuta el CHECK real de Postgres.
    Corregido migrando a incidentes_service: la decision del admin al
    marcar el reporte como falso ES la confirmacion humana que el
    sistema de Incidentes exige, asi que se crea Y confirma el
    incidente en el mismo momento, usando al admin como registrado_por
    y confirmado_por (nunca requiere un segundo paso manual separado).
    """
    if not usuario_id:
        return

    revertir_puntos(
        usuario_id, ROL_REPORTANTE, REGLA_REPORTE_VALIDO_REVERTIDO,
        TIPO_ORIGEN_MODERACION, reporte_id, PUNTOS_REPORTE_VALIDO,
    )

    try:
        from app.services import incidentes_service
        incidente = incidentes_service.registrar_incidente(
            usuario_id=usuario_id, rol=ROL_REPORTANTE, tipo_incidente="reporte_falso",
            descripcion="Reporte falso confirmado por moderacion",
            registrado_por=admin_id, actor_tipo="admin", reporte_id=reporte_id,
        )
        incidentes_service.confirmar_incidente(
            incidente["id"], confirmado_por=admin_id, actor_tipo="admin",
        )
    except Exception as e:
        print(f"[WARN] no se pudo crear/confirmar incidente de reporte falso (reporte={reporte_id}): {e}")


def _evaluar_racha_reportante(usuario_id: str) -> None:
    """+10 de trust score por racha de 10 reportes válidos consecutivos
    sin ningún falso entre ellos. Se calcula mirando los últimos eventos
    de trust_score_movimientos del usuario en orden cronológico: cuenta
    consecutivos de REGLA_TRUST_REPORTE_VALIDADO desde el final hasta el
    primer REGLA_INCIDENTE_REPORTE_FALSO (o el inicio del historial).

    Nota: antes de 0050/0051 esta funcion buscaba
    REGLA_TRUST_REPORTE_FALSO (la regla que escribia la reduccion
    directa vieja). Desde que procesar_reporte_falso_confirmado migro a
    incidentes_service, la reduccion real llega con
    REGLA_INCIDENTE_REPORTE_FALSO -- si se deja la regla vieja aqui, la
    racha nunca detecta un reporte falso y sigue sumando de forma
    incorrecta. Corregido en el mismo cambio que migro la reduccion.
    """
    try:
        historial = (
            supabase.table("trust_score_movimientos")
            .select("regla, creado_at")
            .eq("usuario_id", usuario_id)
            .eq("rol", ROL_REPORTANTE)
            .in_("regla", [REGLA_TRUST_REPORTE_VALIDADO, REGLA_INCIDENTE_REPORTE_FALSO])
            .order("creado_at", desc=True)
            .limit(10)
            .execute()
        )
        filas = historial.data or []
        if len(filas) < 10:
            return
        if any(f["regla"] == REGLA_INCIDENTE_REPORTE_FALSO for f in filas):
            return

        # evento_origen_id de la racha: no hay un solo reporte que la
        # origine, así que se usa un id determinístico por "lote de 10"
        # basado en el conteo total de validaciones para que sea estable
        # y no se repita entre llamadas.
        conteo_total = (
            supabase.table("trust_score_movimientos")
            .select("id", count="exact")
            .eq("usuario_id", usuario_id).eq("rol", ROL_REPORTANTE)
            .eq("regla", REGLA_TRUST_REPORTE_VALIDADO)
            .execute()
        ).count or 0
        if conteo_total % 10 != 0:
            return

        evento_racha_id = UUID(int=(hash((usuario_id, conteo_total)) & ((1 << 128) - 1)))
        ajustar_trust_score(
            usuario_id, ROL_REPORTANTE, "incremento", TRUST_INCREMENTO_RACHA,
            REGLA_TRUST_RACHA_10, f"Racha de {conteo_total} reportes validados",
            TIPO_ORIGEN_REPORTE, str(evento_racha_id),
            limite_incremento_mes=TRUST_LIMITE_INCREMENTO_MES_REPORTANTE,
        )
    except Exception as e:
        print(f"[WARN] _evaluar_racha_reportante fallo (usuario={usuario_id}): {e}")


def consultar_restricciones(usuario_id: str, rol: str) -> dict:
    """Traduce el trust_score actual en restricciones operativas concretas
    que cada endpoint debe aplicar en backend — no basta con ocultar un
    botón en el frontend (requisito explícito del documento de
    asignación).

    Si el usuario todavía no tiene fila en trust_score (nunca se le
    ajustó nada), se asume el estado inicial: puntaje 60, 'estandar',
    sin restricciones — mismo comportamiento que tendría si
    ajustar_trust_score_atomico la creara ahora mismo.

    Los campos de restricción son específicos por dominio (reportante
    usa "reportes activos por día", voluntario usa "nuevas
    asignaciones") porque el documento define las consecuencias de forma
    distinta para cada rol, no un único set de banderas genérico.
    """
    resultado = (
        supabase.table("trust_score")
        .select("puntaje, estado_interno")
        .eq("usuario_id", usuario_id)
        .eq("rol", rol)
        .execute()
    )
    fila = resultado.data[0] if resultado.data else {"puntaje": 60, "estado_interno": "estandar"}
    puntaje = fila["puntaje"]
    estado = fila["estado_interno"]

    base = {
        "usuario_id": usuario_id,
        "rol": rol,
        "puntaje": puntaje,
        "estado_interno": estado,
    }

    if rol == ROL_REPORTANTE:
        base.update({
            "requiere_revision_previa": puntaje < 40,
            "maximo_reportes_activos_dia": 2 if 20 <= puntaje < 40 else None,
            "requiere_revision_administrativa_total": puntaje < 20,
            # No negociable: una emergencia siempre puede enviarse,
            # independientemente del estado — el documento lo exige
            # explícitamente. Ninguna restricción de arriba debe usarse
            # para bloquear el envío de una emergencia, solo para decidir
            # cómo se valida/publica después.
            "puede_enviar_emergencia": True,
        })
    else:  # voluntario_interno / voluntario_externo
        base.update({
            "en_observacion": 40 <= puntaje < 60,
            "bloqueado_nuevas_asignaciones": puntaje < 40,
            "suspension_operativa": puntaje < 20,
            # El documento es explícito para el externo, y por consistencia
            # se aplica igual al interno: una restricción nunca corta el
            # acceso a una custodia/caso YA activo, solo bloquea recibir
            # nuevas asignaciones. Quien llama esto debe seguir permitiendo
            # terminar lo que el usuario ya tenía en curso.
            "puede_finalizar_activos_en_curso": True,
        })

    return base


def evaluar_reportes_validados_por_tiempo() -> dict:
    """Job de los 7 días — llamado desde POST /internal/gamificacion/run.

    Busca reportes con más de 7 días desde su creación, que no hayan
    sido rechazados/marcados falsos/duplicados/cancelados, y que todavía
    no tengan un movimiento REGLA_REPORTE_VALIDO. procesar_reporte_valido
    ya es idempotente vía el UNIQUE de la RPC, así que aunque este job
    revise un reporte que ya fue pagado por la aceptación temprana,
    simplemente no duplica nada.
    """
    from datetime import timedelta

    limite = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    candidatos = (
        supabase.table("reportes")
        .select("id, usuario_id, estado_reporte, created_at")
        .lt("created_at", limite)
        .not_.in_("estado_reporte", [
            "rechazado", "cancelado", "duplicado_vinculable", "duplicado_informativo",
        ])
        .execute()
    )

    procesados = 0
    for rep in (candidatos.data or []):
        try:
            procesar_reporte_valido(rep["id"], rep.get("usuario_id"))
            procesados += 1
        except Exception as e:
            print(f"[WARN] evaluar_reportes_validados_por_tiempo fallo en reporte {rep['id']}: {e}")

    return {"revisados": len(candidatos.data or []), "procesados": procesados}
