from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "Factory OS"
    APP_ENV: str = "development"
    DEBUG: bool = True

    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql://postgres:cagtu@localhost:5432/fastapi"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: list[str] = ["*"]
    CSRF_SECRET_KEY: str = "csrf-secret-change-me"

    COOKIE_SECURE: bool = False

    UPLOAD_MAX_SIZE_MB: int = 10
    UPLOAD_ALLOWED_TYPES: list[str] = [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]

    # Public base URL of the frontend app, used to build links inside emails
    # (password reset, email verification). No trailing slash.
    FRONTEND_URL: str = "http://localhost:3000"

    # Email delivery. When SMTP_HOST is empty the app falls back to a
    # console mailer that prints the message (including any reset/verify link)
    # to stdout — perfect for local development without an SMTP server.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    MAIL_FROM: str = "Mero Udhyog <no-reply@meroudhyog.com>"

    # How long password-reset and email-verification links stay valid.
    RESET_TOKEN_EXPIRE_MINUTES: int = 60
    VERIFY_TOKEN_EXPIRE_HOURS: int = 48

    # Require email verification before login is allowed. Off by default so
    # existing workspaces are never locked out.
    REQUIRE_EMAIL_VERIFICATION: bool = False

    # Web Push (lock-screen notifications). VAPID_PUBLIC_KEY is the base64url
    # encoded uncompressed P-256 public key; VAPID_PRIVATE_KEY is the base64url
    # encoded PKCS8 PEM of the matching private key (as emitted by `web-push
    # generate-vapid-keys`). Leave empty to disable push while keeping the
    # in-app notification center.
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()