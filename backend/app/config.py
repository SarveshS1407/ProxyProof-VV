import os
from typing import List, Union, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEV_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"


class Settings(BaseSettings):
    PROJECT_NAME: str = "ProxyProof"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Security
    SECRET_KEY: str = DEFAULT_DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DATABASE_URL: str = "sqlite:///./proxyproof.db"

    # Seeding & Administrative Bootstrap
    SEED_DEMO_DATA: Optional[bool] = None  # None -> auto-set: True in dev, False in prod
    INITIAL_ADMIN_EMAIL: Optional[str] = None
    INITIAL_ADMIN_PASSWORD: Optional[str] = None
    AUTO_CREATE_TABLES: Optional[bool] = None  # None -> True in dev, False in prod

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "exp://localhost:8081",
    ]

    # BLE & Attendance Protocol Parameters
    BLE_SERVICE_UUID: str = "0000FD00-0000-1000-8000-00805F9B34FB"
    BLE_TOKEN_ROTATION_SECONDS: int = 10
    DEFAULT_MIN_RSSI: int = -85
    RSSI_VARIANCE_TOLERANCE: int = 15
    CHALLENGE_TIMEOUT_SECONDS: int = 60

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN_MAX_REQUESTS: int = 10
    RATE_LIMIT_REGISTER_MAX_REQUESTS: int = 10
    RATE_LIMIT_SUBMIT_MAX_REQUESTS: int = 30
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        env = (self.ENVIRONMENT or "development").strip().lower()
        if env == "production":
            # 1. Enforce strong, non-default SECRET_KEY
            if not self.SECRET_KEY or self.SECRET_KEY == DEFAULT_DEV_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: In production environment, SECRET_KEY must be "
                    "explicitly provided via environment variable and must be at least 32 characters long. "
                    "The default development key is strictly prohibited in production."
                )
            # 2. Enforce DEBUG is False
            if self.DEBUG:
                raise ValueError(
                    "CRITICAL CONFIGURATION ERROR: DEBUG must be set to False in production."
                )
            # 3. Forbid SQLite in production
            if self.DATABASE_URL.startswith("sqlite"):
                raise ValueError(
                    "CRITICAL DATABASE CONFIGURATION ERROR: In production, DATABASE_URL must point to a "
                    "persistent PostgreSQL database (e.g., postgresql://user:pass@host/db), not local SQLite."
                )
            # 4. Enforce demo seeding is disabled by default in production
            if self.SEED_DEMO_DATA is None:
                self.SEED_DEMO_DATA = False
            if self.AUTO_CREATE_TABLES is None:
                self.AUTO_CREATE_TABLES = False
        else:
            # Development defaults
            if self.SEED_DEMO_DATA is None:
                self.SEED_DEMO_DATA = True
            if self.AUTO_CREATE_TABLES is None:
                self.AUTO_CREATE_TABLES = True

        return self


settings = Settings()
