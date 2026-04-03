"""Chess Variants — Pydantic schemas for API request/response models."""

from pydantic import BaseModel, Field

# --- Enums as uppercase string sets (project convention) ---

VARIANTS = {"STANDARD", "MINI_6X8", "MINI_7X8"}
"""Supported board variants. STANDARD = 8×8, MINI_6X8 = 6×8, MINI_7X8 = 7×8."""

GAME_STATUSES = {"ACTIVE", "CHECK", "CHECKMATE", "STALEMATE", "DRAW", "RESIGNED"}
"""Possible game lifecycle states."""

COLORS = {"WHITE", "BLACK"}
"""Player colors / turn indicator."""


# --- Request schemas ---


class GameCreateIn(BaseModel):
    """Request body for creating a new chess game."""

    variant: str = Field(default="STANDARD", description="Board variant: STANDARD, MINI_6X8, MINI_7X8")
    player_white: str = Field(default="", max_length=50, description="White player name (fallback: Player 1)")
    player_black: str = Field(default="", max_length=50, description="Black player name (fallback: Player 2)")


class MoveIn(BaseModel):
    """Request body for submitting a move."""

    uci: str = Field(..., min_length=4, max_length=5, description="Move in UCI notation, e.g. 'e2e4'")


class ResignIn(BaseModel):
    """Request body for resigning a game."""

    color: str = Field(..., description="Color of the resigning player: WHITE or BLACK")


# --- Response schemas ---


class GameOut(BaseModel):
    """Full game state returned by the API."""

    id: str
    variant: str
    player_white: str
    player_black: str
    fen: str
    status: str
    turn: str
    move_history: list[str] = []
    legal_moves: list[str] = []
    captured_white: list[str] = []  # pieces captured BY white (i.e. black pieces taken)
    captured_black: list[str] = []  # pieces captured BY black (i.e. white pieces taken)


class MoveOut(BaseModel):
    """Response after a successful move."""

    game: GameOut
    captured: str | None = None
    is_check: bool = False
    is_checkmate: bool = False

