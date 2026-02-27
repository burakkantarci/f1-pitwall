from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "pitwall-ingestion"
    database_url: str = "postgresql://pitwall:pitwall_dev@postgres:5432/pitwall"
    redis_url: str = "redis://redis:6379"
    openf1_base_url: str = "https://api.openf1.org/v1"
    ergast_base_url: str = "https://api.jolpi.ca/ergast/f1"
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4317"

    class Config:
        env_file = ".env"


settings = Settings()
