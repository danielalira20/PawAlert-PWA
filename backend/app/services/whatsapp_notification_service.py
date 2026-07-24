"""Avisos salientes de WhatsApp para el flujo de verificación de hogares.

PawAlert conserva toda la lógica de negocio. Este módulo únicamente crea una
cola, intenta enviar y registra el resultado de Twilio. Ninguna excepción de
este archivo debe revertir una acción ya confirmada en la plataforma.
"""

import re
from datetime import datetime, timezone

from twilio.rest import Client as TwilioClient

from app.config import settings
from app.db.supabase import supabase_admin


EVENTOS_SOPORTADOS = {
    "propuesta_verificador",
    "verificador_asignado",
    "horario_propuesto_postulante",
    "horario_propuesto_verificador",
    "horario_confirmado",
    "check_in_asociacion",
    "recordatorio_seguridad_50",
    "alerta_seguridad_60",
    "check_out_asociacion",
    "visita_finalizada_postulante",
    "resultado_actualizado",
}


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalizar_telefono_whatsapp(telefono: str | None) -> str | None:
    """Convierte teléfonos mexicanos de 10 dígitos al formato de WhatsApp."""
    if not telefono:
        return None
    valor = telefono.strip()
    tiene_mas = valor.startswith("+")
    digitos = re.sub(r"\D", "", valor)
    if len(digitos) == 10:
        digitos = f"52{digitos}"
    elif digitos.startswith("521") and len(digitos) == 13:
        # El prefijo móvil 1 de México dejó de usarse; algunos registros
        # antiguos todavía pueden conservarlo.
        digitos = f"52{digitos[3:]}"
    if not (10 <= len(digitos) <= 15):
        return None
    prefijo = "+" if tiene_mas or digitos else ""
    return f"whatsapp:{prefijo}{digitos}" if prefijo else f"whatsapp:+{digitos}"


def _nombre_usuario(usuario: dict | None, fallback: str) -> str:
    if not usuario:
        return fallback
    nombre = " ".join(
        str(usuario.get(campo) or "").strip()
        for campo in ("nombre", "apellido_paterno")
    ).strip()
    return nombre or fallback


def _datos_voluntario(voluntario_id: str) -> dict:
    voluntario = supabase_admin.table("voluntarios").select(
        "id, usuario_id"
    ).eq("id", voluntario_id).limit(1).execute()
    if not voluntario.data:
        return {"id": voluntario_id, "nombre": "Persona voluntaria", "telefono": None}
    usuario = supabase_admin.table("usuarios").select(
        "nombre, apellido_paterno, telefono"
    ).eq("id", voluntario.data[0]["usuario_id"]).limit(1).execute()
    datos = usuario.data[0] if usuario.data else {}
    return {
        "id": voluntario_id,
        "nombre": _nombre_usuario(datos, "Persona voluntaria"),
        "telefono": datos.get("telefono"),
    }


def _contexto_verificacion(
    verificacion_id: str,
    asignacion_id: str | None = None,
) -> dict | None:
    verificacion = supabase_admin.table("verificaciones_hogar").select(
        "id, asociacion_id, voluntario_postulante_id, estado"
    ).eq("id", verificacion_id).limit(1).execute()
    if not verificacion.data:
        return None
    proceso = verificacion.data[0]
    asociacion = supabase_admin.table("asociaciones").select(
        "id, nombre, contacto_telefono"
    ).eq("id", proceso["asociacion_id"]).limit(1).execute()
    asignacion = None
    query = supabase_admin.table("asignaciones_verificacion_hogar").select(
        "id, verificador_voluntario_id, horario_propuesto_at, "
        "visita_programada_at, check_in_at, check_out_at, resultado_visita, "
        "resultado_at"
    )
    if asignacion_id:
        resultado = query.eq("id", asignacion_id).limit(1).execute()
    else:
        resultado = query.eq(
            "verificacion_hogar_id", verificacion_id
        ).order("propuesta_at", desc=True).limit(1).execute()
    if resultado.data:
        asignacion = resultado.data[0]

    return {
        "verificacion": proceso,
        "asociacion": asociacion.data[0] if asociacion.data else {
            "id": proceso["asociacion_id"],
            "nombre": "La asociación",
            "contacto_telefono": None,
        },
        "postulante": _datos_voluntario(proceso["voluntario_postulante_id"]),
        "verificador": (
            _datos_voluntario(asignacion["verificador_voluntario_id"])
            if asignacion
            else None
        ),
        "asignacion": asignacion,
    }


