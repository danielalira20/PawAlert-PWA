from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_key: str
    supabase_bucket: str = "pawalert-fotos"
    supabase_sensitive_bucket: str = "pawalert-evidencias-privadas"
    brevo_api_key: str = ""
    cron_secret: str = ""
     # Twilio — verificación de teléfono para invitados que reclaman cuenta
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    twilio_whatsapp_from: str = ""
    whatsapp_notifications_enabled: bool = False
    twilio_webhook_base_url: str = ""
    twilio_validate_signatures: bool = True
    require_phone_verification: bool = False
    frontend_url: str = "https://paw-alert-pwa.vercel.app"
    cors_origins: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_file_timeout_seconds: int = 180
    openweather_api_key: str = ""
    osrm_base_url: str = "https://router.project-osrm.org"
    osrm_timeout_seconds: float = Field(default=8.0, gt=0)
    osrm_max_coordinates: int = Field(default=100, ge=2)
    vroom_base_url: str = ""
    vroom_timeout_seconds: int = 10
    vroom_candidate_window_minutes: int = Field(default=5, ge=0)
    vroom_secondary_max_eta_minutes: int = Field(default=30, gt=0)
    vroom_max_locations: int = Field(default=50, gt=0)
    clip_validation_enabled: bool = False
    huggingface_token: str = ""
    clip_endpoint_url: str = ""
    clip_model: str = "openai/clip-vit-base-patch32"
    clip_timeout_seconds: float = 8.0
    clip_gray_threshold: float = 0.88
    clip_high_threshold: float = 0.94
    firebase_service_account_json: str = ""
    google_application_credentials: str = ""

    # Avistamientos: filtro de cercanía para poder INTENTAR registrar uno.
    # Solo aplica a reportante del caso y voluntario verificado cercano;
    # asociación/staff quedan exentos (pueden registrar info de terceros).
    radio_entrada_avistamiento_metros: int = Field(default=500, gt=0)

    @model_validator(mode="after")
    def validate_vroom_route_windows(self):
        if (
            self.vroom_secondary_max_eta_minutes
            <= self.vroom_candidate_window_minutes
        ):
            raise ValueError(
                "VROOM secondary ETA must be greater than the candidate window"
            )
        return self

    class Config:
        env_file = ".env"

settings = Settings()
