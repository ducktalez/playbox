/**
 * ChessGame — Main component: setup → gameplay → result.
 *
 * Supports standard 8×8 chess. Mini variants (6×8, 7×8) show a
 * "coming soon" message until the backend engine is implemented.
 */

import { useState, useCallback } from "react";
import ChessBoard from "./ChessBoard";
import { createGame, makeMove, resignGame, type GameState, type MoveResult } from "./api";
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { chessTranslations } from "./translations";
import "./chess.css";

const translations = mergeTranslations(coreTranslations, chessTranslations);

type Phase = "setup" | "playing" | "result";

export default function ChessGame() {
  const { t } = useTranslation(translations);
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
      setError(e instanceof Error ? e.message : t("setup.errorCreate"));
    }
  }, [nameWhite, nameBlack, t]);

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
        setError(e instanceof Error ? e.message : t("setup.errorMove"));
      }
    },
    [game, t]
  );

  const handleResign = useCallback(async () => {
    if (!game) return;
    setError("");
    try {
      const updated = await resignGame(game.id, game.turn as "WHITE" | "BLACK");
      setGame(updated);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("setup.error"));
    }
  }, [game, t]);

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
          <h1 className="chess-setup__title">{t("setup.title")}</h1>
          <p className="chess-setup__subtitle">{t("setup.subtitle")}</p>

          <div className="chess-setup__form">
            <label className="chess-setup__label">
              {t("setup.white")}
              <input
                className="chess-setup__input"
                type="text"
                placeholder={t("setup.whitePlaceholder")}
                value={nameWhite}
                onChange={(e) => setNameWhite(e.target.value)}
                maxLength={50}
              />
            </label>
            <label className="chess-setup__label">
              {t("setup.black")}
              <input
                className="chess-setup__input"
                type="text"
                placeholder={t("setup.blackPlaceholder")}
                value={nameBlack}
                onChange={(e) => setNameBlack(e.target.value)}
                maxLength={50}
              />
            </label>
          </div>

          <button className="chess-start-btn" onClick={handleStart}>
            {t("setup.start")}
          </button>

          {error && <p className="chess-error">{error}</p>}

          <p className="chess-setup__hint">
            {t("setup.hint")}
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
          {t("playing.back")}
        </button>
        <div className="chess-header__info">
          <span className="chess-header__status">
            {t(`status.${game.status.toLowerCase()}`) || game.status}
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
        <span className="chess-captured__row" title={t("playing.captured", { name: game.player_white })}>
          ⬜ {game.captured_white.join(" ")}
        </span>
        <span className="chess-captured__row" title={t("playing.captured", { name: game.player_black })}>
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
          <span className="chess-history__label">{t("playing.moves")}</span>
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
          {t("playing.resign")}
        </button>
      )}

      {/* Result overlay */}
      {isOver && (
        <div className="chess-result">
          <h2 className="chess-result__title">
            {game.status === "CHECKMATE" && t("result.checkmate")}
            {game.status === "STALEMATE" && t("result.stalemate")}
            {game.status === "DRAW" && t("result.draw")}
            {game.status === "RESIGNED" && t("result.resigned")}
          </h2>
          {winner && (
            <p className="chess-result__winner">{t("result.winner", { name: winner })}</p>
          )}
          <p className="chess-result__moves">
            {t("result.movesPlayed", { n: game.move_history.filter((m) => !m.startsWith("resign:")).length })}
          </p>
          <button className="chess-start-btn" onClick={handlePlayAgain}>
            {t("playAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