def _fecha_legible(valor: str | None) -> str:
    if not valor:
        return "el horario acordado"
    try:
        fecha = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return fecha.astimezone().strftime("%d/%m/%Y a las %H:%M")
    except (TypeError, ValueError):
        return valor


def _crear_destinatario(
    tipo: str,
    datos: dict | None,
    mensaje: str,
    enlace: str,
) -> dict | None:
    if not datos:
        return None
    telefono = normalizar_telefono_whatsapp(
        datos.get("contacto_telefono") or datos.get("telefono")
    )
    if not telefono:
        return None
    return {
        "tipo": tipo,
        "id": datos["id"],
        "telefono": telefono,
        "mensaje": mensaje,
        "enlace": enlace,
    }


def _destinatarios_evento(evento: str, contexto: dict) -> list[dict]:
    asociacion = contexto["asociacion"]
    postulante = contexto["postulante"]
    verificador = contexto["verificador"]
    asignacion = contexto["asignacion"] or {}
    perfil_url = f"{settings.frontend_url.rstrip('/')}/profile"
    asociacion_url = f"{settings.frontend_url.rstrip('/')}/association"
    horario = _fecha_legible(
        asignacion.get("horario_propuesto_at")
        or asignacion.get("visita_programada_at")
    )

    candidatos: list[dict | None] = []
    if evento == "propuesta_verificador":
        candidatos.append(_crear_destinatario(
            "voluntario",
            verificador,
            f"{asociacion['nombre']} te envió una nueva propuesta para verificar una casa temporal. Revísala desde PawAlert.",
            perfil_url,
        ))
    elif evento == "verificador_asignado":
        candidatos.append(_crear_destinatario(
            "postulante",
            postulante,
            "Ya encontramos a una persona para verificar tu hogar. Mantente al tanto de la coordinación desde tu perfil de PawAlert.",
            perfil_url,
        ))
    elif evento == "horario_propuesto_postulante":
        candidatos.append(_crear_destinatario(
            "postulante",
            postulante,
            f"Tienes una propuesta de visita para {horario}. Confírmala o solicita un cambio desde PawAlert.",
            perfil_url,
        ))
    elif evento == "horario_propuesto_verificador":
        candidatos.append(_crear_destinatario(
            "voluntario",
            verificador,
            f"El postulante propuso un nuevo horario para {horario}. Revísalo desde PawAlert.",
            perfil_url,
        ))
    elif evento == "horario_confirmado":
        texto = f"La visita quedó confirmada para {horario}. Consulta los detalles desde PawAlert."
        candidatos.extend([
            _crear_destinatario("voluntario", verificador, texto, perfil_url),
            _crear_destinatario("postulante", postulante, texto, perfil_url),
        ])
    elif evento == "check_in_asociacion":
        candidatos.append(_crear_destinatario(
            "asociacion",
            asociacion,
            f"{verificador['nombre']} registró su llegada al hogar. Consulta el mapa y seguimiento desde PawAlert.",
            asociacion_url,
        ))
    elif evento == "recordatorio_seguridad_50":
        candidatos.append(_crear_destinatario(
            "voluntario",
            verificador,
            "¿Todo bien? Ya transcurrieron aproximadamente 50 minutos. Cuando termines, recuerda registrar tu salida desde PawAlert.",
            perfil_url,
        ))
    elif evento == "alerta_seguridad_60":
        candidatos.append(_crear_destinatario(
            "asociacion",
            asociacion,
            f"La visita de {verificador['nombre']} necesita seguimiento: han pasado 60 minutos y todavía no registra su salida.",
            asociacion_url,
        ))
    elif evento == "check_out_asociacion":
        candidatos.append(_crear_destinatario(
            "asociacion",
            asociacion,
            f"{verificador['nombre']} registró su salida. La visita terminó y se está documentando el resultado.",
            asociacion_url,
        ))
    elif evento == "visita_finalizada_postulante":
        candidatos.append(_crear_destinatario(
            "postulante",
            postulante,
            "La visita de verificación terminó. El resultado se actualizará en tu perfil de PawAlert.",
            perfil_url,
        ))
    elif evento == "resultado_actualizado":
        candidatos.extend([
            _crear_destinatario(
                "postulante",
                postulante,
                "Tu postulación tiene una actualización. Consúltala desde tu perfil de PawAlert.",
                perfil_url,
            ),
            _crear_destinatario(
                "asociacion",
                asociacion,
                f"{verificador['nombre']} registró el resultado de la visita. Consulta el expediente en PawAlert.",
                asociacion_url,
            ),
        ])
    return [destinatario for destinatario in candidatos if destinatario]


