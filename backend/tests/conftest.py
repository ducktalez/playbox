"""Shared test fixtures for PlayBox backend tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlmodel import SQLModel

from app.core.database import get_pg_session
from app.main import create_app


@pytest.fixture(name="app")
def fixture_app():
    """Create a fresh FastAPI application for each test."""
    return create_app()


@pytest.fixture(name="client")
def fixture_client(app):
    """HTTP test client that talks to the FastAPI app."""
    return TestClient(app)


@pytest.fixture(name="db_engine")
def fixture_db_engine():
    """In-memory SQLite engine for quiz tests (no real PostgreSQL needed)."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(name="db_session")
def fixture_db_session(db_engine):
    """Yield a transactional DB session; rolls back after each test."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(name="quiz_client")
def fixture_quiz_client(app, db_session):
    """HTTP test client with quiz DB session overridden to use in-memory SQLite."""

    def _override_get_pg_session():
        yield db_session

    app.dependency_overrides[get_pg_session] = _override_get_pg_session
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

