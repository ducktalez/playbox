"""Piccolo — API router."""

import uuid

from fastapi import APIRouter

from app.games.piccolo.schemas import ChallengeOut, SessionCreateIn, SessionOut
from app.games.piccolo.service import PiccoloService

router = APIRouter()
service = PiccoloService()


@router.get("/categories")
async def get_categories() -> list[str]:
    """Get available challenge categories."""
    return service.get_categories()


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

