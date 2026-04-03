/**
 * ChessGame — Main component: setup → gameplay → result.
 *
 * Supports standard 8×8 chess. Mini variants (6×8, 7×8) show a
 * "coming soon" message until the backend engine is implemented.
 */

import { useState, useCallback } from "react";
import ChessBoard from "./ChessBoard";
import { createGame, makeMove, resignGame, type GameState, type MoveResult } from "./api";
import "./chess.css";

type Phase = "setup" | "playing" | "result";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Am Zug",
  CHECK: "Schach!",
  CHECKMATE: "Schachmatt!",
  STALEMATE: "Patt",
  DRAW: "Remis",
  RESIGNED: "Aufgegeben",
};

export default function ChessGame() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [lastMove, setLastMove] = useState<string>("");
  const [nameWhite, setNameWhite] = useState("");
  const [nameBlack, setNameBlack] = useState("");

  // --- Setup ---
  const handleStart = useCallback(async () => {
    setError("");
    try {
      const g = await createGame("STANDARD", nameWhite, nameBlack);
      setGame(g);
      setLastMove("");
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Erstellen");
    }
  }, [nameWhite, nameBlack]);

  // --- Gameplay ---
  const handleMove = useCallback(
    async (uci: string) => {
      if (!game) return;
      setError("");
      try {
        const result: MoveResult = await makeMove(game.id, uci);
        setGame(result.game);
        setLastMove(uci);
        if (
          result.game.status === "CHECKMATE" ||
          result.game.status === "STALEMATE" ||
          result.game.status === "DRAW"
        ) {
          setPhase("result");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ungültiger Zug");
      }
    },
    [game]
  );

  const handleResign = useCallback(async () => {
    if (!game) return;
    setError("");
    try {
      const updated = await resignGame(game.id, game.turn as "WHITE" | "BLACK");
      setGame(updated);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }, [game]);

  const handlePlayAgain = useCallback(() => {
    setPhase("setup");
    setGame(null);
    setLastMove("");
    setError("");
  }, []);

  // --- SETUP SCREEN ---
  if (phase === "setup") {
    return (
      <div className="chess-container">
        <div className="chess-setup">
          <h1 className="chess-setup__title">♟️ Schach</h1>
          <p className="chess-setup__subtitle">Lokales 1v1 auf einem Gerät</p>

          <div className="chess-setup__form">
            <label className="chess-setup__label">
              ⬜ Weiß
              <input
                className="chess-setup__input"
                type="text"
                placeholder="Player 1"
                value={nameWhite}
                onChange={(e) => setNameWhite(e.target.value)}
                maxLength={50}
              />
            </label>
            <label className="chess-setup__label">
              ⬛ Schwarz
              <input
                className="chess-setup__input"
                type="text"
                placeholder="Player 2"
                value={nameBlack}
                onChange={(e) => setNameBlack(e.target.value)}
                maxLength={50}
              />
            </label>
          </div>

          <button className="chess-start-btn" onClick={handleStart}>
            Spiel starten
          </button>

          {error && <p className="chess-error">{error}</p>}

          <p className="chess-setup__hint">
            Standard 8×8 Schach · Mini-Varianten (6×8, 7×8) folgen bald
          </p>
        </div>
      </div>
    );
  }

  // --- PLAYING & RESULT SCREENS ---
  if (!game) return null;

  const isOver = phase === "result";
  const currentPlayer =
    game.turn === "WHITE" ? game.player_white : game.player_black;
  const winner =
    game.status === "CHECKMATE"
      ? game.turn === "WHITE"
        ? game.player_black
        : game.player_white
      : game.status === "RESIGNED"
        ? game.turn === "WHITE"
          ? game.player_black  // current turn resigned → other wins
          : game.player_white
        : null;

  return (
    <div className="chess-container">
      {/* Header */}
      <div className="chess-header">
        <button className="quiz-back-btn" onClick={handlePlayAgain}>
          ← Zurück
        </button>
        <div className="chess-header__info">
          <span className="chess-header__status">
            {STATUS_LABELS[game.status] ?? game.status}
          </span>
          {!isOver && (
            <span className="chess-header__turn">
              {currentPlayer} ({game.turn === "WHITE" ? "⬜" : "⬛"})
            </span>
          )}
        </div>
      </div>

      {/* Captured pieces */}
      <div className="chess-captured">
        <span className="chess-captured__row" title={`${game.player_white} hat geschlagen`}>
          ⬜ {game.captured_white.join(" ")}
        </span>
        <span className="chess-captured__row" title={`${game.player_black} hat geschlagen`}>
          ⬛ {game.captured_black.join(" ")}
        </span>
      </div>

      {/* Board */}
      <ChessBoard
        fen={game.fen}
        legalMoves={game.legal_moves}
        turn={game.turn}
        onMove={handleMove}
        disabled={isOver}
        lastMove={lastMove}
      />

      {/* Error */}
      {error && <p className="chess-error">{error}</p>}

      {/* Move history */}
      {game.move_history.length > 0 && (
        <div className="chess-history">
          <span className="chess-history__label">Züge:</span>
          <span className="chess-history__moves">
            {game.move_history
              .filter((m) => !m.startsWith("resign:"))
              .join(", ")}
          </span>
        </div>
      )}

      {/* Actions */}
      {!isOver && (
        <button className="chess-resign-btn" onClick={handleResign}>
          🏳️ Aufgeben
        </button>
      )}

      {/* Result overlay */}
      {isOver && (
        <div className="chess-result">
          <h2 className="chess-result__title">
            {game.status === "CHECKMATE" && "♚ Schachmatt!"}
            {game.status === "STALEMATE" && "Patt — Unentschieden"}
            {game.status === "DRAW" && "Remis — Unentschieden"}
            {game.status === "RESIGNED" && "🏳️ Aufgegeben"}
          </h2>
          {winner && (
            <p className="chess-result__winner">{winner} gewinnt!</p>
          )}
          <p className="chess-result__moves">
            {game.move_history.filter((m) => !m.startsWith("resign:")).length} Züge gespielt
          </p>
          <button className="chess-start-btn" onClick={handlePlayAgain}>
            Nochmal spielen
          </button>
        </div>
      )}
    </div>
  );
}
