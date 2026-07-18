from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_key: str
    supabase_bucket: str = "pawalert-fotos"
    brevo_api_key: str = ""
    cron_secret: str = ""
     # Twilio — verificación de teléfono para invitados que reclaman cuenta
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    require_phone_verification: bool = False
    frontend_url: str = "https://paw-alert-pwa.vercel.app"

    class Config:
        env_file = ".env"

settings = Settings()