"""PlayBox — Database setup."""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlmodel import SQLModel

from app.core.config import settings

# Ensure data directory exists for SQLite
_data_dir = Path(__file__).resolve().parents[2] / "data"
_data_dir.mkdir(exist_ok=True)

# PostgreSQL engine (Quiz game) - Supports SQLite fallback
pg_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
pg_engine = create_engine(settings.database_url, echo=False, connect_args=pg_connect_args)
PgSessionLocal = sessionmaker(bind=pg_engine, class_=Session, expire_on_commit=False)

# SQLite engine (Imposter/Piccolo local data)
sqlite_engine = create_engine(settings.sqlite_url, echo=False, connect_args={"check_same_thread": False})
SqliteSessionLocal = sessionmaker(bind=sqlite_engine, class_=Session, expire_on_commit=False)


def get_pg_session() -> Generator[Session, None, None]:
    """Dependency: yield a PostgreSQL session."""
    session = PgSessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_sqlite_session() -> Generator[Session, None, None]:
    """Dependency: yield a SQLite session."""
    session = SqliteSessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_pg_db() -> None:
    """Create all PostgreSQL tables (use Alembic in production)."""
    SQLModel.metadata.create_all(pg_engine)


def init_sqlite_db() -> None:
    """Create all SQLite tables."""
    SQLModel.metadata.create_all(sqlite_engine)

