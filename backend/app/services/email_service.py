import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
import os
from app.config import settings

def _get_api_instance():
    api_key = settings.brevo_api_key

    print(f"[BREVO] API Key: {api_key[:10] if api_key else 'NONE'}...")

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = api_key

    return sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )
#def _get_api_instance():
 #   configuration = sib_api_v3_sdk.Configuration()
  #  configuration.api_key['api-key'] = os.getenv("BREVO_API_KEY")
   # return sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))

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
    html = f"""
    <h2>¡Felicidades! Tu asociación fue aprobada 🐾</h2>
    <p>Hola,</p>
    <p>Tu asociación <strong>{nombre_asociacion}</strong> ha sido aprobada en PawAlert.</p>
    <p>Ya puedes iniciar sesión y empezar a recibir reportes de animales en tu zona.</p>
    <br>
    <p>Equipo PawAlert</p>
    """
    enviar_email(email, nombre_asociacion, "¡Tu asociación fue aprobada en PawAlert!", html)


def email_asociacion_rechazada(nombre_asociacion: str, email: str, motivo: str):
    html = f"""
    <h2>Actualización sobre tu solicitud en PawAlert</h2>
    <p>Hola,</p>
    <p>Lamentamos informarte que tu asociación <strong>{nombre_asociacion}</strong> no fue aprobada.</p>
    <p><strong>Motivo:</strong> {motivo}</p>
    <p>Puedes apelar desde tu panel adjuntando los documentos requeridos.</p>
    <br>
    <p>Equipo PawAlert</p>
    """
    enviar_email(email, nombre_asociacion, "Actualización sobre tu solicitud en PawAlert", html)


def email_apelacion_aprobada(nombre_asociacion: str, email: str):
    html = f"""
    <h2>¡Tu apelación fue aprobada! 🎉</h2>
    <p>Hola,</p>
    <p>Nos complace informarte que la apelación de <strong>{nombre_asociacion}</strong> fue aprobada.</p>
    <p>Tu asociación ya está verificada y puede recibir reportes.</p>
    <br>
    <p>Equipo PawAlert</p>
    """
    enviar_email(email, nombre_asociacion, "¡Tu apelación fue aprobada en PawAlert!", html)


def email_apelacion_rechazada(nombre_asociacion: str, email: str, respuesta: str | None):
    html = f"""
    <h2>Respuesta a tu apelación</h2>
    <p>Hola,</p>
    <p>Hemos revisado la apelación de <strong>{nombre_asociacion}</strong>.</p>
    {"<p><strong>Respuesta:</strong> " + respuesta + "</p>" if respuesta else ""}
    <p>Lamentablemente no pudimos aprobar tu solicitud en esta ocasión.</p>
    <br>
    <p>Equipo PawAlert</p>
    """
    enviar_email(email, nombre_asociacion, "Respuesta a tu apelación en PawAlert", html)


def email_reporte_grave(nombre_asociacion: str, email: str, municipio: str | None, tipo_animal: str | None):
    html = f"""
    <h2>🚨 Caso urgente asignado a tu asociación</h2>
    <p>Hola,</p>
    <p>Se ha asignado un reporte urgente a <strong>{nombre_asociacion}</strong>.</p>
    <p><strong>Animal:</strong> {tipo_animal or 'No especificado'}</p>
    <p><strong>Zona:</strong> {municipio or 'No especificada'}</p>
    <p><strong>Condición:</strong> Grave — requiere atención inmediata</p>
    <p>Entra a PawAlert para ver los detalles y aceptar el caso.</p>
    <br>
    <p>Equipo PawAlert</p>
    """
    enviar_email(email, nombre_asociacion, "🚨 Caso urgente asignado a tu asociación", html)

