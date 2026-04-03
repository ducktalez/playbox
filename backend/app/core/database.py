"""PlayBox — Database setup."""

import logging
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlmodel import SQLModel

from app.core.config import settings

logger = logging.getLogger(__name__)

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


def _auto_add_missing_columns(engine: Engine) -> None:
    """Dev-only: add columns that exist in SQLModel metadata but not in the DB.

    SQLAlchemy's ``create_all`` only creates missing *tables* — it never alters
    existing ones.  During rapid development new model fields frequently cause
    ``OperationalError: no such column``.  This helper inspects every registered
    table and issues ``ALTER TABLE … ADD COLUMN`` for anything that's missing.

    Only lightweight SQLite/PostgreSQL column additions are performed (no type
    changes, no constraint migrations).  Production should use Alembic.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, table in SQLModel.metadata.tables.items():
        if table_name not in existing_tables:
            continue  # create_all will handle brand-new tables

        existing_cols = {col["name"] for col in inspector.get_columns(table_name)}

        for column in table.columns:
            if column.name in existing_cols:
                continue

            # Build a portable column type string
            col_type = column.type.compile(engine.dialect)
            default_clause = ""
            if column.default is not None:
                arg = column.default.arg
                if isinstance(arg, str):
                    default_clause = f" DEFAULT '{arg}'"
                elif arg is not None and not callable(arg):
                    default_clause = f" DEFAULT {arg}"

            ddl = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}{default_clause}"
            logger.info("Auto-adding missing column: %s", ddl)
            with engine.begin() as conn:
                conn.execute(text(ddl))


def init_pg_db() -> None:
    """Create all PostgreSQL tables (use Alembic in production)."""
    SQLModel.metadata.create_all(pg_engine)
    _auto_add_missing_columns(pg_engine)


def init_sqlite_db() -> None:
    """Create all SQLite tables."""
    SQLModel.metadata.create_all(sqlite_engine)
    _auto_add_missing_columns(sqlite_engine)

