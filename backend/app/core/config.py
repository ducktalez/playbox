"""PlayBox — Core configuration."""

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "PlayBox"
    debug: bool = False

    # Database (Quiz game) - Defaulting to SQLite for simpler local dev, configure for PostgreSQL if needed
    database_url: str = "sqlite:///./data/quiz.db"

    # SQLite (Imposter/Piccolo — offline data)
    sqlite_url: str = "sqlite:///./data/local.db"

    # CORS - In development, allow all origins. In production, restrict.
    cors_origins: list[str] = ["*"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def set_cors_origins(cls, v, info):
        """Allow all origins in development mode, restrict in production."""
        if info.data.get("debug"):
            return ["*"]  # Allow all in development
        # In production, restrict to known hosts
        return [
            "http://localhost:5173",
            "http://localhost:8015",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8015",
        ]

    # Media
    media_dir: str = "./media"
    max_media_size_mb: int = 50

    # Offline cache sizes — how many items to include in offline bundles
    # 0 = all available items (for small datasets like word lists / challenges)
    offline_quiz_questions: int = 0
    offline_imposter_words: int = 0
    offline_piccolo_challenges: int = 0

    model_config = {"env_prefix": "PLAYBOX_", "env_file": ROOT_ENV_FILE}


settings = Settings()
