"""Imposter — API router."""

import uuid

from fastapi import APIRouter

from app.core.config import settings
from app.games.imposter.schemas import (
    SessionCreateIn,
    SessionOut,
    WordOut,
    WordReportIn,
    WordReportOut,
)
from app.games.imposter.service import ImposterService

router = APIRouter()
service = ImposterService()


@router.get("/offline-bundle")
async def offline_bundle() -> dict:
    """Return all words + categories as a single JSON bundle for offline caching."""
    words = service.get_words(category=None)
    limit = settings.offline_imposter_words
    if limit > 0:
        words = words[:limit]
    categories = service.get_categories()
    return {"words": [w.model_dump() for w in words], "categories": categories}


@router.get("/words")
async def get_words(category: str | None = None) -> list[WordOut]:
    """Get available words, optionally filtered by category."""
    return service.get_words(category=category)


@router.get("/categories")
async def get_categories() -> list[str]:
    """Get all available word categories."""
    return service.get_categories()


@router.post("/words/{word_id}/report")
async def report_word(word_id: uuid.UUID, body: WordReportIn) -> WordReportOut:
    """Report a word as inappropriate."""
    return service.report_word(word_id=word_id, reason=body.reason)


@router.post("/session")
async def create_session(body: SessionCreateIn) -> SessionOut:
    """Create a new Imposter game session."""
    return service.create_session(
        player_names=body.player_names,
        category=body.category,
        timer_seconds=body.timer_seconds,
    )


@router.get("/session/{session_id}/reveal/{player_index}")
async def reveal_player(session_id: uuid.UUID, player_index: int) -> dict:
    """Reveal what a specific player sees (word or IMPOSTER)."""
    return service.reveal_player(session_id=session_id, player_index=player_index)

