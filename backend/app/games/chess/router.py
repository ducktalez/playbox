"""Chess Variants — API router.

Endpoints for creating games, making moves, and querying game state.
Uses in-memory storage — data resets on server restart.

Supported variants:
  - STANDARD (8×8) — fully playable via ``python-chess``
  - MINI_6X8 / MINI_7X8 — planned, returns 501 until engine is implemented
"""

import uuid

from fastapi import APIRouter, Depends, Query

from app.games.chess.schemas import (
    GameCreateIn,
    GameOut,
    MoveIn,
    MoveOut,
    ResignIn,
)
from app.games.chess.service import ChessService, get_chess_service

router = APIRouter()


@router.get("/status")
async def status() -> dict[str, str]:
    """Chess module status."""
    return {
        "status": "active",
        "message": "Standard 8×8 chess is playable. Mini variants (6×8, 7×8) are planned.",
    }


@router.post("/games", response_model=GameOut)
async def create_game(
    body: GameCreateIn,
    service: ChessService = Depends(get_chess_service),
) -> GameOut:
    """Create a new chess game.

    Variants: STANDARD (8×8), MINI_6X8, MINI_7X8.
    Player names default to 'Player 1' / 'Player 2' if empty.
    """
    return service.create_game(data=body)


@router.get("/games", response_model=list[GameOut])
async def list_games(
    limit: int = Query(default=20, ge=1, le=100),
    service: ChessService = Depends(get_chess_service),
) -> list[GameOut]:
    """List recent games (newest first)."""
    return service.list_games(limit=limit)


@router.get("/games/{game_id}", response_model=GameOut)
async def get_game(
    game_id: uuid.UUID,
    service: ChessService = Depends(get_chess_service),
) -> GameOut:
    """Get the current state of a game including legal moves."""
    return service.get_game(game_id=game_id)


@router.post("/games/{game_id}/move", response_model=MoveOut)
async def make_move(
    game_id: uuid.UUID,
    body: MoveIn,
    service: ChessService = Depends(get_chess_service),
) -> MoveOut:
    """Submit a move in UCI notation (e.g. 'e2e4', 'g1f3', 'e7e8q' for promotion)."""
    return service.make_move(game_id=game_id, data=body)


@router.post("/games/{game_id}/resign", response_model=GameOut)
async def resign_game(
    game_id: uuid.UUID,
    body: ResignIn,
    service: ChessService = Depends(get_chess_service),
) -> GameOut:
    """Resign a game for the specified color (WHITE or BLACK)."""
    return service.resign(game_id=game_id, data=body)
