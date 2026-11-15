import os
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    google_sheets_spreadsheet_id: str = Field(min_length=10, pattern=r"^[A-Za-z0-9_-]+$")
    google_application_credentials: str | None = None
    firebase_project_id: str = Field(min_length=1)
    allowed_firebase_uid: str = Field(min_length=1)
    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    ledger_checkpoint_path: str = "data/ledger-checkpoint.json"
    cache_ttl_seconds: float = Field(default=2, ge=0, le=5)
    upstream_timeout_seconds: float = Field(default=10, ge=1, le=30)
    rate_limit_per_minute: int = Field(default=120, ge=1)
    max_body_bytes: int = Field(default=16384, ge=1024, le=65536)
    cors_origins: list[str] = []
    projection_retry_seconds: float = Field(default=30, ge=5, le=300)

    @field_validator("allowed_firebase_uid", "firebase_project_id")
    @classmethod
    def no_blank(cls, value):
        if value.strip() != value or not value.strip():
            raise ValueError("Configuration must not be blank or padded")
        return value

    def check_runtime(self):
        if os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
            raise RuntimeError("Firebase emulator is unsupported in this runtime; tests inject a verifier.")
        for key in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
            if os.getenv(key, "1") != "1":
                raise RuntimeError("MVP requires one worker and one replica.")
        if "*" in self.cors_origins:
            raise RuntimeError("Set explicit CORS origins.")
