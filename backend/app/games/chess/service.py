"""Chess Variants — Game service / business logic.

In-memory game store — no database persistence (data resets on restart).
This follows the same pattern as the Imposter service.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.errors import AppError
from app.games.chess.engine import ChessEngine, create_engine
from app.games.chess.schemas import (
    COLORS,
    VARIANTS,
    GameCreateIn,
    GameOut,
    MoveIn,
    MoveOut,
    ResignIn,
)

# In-memory game storage — maps game ID to game state dict
_games: dict[uuid.UUID, dict] = {}


class ChessService:
    """Business logic for the Chess game."""

    def create_game(self, data: GameCreateIn) -> GameOut:
        """Create a new chess game with the specified variant and players."""
        variant = data.variant.upper()
        if variant not in VARIANTS:
            raise AppError(
                422,
                f"Unknown variant '{data.variant}'. Supported: {', '.join(sorted(VARIANTS))}",
                "INVALID_VARIANT",
            )

        try:
            engine = create_engine(variant)
        except NotImplementedError as exc:
            raise AppError(501, str(exc), "VARIANT_NOT_IMPLEMENTED") from exc

        game_id = uuid.uuid4()
        game_state = {
            "id": game_id,
            "variant": variant,
            "player_white": data.player_white.strip() or "Player 1",
            "player_black": data.player_black.strip() or "Player 2",
            "engine": engine,
            "status": "ACTIVE",
            "move_history": [],
            "captured_white": [],  # pieces captured BY white
            "captured_black": [],  # pieces captured BY black
            "created_at": datetime.now(UTC),
        }
        _games[game_id] = game_state
        return self._game_to_out(game_state)

    def get_game(self, game_id: uuid.UUID) -> GameOut:
        """Get the current state of a game."""
        game_state = _games.get(game_id)
        if not game_state:
            raise AppError(404, "Game not found", "GAME_NOT_FOUND")
        return self._game_to_out(game_state)

    def list_games(self, limit: int = 20) -> list[GameOut]:
        """List recent games (newest first)."""
        sorted_games = sorted(
            _games.values(),
            key=lambda g: g["created_at"],
            reverse=True,
        )
        return [self._game_to_out(g) for g in sorted_games[:limit]]

    def make_move(self, game_id: uuid.UUID, data: MoveIn) -> MoveOut:
        """Apply a move to a game. Returns the updated game state and move details."""
        game_state = _games.get(game_id)
        if not game_state:
            raise AppError(404, "Game not found", "GAME_NOT_FOUND")

        if game_state["status"] not in ("ACTIVE", "CHECK"):
            raise AppError(400, "Game is already over", "GAME_ALREADY_OVER")

        engine: ChessEngine = game_state["engine"]

        try:
            captured = engine.push_move(data.uci.strip().lower())
        except ValueError as exc:
            raise AppError(422, str(exc), "INVALID_MOVE") from exc

        # Record captured piece
        if captured:
            # Determine who made the move (turn was the OPPOSITE before push, now it's the other side)
            # After push, turn has switched, so the mover was the opposite of current turn
            mover = "BLACK" if engine.turn() == "WHITE" else "WHITE"
            if mover == "WHITE":
                game_state["captured_white"].append(captured)
            else:
                game_state["captured_black"].append(captured)

        game_state["move_history"].append(data.uci.strip().lower())

        # Update status
        is_check = engine.is_check()
        is_checkmate = engine.is_checkmate()

        if is_checkmate:
            game_state["status"] = "CHECKMATE"
        elif engine.is_stalemate():
            game_state["status"] = "STALEMATE"
        elif engine.is_draw():
            game_state["status"] = "DRAW"
        elif is_check:
            game_state["status"] = "CHECK"
        else:
            game_state["status"] = "ACTIVE"

        return MoveOut(
            game=self._game_to_out(game_state),
            captured=captured,
            is_check=is_check,
            is_checkmate=is_checkmate,
        )

    def resign(self, game_id: uuid.UUID, data: ResignIn) -> GameOut:
        """Resign a game for the given color."""
        game_state = _games.get(game_id)
        if not game_state:
            raise AppError(404, "Game not found", "GAME_NOT_FOUND")

        if game_state["status"] not in ("ACTIVE", "CHECK"):
            raise AppError(400, "Game is already over", "GAME_ALREADY_OVER")

        color = data.color.upper()
        if color not in COLORS:
            raise AppError(422, f"Invalid color '{data.color}'. Must be WHITE or BLACK", "INVALID_COLOR")

        game_state["status"] = "RESIGNED"
        # Record who resigned by appending to move history
        game_state["move_history"].append(f"resign:{color.lower()}")
        return self._game_to_out(game_state)

    @staticmethod
    def _game_to_out(game_state: dict) -> GameOut:
        """Convert internal game state to the API response schema."""
        engine: ChessEngine = game_state["engine"]
        is_over = game_state["status"] in ("CHECKMATE", "STALEMATE", "DRAW", "RESIGNED")

        return GameOut(
            id=str(game_state["id"]),
            variant=game_state["variant"],
            player_white=game_state["player_white"],
            player_black=game_state["player_black"],
            fen=engine.get_fen(),
            status=game_state["status"],
            turn=engine.turn(),
            move_history=game_state["move_history"],
            legal_moves=[] if is_over else engine.legal_moves(),
            captured_white=game_state["captured_white"],
            captured_black=game_state["captured_black"],
        )


# Module-level singleton for the router dependency
_service = ChessService()


def get_chess_service() -> ChessService:
    """Dependency: return the chess service singleton."""
    return _service
