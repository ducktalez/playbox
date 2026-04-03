"""Chess Variants — Engine abstraction layer.

Provides a common interface for different board sizes. The standard 8×8
variant uses ``python-chess`` under the hood. Non-standard variants
(6×8, 7×8) have a stub engine that will be expanded later.

Design decision: We wrap ``python-chess`` instead of using it directly so
that the service layer never depends on a specific library. Adding a custom
engine for mini-boards later only requires implementing the same protocol.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import chess


class ChessEngine(ABC):
    """Abstract chess engine — protocol that all board variants implement."""

    @abstractmethod
    def get_fen(self) -> str:
        """Return the current board state as a FEN string."""

    @abstractmethod
    def legal_moves(self) -> list[str]:
        """Return a list of legal moves in UCI notation."""

    @abstractmethod
    def push_move(self, uci: str) -> str | None:
        """Apply a move in UCI notation. Return the captured piece symbol or None.

        Raises ``ValueError`` if the move is illegal.
        """

    @abstractmethod
    def is_check(self) -> bool:
        """Return True if the current side is in check."""

    @abstractmethod
    def is_checkmate(self) -> bool:
        """Return True if the current side is checkmated."""

    @abstractmethod
    def is_stalemate(self) -> bool:
        """Return True if the position is a stalemate (no legal moves, not in check)."""

    @abstractmethod
    def is_game_over(self) -> bool:
        """Return True if the game has ended (checkmate, stalemate, or draw)."""

    @abstractmethod
    def turn(self) -> str:
        """Return 'WHITE' or 'BLACK' indicating whose turn it is."""

    @abstractmethod
    def is_draw(self) -> bool:
        """Return True if the position is a draw (insufficient material, 50-move, etc.)."""


# Piece symbol mapping for captured pieces display
_PIECE_SYMBOLS: dict[int, str] = {
    chess.PAWN: "♙",
    chess.KNIGHT: "♘",
    chess.BISHOP: "♗",
    chess.ROOK: "♖",
    chess.QUEEN: "♕",
    chess.KING: "♔",
}

_PIECE_SYMBOLS_BLACK: dict[int, str] = {
    chess.PAWN: "♟",
    chess.KNIGHT: "♞",
    chess.BISHOP: "♝",
    chess.ROOK: "♜",
    chess.QUEEN: "♛",
    chess.KING: "♚",
}


class StandardEngine(ChessEngine):
    """Standard 8×8 chess engine backed by ``python-chess``."""

    def __init__(self) -> None:
        self._board = chess.Board()

    def get_fen(self) -> str:
        return self._board.fen()

    def legal_moves(self) -> list[str]:
        return [move.uci() for move in self._board.legal_moves]

    def push_move(self, uci: str) -> str | None:
        try:
            move = chess.Move.from_uci(uci)
        except (ValueError, chess.InvalidMoveError) as exc:
            raise ValueError(f"Invalid UCI notation: {uci}") from exc

        if move not in self._board.legal_moves:
            raise ValueError(f"Illegal move: {uci}")

        # Check if a piece is captured before pushing
        captured_piece = self._board.piece_at(move.to_square)
        captured_symbol: str | None = None
        if captured_piece is not None:
            symbols = _PIECE_SYMBOLS_BLACK if captured_piece.color == chess.BLACK else _PIECE_SYMBOLS
            captured_symbol = symbols.get(captured_piece.piece_type, "?")

        # Handle en passant capture
        if self._board.is_en_passant(move):
            captured_symbol = "♟" if self._board.turn == chess.WHITE else "♙"

        self._board.push(move)
        return captured_symbol

    def is_check(self) -> bool:
        return self._board.is_check()

    def is_checkmate(self) -> bool:
        return self._board.is_checkmate()

    def is_stalemate(self) -> bool:
        return self._board.is_stalemate()

    def is_game_over(self) -> bool:
        return self._board.is_game_over()

    def turn(self) -> str:
        return "WHITE" if self._board.turn == chess.WHITE else "BLACK"

    def is_draw(self) -> bool:
        return (
            self._board.is_stalemate()
            or self._board.is_insufficient_material()
            or self._board.is_fifty_moves()
            or self._board.is_repetition()
        )


class VariantEngine(ChessEngine):
    """Placeholder engine for non-standard board sizes (6×8, 7×8).

    # TODO: post-dev — implement custom move generation for mini boards.
    The abstraction is ready; only this class needs a real implementation.
    """

    def __init__(self, rows: int, cols: int = 8) -> None:
        self._rows = rows
        self._cols = cols
        raise NotImplementedError(
            f"{rows}×{cols} chess variant engine is not yet implemented. "
            "Only STANDARD (8×8) is available in the current MVP."
        )

    # ABC methods — unreachable until __init__ is implemented
    def get_fen(self) -> str: ...  # type: ignore[empty-body]
    def legal_moves(self) -> list[str]: ...  # type: ignore[empty-body]
    def push_move(self, uci: str) -> str | None: ...  # type: ignore[empty-body]
    def is_check(self) -> bool: ...  # type: ignore[empty-body]
    def is_checkmate(self) -> bool: ...  # type: ignore[empty-body]
    def is_stalemate(self) -> bool: ...  # type: ignore[empty-body]
    def is_game_over(self) -> bool: ...  # type: ignore[empty-body]
    def turn(self) -> str: ...  # type: ignore[empty-body]
    def is_draw(self) -> bool: ...  # type: ignore[empty-body]


def create_engine(variant: str) -> ChessEngine:
    """Factory: return the right engine for a given variant string.

    Raises ``ValueError`` for unknown or unimplemented variants.
    """
    if variant == "STANDARD":
        return StandardEngine()
    if variant == "MINI_6X8":
        return VariantEngine(rows=6, cols=8)
    if variant == "MINI_7X8":
        return VariantEngine(rows=7, cols=8)
    raise ValueError(f"Unknown chess variant: {variant}")

