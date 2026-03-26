"""Shared test fixtures for PlayBox backend tests."""

import sys
from pathlib import Path

# Ensure 'backend/' is on sys.path so that 'app.*' imports resolve to the
# same modules the application itself uses.  Without this, dependency_overrides
# silently fails because Python treats 'backend.app.core.database.get_pg_session'
# and 'app.core.database.get_pg_session' as two different function objects.
_backend_dir = str(Path(__file__).resolve().parents[1])
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlmodel import SQLModel

from app.core.database import get_pg_session
from app.main import create_app


# --- Categories and question templates for mock data ---
_MOCK_CATEGORIES = ["Geschichte", "Geographie", "Alltag", "Technik"]

_MOCK_QUESTIONS: list[dict] = [
    # 5 per category = 20 total
    *[
        {
            "text": f"Frage {i + 1} aus {cat}?",
            "answers": [
                {"text": "Antwort A", "is_correct": True},
                {"text": "Antwort B", "is_correct": False},
                {"text": "Antwort C", "is_correct": False},
                {"text": "Antwort D", "is_correct": False},
            ],
            "tags": [cat.lower()],
            "_cat": cat,
        }
        for cat in _MOCK_CATEGORIES
        for i in range(5)
    ]
]


def _seed_mock_questions(client: TestClient) -> None:
    """Insert all mock questions via the API. Idempotent across repeated calls."""
    cat_ids: dict[str, str] = {}
    for name in _MOCK_CATEGORIES:
        r = client.post("/api/v1/quiz/categories", json={"name": name, "description": ""})
        if r.status_code == 200:
            cat_ids[name] = r.json()["id"]

    # Re-fetch in case categories already existed
    cats = client.get("/api/v1/quiz/categories").json()
    for c in cats:
        cat_ids.setdefault(c["name"], c["id"])

    for q in _MOCK_QUESTIONS:
        payload = {k: v for k, v in q.items() if k != "_cat"}
        cat = q.get("_cat")
        if cat and cat in cat_ids:
            payload["category_id"] = cat_ids[cat]
        client.post("/api/v1/quiz/questions", json=payload)


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


@pytest.fixture(name="seeded_quiz_client")
def fixture_seeded_quiz_client(quiz_client: TestClient) -> TestClient:
    """quiz_client pre-seeded with 20 mock questions across 4 categories.

    Use this fixture when a test needs a non-empty question pool, e.g. to
    start a Millionär session (needs 15) or a Speed/Duel session (needs 10).
    """
    _seed_mock_questions(quiz_client)
    return quiz_client

