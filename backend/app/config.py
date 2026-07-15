from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_key: str
    supabase_bucket: str = "pawalert-fotos"
    brevo_api_key: str = ""
    cron_secret: str = ""

    class Config:
        env_file = ".env"

settings = Settings()