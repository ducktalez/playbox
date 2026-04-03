/**
 * ChessBoard — Interactive 8×8 chessboard rendered with CSS Grid + Unicode pieces.
 *
 * Features:
 * - Click-to-select piece, click-to-move (no drag & drop for MVP)
 * - Legal move highlighting (dots on empty squares, rings on captures)
 * - Last-move highlighting
 * - Mobile-first: board fills container width with large tap targets
 * - FEN string parsing for piece placement
 */

import { useState, useMemo, useCallback } from "react";

// Unicode chess piece symbols
const PIECE_MAP: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"]; // top to bottom

type Square = string; // e.g. "e4"

type Props = {
  fen: string;
  legalMoves: string[];
  turn: string;
  onMove: (uci: string) => void;
  disabled?: boolean;
  lastMove?: string; // UCI of last move, e.g. "e2e4"
};

/** Parse FEN board section into a map of square → piece char */
function parseFen(fen: string): Map<string, string> {
  const board = new Map<string, string>();
  const ranks = fen.split(" ")[0].split("/");
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= "1" && ch <= "8") {
        file += parseInt(ch);
      } else {
        const sq = FILES[file] + RANKS[r];
        board.set(sq, ch);
        file++;
      }
    }
  }
  return board;
}

export default function ChessBoard({
  fen,
  legalMoves,
  turn,
  onMove,
  disabled = false,
  lastMove,
}: Props) {
  const [selected, setSelected] = useState<Square | null>(null);

  const board = useMemo(() => parseFen(fen), [fen]);

  // Which squares can the selected piece move to?
  const targetSquares = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      legalMoves
        .filter((m) => m.startsWith(selected))
        .map((m) => m.slice(2, 4))
    );
  }, [selected, legalMoves]);

  // Squares from last move for highlighting
  const lastMoveSquares = useMemo(() => {
    if (!lastMove || lastMove.length < 4) return new Set<string>();
    return new Set([lastMove.slice(0, 2), lastMove.slice(2, 4)]);
  }, [lastMove]);

  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (disabled) return;

      // If a piece is selected and this is a valid target → move
      if (selected && targetSquares.has(sq)) {
        const uci = selected + sq;
        // Check for pawn promotion (pawn reaches last rank)
        const piece = board.get(selected);
        const isPromotion =
          piece &&
          (piece === "P" || piece === "p") &&
          (sq[1] === "8" || sq[1] === "1");
        onMove(isPromotion ? uci + "q" : uci); // auto-promote to queen for MVP
        setSelected(null);
        return;
      }

      // Select own piece
      const piece = board.get(sq);
      if (piece) {
        const isWhitePiece = piece === piece.toUpperCase();
        const isMyTurn =
          (turn === "WHITE" && isWhitePiece) ||
          (turn === "BLACK" && !isWhitePiece);
        if (isMyTurn) {
          setSelected(sq === selected ? null : sq);
          return;
        }
      }

      // Click empty or opponent → deselect
      setSelected(null);
    },
    [disabled, selected, targetSquares, board, turn, onMove]
  );

  return (
    <div className="chess-board-wrapper">
      {/* Rank labels (left side) */}
      <div className="chess-board" role="grid" aria-label="Chessboard">
        {RANKS.map((rank, r) =>
          FILES.map((file, f) => {
            const sq = file + rank;
            const piece = board.get(sq);
            const isDark = (r + f) % 2 === 1;
            const isSelected = sq === selected;
            const isTarget = targetSquares.has(sq);
            const isLastMove = lastMoveSquares.has(sq);
            const isCapture = isTarget && board.has(sq);

            let className = "chess-square";
            className += isDark ? " chess-square--dark" : " chess-square--light";
            if (isSelected) className += " chess-square--selected";
            if (isLastMove) className += " chess-square--last-move";
            if (isTarget && !disabled) className += " chess-square--target";

            return (
              <button
                key={sq}
                className={className}
                onClick={() => handleSquareClick(sq)}
                aria-label={`${sq}${piece ? ` ${piece}` : ""}`}
                data-square={sq}
              >
                {/* File label on bottom rank */}
                {rank === "1" && (
                  <span className="chess-square__file-label">{file}</span>
                )}
                {/* Rank label on A file */}
                {file === "a" && (
                  <span className="chess-square__rank-label">{rank}</span>
                )}
                {/* Piece */}
                {piece && (
                  <span
                    className={`chess-piece ${piece === piece.toUpperCase() ? "chess-piece--white" : "chess-piece--black"}`}
                  >
                    {PIECE_MAP[piece] ?? piece}
                  </span>
                )}
                {/* Move indicator */}
                {isTarget && !disabled && (
                  <span
                    className={
                      isCapture
                        ? "chess-move-indicator chess-move-indicator--capture"
                        : "chess-move-indicator"
                    }
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

