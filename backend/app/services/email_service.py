import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
import os
from app.config import settings
from app.services.email_templates.asociacion_aprobada import get_html as html_asociacion_aprobada
from app.services.email_templates.asociacion_rechazada import get_html as html_asociacion_rechazada
from app.services.email_templates.apelacion_aprobada import get_html as html_apelacion_aprobada
from app.services.email_templates.apelacion_rechazada import get_html as html_apelacion_rechazada
from app.services.email_templates.caso_urgente import get_html as html_caso_urgente
from app.services.email_templates.staff_bienvenida import get_html as html_staff_bienvenida

def _get_api_instance():
    api_key = settings.brevo_api_key

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = api_key

    return sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )

def enviar_email(destinatario_email: str, destinatario_nombre: str, asunto: str, contenido_html: str):
    """Función genérica para enviar emails via Brevo."""
    try:
        api_instance = _get_api_instance()
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": destinatario_email, "name": destinatario_nombre}],
            sender={"email": "rojasdiego133@gmail.com", "name": "PawAlert"},
            subject=asunto,
            html_content=contenido_html
        )
        
        api_instance.send_transac_email(send_smtp_email)
       
    except ApiException as e:
        print(f"[EMAIL ERROR] {e}")

def email_asociacion_aprobada(nombre_asociacion: str, email: str):
    html = html_asociacion_aprobada(nombre_asociacion=nombre_asociacion)
    enviar_email(email, nombre_asociacion, "¡Tu asociación fue aprobada en PawAlert!", html)


def email_asociacion_rechazada(nombre_asociacion: str, email: str, motivo: str):
    html = html_asociacion_rechazada(nombre_asociacion=nombre_asociacion, motivo=motivo)
    enviar_email(email, nombre_asociacion, "Actualización sobre tu solicitud en PawAlert", html)

def email_apelacion_aprobada(nombre_asociacion: str, email: str):
    html = html_apelacion_aprobada(nombre_asociacion=nombre_asociacion)
    enviar_email(email, nombre_asociacion, "¡Tu apelación fue aprobada en PawAlert!", html)

def email_apelacion_rechazada(nombre_asociacion: str, email: str, respuesta: str | None):
    html = html_apelacion_rechazada(nombre_asociacion=nombre_asociacion, respuesta=respuesta)
    enviar_email(email, nombre_asociacion, "Respuesta a tu apelación en PawAlert", html)

def email_reporte_grave(nombre_asociacion: str, email: str, municipio: str | None, tipo_animal: str | None):
    html = html_caso_urgente(nombre_asociacion=nombre_asociacion, municipio=municipio, tipo_animal=tipo_animal)
    enviar_email(email, nombre_asociacion, "🚨 Caso urgente asignado a tu asociación", html)

def email_bienvenida_staff(nombre: str, email: str, token: str, nombre_asociacion: str):
    url = f"{settings.frontend_url}/completar-cuenta?token={token}"
    html = html_staff_bienvenida(nombre=nombre, url_completar_cuenta=url, nombre_asociacion=nombre_asociacion)
    enviar_email(email, nombre, "¡Bienvenido a PawAlert!", html)

def email_duda_regional(email_coordinadora: str, nombre_coordinadora: str, reporte_id: str, nombre_regional: str, texto_duda: str, fecha_hora: str):
    """Envía un correo a la asociación coordinadora cuando la regional tiene una duda."""
    # Cortamos el UUID a 8 caracteres y lo hacemos mayúsculas como pidió tu equipo
    folio = str(reporte_id)[:8].upper()
    url = f"{settings.frontend_url}/dashboard"
    
    html = f"""
    <div style="font-family: Arial, sans-serif; color: #4A3728; max-width: 600px; margin: 0 auto; border: 1px solid #F0E6D6; border-radius: 10px; padding: 20px;">
        <h2 style="color: #EC802B;">Inquietud en el caso #{folio}</h2>
        <p>Hola <strong>{nombre_coordinadora}</strong>,</p>
        <p>La asociación regional <strong>{nombre_regional}</strong> ha revisado la evidencia de este caso y ha formulado la siguiente duda:</p>
        <blockquote style="background-color: #FAF3EA; border-left: 4px solid #EC802B; padding: 10px 15px; color: #4A3728; font-style: italic; border-radius: 4px;">
            "{texto_duda}"
        </blockquote>
        <p style="font-size: 12px; color: #8C7A6B;">Fecha y hora: {fecha_hora}</p>
        <p>Por favor, entra a tu dashboard para revisar los detalles y enviarle esta aclaración al voluntario externo.</p>
        <div style="text-align: center; margin-top: 20px;">
            <a href="{url}" style="display: inline-block; padding: 12px 24px; background-color: #EC802B; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Ir a la plataforma</a>
        </div>
    </div>
    """
    enviar_email(email_coordinadora, nombre_coordinadora, f"Duda de revisión - Caso #{folio}", html)


def email_respuesta_voluntario(email_coordinadora: str, nombre_coordinadora: str, reporte_id: str, fecha_hora: str):
    """Envía un correo a la asociación coordinadora cuando el voluntario responde la aclaración."""
    folio = str(reporte_id)[:8].upper()
    url = f"{settings.frontend_url}/dashboard"
    
    html = f"""
    <div style="font-family: Arial, sans-serif; color: #4A3728; max-width: 600px; margin: 0 auto; border: 1px solid #F0E6D6; border-radius: 10px; padding: 20px;">
        <h2 style="color: #66BCB4;">El hogar temporal ha respondido (Caso #{folio})</h2>
        <p>Hola <strong>{nombre_coordinadora}</strong>,</p>
        <p>Te informamos que el voluntario externo asignado a este caso ya ha respondido a la solicitud de aclaración de evidencia.</p>
        <p style="font-size: 12px; color: #8C7A6B;">Fecha y hora de respuesta: {fecha_hora}</p>
        <p>Por favor, entra a tu dashboard para revisar el texto y las fotografías/videos que envió como evidencia. A partir de ahí, podrás decidir si resuelves la aclaración o si pides más información.</p>
        <div style="text-align: center; margin-top: 20px;">
            <a href="{url}" style="display: inline-block; padding: 12px 24px; background-color: #66BCB4; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Revisar respuesta</a>
        </div>
    </div>
    """
    enviar_email(email_coordinadora, nombre_coordinadora, f"Respuesta de voluntario - Caso #{folio}", html)