import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ProxyProof"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Security
    SECRET_KEY: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DATABASE_URL: str = "sqlite:///./proxyproof.db"

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
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


settings = Settings()
