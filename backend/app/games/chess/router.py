"""Chess Variants — API router (placeholder).

This game is low priority and will be implemented after
Imposter, Piccolo, and Quiz are stable.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def status() -> dict[str, str]:
    """Chess game status — not yet implemented."""
    return {"status": "planned", "message": "Chess variants are not yet implemented."}