def encolar_notificacion(
    evento: str,
    dedupe_key: str,
    destinatario: dict,
) -> dict | None:
    existente = supabase_admin.table("notificaciones_whatsapp").select(
        "id, estado"
    ).eq("dedupe_key", dedupe_key).limit(1).execute()
    if existente.data:
        return existente.data[0]
    ahora = _ahora()
    resultado = supabase_admin.table("notificaciones_whatsapp").insert({
        "evento": evento,
        "dedupe_key": dedupe_key,
        "destinatario_tipo": destinatario["tipo"],
        "destinatario_id": destinatario["id"],
        "telefono": destinatario["telefono"],
        "mensaje": destinatario["mensaje"],
        "enlace": destinatario.get("enlace"),
        "estado": "pendiente",
        "programada_at": ahora,
        "created_at": ahora,
        "updated_at": ahora,
    }).execute()
    return resultado.data[0] if resultado.data else None


def _cliente_twilio() -> TwilioClient:
    return TwilioClient(
        settings.twilio_account_sid,
        settings.twilio_auth_token,
    )


def whatsapp_configurado() -> bool:
    return bool(
        settings.whatsapp_notifications_enabled
        and settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_whatsapp_from
    )


def procesar_notificacion(notificacion_id: str) -> dict:
    registro = supabase_admin.table("notificaciones_whatsapp").select(
        "*"
    ).eq("id", notificacion_id).limit(1).execute()
    if not registro.data:
        return {"estado": "no_encontrada"}
    aviso = registro.data[0]
    if aviso["estado"] not in ("pendiente", "fallido"):
        return {"estado": aviso["estado"]}
    if not whatsapp_configurado():
        return {"estado": "pendiente", "motivo": "whatsapp_no_configurado"}

    ahora = _ahora()
    supabase_admin.table("notificaciones_whatsapp").update({
        "estado": "enviando",
        "intentos": int(aviso.get("intentos") or 0) + 1,
        "ultimo_error": None,
        "updated_at": ahora,
    }).eq("id", aviso["id"]).execute()
    cuerpo = aviso["mensaje"]
    if aviso.get("enlace"):
        cuerpo = f"{cuerpo}\n\n{aviso['enlace']}"
    callback = None
    if settings.twilio_webhook_base_url:
        callback = (
            f"{settings.twilio_webhook_base_url.rstrip('/')}"
            "/webhooks/twilio/whatsapp/status"
        )
    try:
        mensaje = _cliente_twilio().messages.create(
            body=cuerpo,
            from_=settings.twilio_whatsapp_from,
            to=aviso["telefono"],
            status_callback=callback,
        )
        supabase_admin.table("notificaciones_whatsapp").update({
            "estado": "enviado",
            "twilio_message_sid": mensaje.sid,
            "enviada_at": ahora,
            "updated_at": ahora,
        }).eq("id", aviso["id"]).execute()
        return {"estado": "enviado", "sid": mensaje.sid}
    except Exception as error:
        supabase_admin.table("notificaciones_whatsapp").update({
            "estado": "fallido",
            "ultimo_error": str(error)[:500],
            "updated_at": ahora,
        }).eq("id", aviso["id"]).execute()
        return {"estado": "fallido", "error": str(error)}


