"""PlayBox — Core configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "PlayBox"
    debug: bool = False

    # PostgreSQL (Quiz game)
    database_url: str = "postgresql://playbox:playbox@localhost:5432/playbox"

    # SQLite (Imposter/Piccolo — offline data)
    sqlite_url: str = "sqlite:///./data/local.db"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Media
    media_dir: str = "./media"
    max_media_size_mb: int = 50

    model_config = {"env_prefix": "PLAYBOX_", "env_file": "../.env"}


settings = Settings()

