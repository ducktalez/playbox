"""Piccolo — API router."""

import uuid

from fastapi import APIRouter

from app.games.piccolo.schemas import ChallengeOut, ChallengeTemplateOut, SessionCreateIn, SessionOut
from app.games.piccolo.service import PiccoloService

router = APIRouter()
service = PiccoloService()


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

