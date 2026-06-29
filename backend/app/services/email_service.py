import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
import os
from app.config import settings
from app.services.email_templates.asociacion_aprobada import get_html as html_asociacion_aprobada
from app.services.email_templates.asociacion_rechazada import get_html as html_asociacion_rechazada
from app.services.email_templates.apelacion_aprobada import get_html as html_apelacion_aprobada
from app.services.email_templates.apelacion_rechazada import get_html as html_apelacion_rechazada
from app.services.email_templates.caso_urgente import get_html as html_caso_urgente


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