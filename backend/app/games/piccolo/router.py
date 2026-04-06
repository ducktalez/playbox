"""Piccolo — API router."""

import uuid

from fastapi import APIRouter

from app.core.config import settings
from app.games.piccolo.schemas import (
    ChallengeOut,
    ChallengeFeedbackIn,
    ChallengeFeedbackOut,
    ChallengeTemplateOut,
    SessionCreateIn,
    SessionOut,
)
from app.games.piccolo.service import PiccoloService

router = APIRouter()
service = PiccoloService()


@router.get("/offline-bundle")
async def offline_bundle() -> dict:
    """Return all challenges + categories as a single JSON bundle for offline caching."""
    challenges = service.get_challenges(category=None, intensity=None)
    limit = settings.offline_piccolo_challenges
    if limit > 0:
        challenges = challenges[:limit]
    categories = service.get_categories()
    return {"challenges": [c.model_dump() for c in challenges], "categories": categories}


@router.get("/categories")
async def get_categories() -> list[str]:
    """Get available challenge categories."""
    return service.get_categories()


@router.get("/challenges")
async def get_challenges(
    category: str | None = None,
    intensity: str | None = None,
) -> list[ChallengeTemplateOut]:
    """Get challenge templates, optionally filtered by category and/or intensity."""
    return service.get_challenges(category=category, intensity=intensity)


@router.post("/session")
async def create_session(body: SessionCreateIn) -> SessionOut:
    """Create a new Piccolo game session."""
    return service.create_session(
        player_names=body.player_names,
        intensity=body.intensity,
        categories=body.categories,
    )


@router.get("/session/{session_id}/next")
async def next_challenge(session_id: uuid.UUID) -> ChallengeOut:
    """Get the next challenge for a session."""
    return service.next_challenge(session_id=session_id)


@router.post("/challenges/feedback")
async def submit_feedback(body: ChallengeFeedbackIn) -> ChallengeFeedbackOut:
    """Submit feedback on a challenge template."""
    return service.submit_feedback(data=body)


@router.get("/challenges/feedback")
async def list_feedback(
    challenge_text: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ChallengeFeedbackOut]:
    """List feedback entries, optionally filtered by challenge template text."""
    return service.list_feedback(challenge_text=challenge_text, limit=limit, offset=offset)