def notificar_evento_verificacion(
    evento: str,
    verificacion_id: str,
    asignacion_id: str | None = None,
) -> dict:
    """Encola e intenta un evento; siempre captura sus propios errores."""
    try:
        if evento not in EVENTOS_SOPORTADOS:
            return {"encoladas": 0, "error": "evento_no_soportado"}
        contexto = _contexto_verificacion(verificacion_id, asignacion_id)
        if not contexto:
            return {"encoladas": 0, "error": "verificacion_no_encontrada"}
        destinatarios = _destinatarios_evento(evento, contexto)
        resultados = []
        for destinatario in destinatarios:
            asignacion = contexto.get("asignacion") or {}
            marcador = ""
            if evento.startswith("horario_"):
                marcador = str(
                    asignacion.get("horario_propuesto_at")
                    or asignacion.get("visita_programada_at")
                    or ""
                )
            elif evento == "check_in_asociacion":
                marcador = str(asignacion.get("check_in_at") or "")
            elif evento in ("check_out_asociacion", "visita_finalizada_postulante"):
                marcador = str(asignacion.get("check_out_at") or "")
            elif evento == "resultado_actualizado":
                marcador = str(asignacion.get("resultado_at") or "")
            dedupe_key = (
                f"{evento}:{asignacion_id or verificacion_id}:"
                f"{destinatario['tipo']}:{destinatario['id']}:{marcador}"
            )
            aviso = encolar_notificacion(evento, dedupe_key, destinatario)
            if aviso:
                resultados.append(procesar_notificacion(aviso["id"]))
        return {"encoladas": len(resultados), "resultados": resultados}
    except Exception as error:
        print(f"[WHATSAPP NOTIFICATION ERROR] {evento}: {error}")
        return {"encoladas": 0, "error": str(error)}


def notificar_evento_asignacion(evento: str, asignacion_id: str) -> dict:
    """Resuelve la verificación a partir de una asignación sin propagar fallos."""
    try:
        asignacion = supabase_admin.table(
            "asignaciones_verificacion_hogar"
        ).select("verificacion_hogar_id").eq(
            "id", asignacion_id
        ).limit(1).execute()
        if not asignacion.data:
            return {"encoladas": 0, "error": "asignacion_no_encontrada"}
        return notificar_evento_verificacion(
            evento,
            asignacion.data[0]["verificacion_hogar_id"],
            asignacion_id,
        )
    except Exception as error:
        print(f"[WHATSAPP NOTIFICATION ERROR] {evento}: {error}")
        return {"encoladas": 0, "error": str(error)}


def procesar_pendientes(limite: int = 50) -> dict:
    if not whatsapp_configurado():
        return {"procesadas": 0, "configurado": False}
    pendientes = supabase_admin.table("notificaciones_whatsapp").select(
        "id"
    ).in_("estado", ["pendiente", "fallido"]).lte(
        "programada_at", _ahora()
    ).order("programada_at").limit(limite).execute().data or []
    resultados = [procesar_notificacion(item["id"]) for item in pendientes]
    return {
        "procesadas": len(resultados),
        "configurado": True,
        "resultados": resultados,
    }


def evaluar_recordatorios_seguridad() -> dict:
    """Genera avisos únicos a los 50 y 60 minutos sin check-out."""
    visitas = supabase_admin.table("asignaciones_verificacion_hogar").select(
        "id, verificacion_hogar_id, check_in_at"
    ).eq("estado", "aceptada").not_.is_(
        "check_in_at", "null"
    ).is_("check_out_at", "null").execute().data or []
    ahora = datetime.now(timezone.utc)
    generados = 0
    for visita in visitas:
        try:
            entrada = datetime.fromisoformat(
                visita["check_in_at"].replace("Z", "+00:00")
            )
        except (TypeError, ValueError):
            continue
        minutos = (ahora - entrada).total_seconds() / 60
        eventos = []
        if minutos >= 50:
            eventos.append("recordatorio_seguridad_50")
        if minutos >= 60:
            eventos.append("alerta_seguridad_60")
        for evento in eventos:
            resultado = notificar_evento_verificacion(
                evento,
                visita["verificacion_hogar_id"],
                visita["id"],
            )
            generados += int(resultado.get("encoladas") or 0)
    return {"visitas_revisadas": len(visitas), "avisos_generados": generados}


def actualizar_estado_twilio(
    message_sid: str,
    message_status: str,
    error_code: str | None = None,
) -> dict:
    mapa = {
        "queued": "enviado",
        "sent": "enviado",
        "delivered": "entregado",
        "read": "leido",
        "failed": "fallido",
        "undelivered": "fallido",
    }
    estado = mapa.get(message_status)
    if not estado:
        return {"actualizada": False}
    ahora = _ahora()
    cambios = {"estado": estado, "updated_at": ahora}
    if estado == "entregado":
        cambios["entregada_at"] = ahora
    elif estado == "leido":
        cambios["leida_at"] = ahora
    elif estado == "fallido":
        cambios["ultimo_error"] = (
            f"Twilio status={message_status}, error={error_code or 'desconocido'}"
        )
    supabase_admin.table("notificaciones_whatsapp").update(
        cambios
    ).eq("twilio_message_sid", message_sid).execute()
    return {"actualizada": True, "estado": estado}
