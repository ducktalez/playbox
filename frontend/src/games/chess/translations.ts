import type { TranslationBundle } from "../../core/i18n";

export const chessTranslations: TranslationBundle = {
  de: {
    // Status labels
    "status.active": "Am Zug",
    "status.check": "Schach!",
    "status.checkmate": "Schachmatt!",
    "status.stalemate": "Patt",
    "status.draw": "Remis",
    "status.resigned": "Aufgegeben",

    // Setup
    "setup.title": "♟️ Schach",
    "setup.subtitle": "Lokales 1v1 auf einem Gerät",
    "setup.white": "⬜ Weiß",
    "setup.black": "⬛ Schwarz",
    "setup.whitePlaceholder": "Spieler 1",
    "setup.blackPlaceholder": "Spieler 2",
    "setup.start": "Spiel starten",
    "setup.hint": "Standard 8×8 Schach · Mini-Varianten (6×8, 7×8) folgen bald",
    "setup.errorCreate": "Fehler beim Erstellen",
    "setup.errorMove": "Ungültiger Zug",
    "setup.error": "Fehler",

    // Playing
    "playing.back": "← Zurück",
    "playing.captured": "{name} hat geschlagen",
    "playing.moves": "Züge:",
    "playing.resign": "🏳️ Aufgeben",

    // Result
    "result.checkmate": "♚ Schachmatt!",
    "result.stalemate": "Patt — Unentschieden",
    "result.draw": "Remis — Unentschieden",
    "result.resigned": "🏳️ Aufgegeben",
    "result.winner": "{name} gewinnt!",
    "result.movesPlayed": "{n} Züge gespielt",
  },

  en: {
    "status.active": "Your turn",
    "status.check": "Check!",
    "status.checkmate": "Checkmate!",
    "status.stalemate": "Stalemate",
    "status.draw": "Draw",
    "status.resigned": "Resigned",

    "setup.title": "♟️ Chess",
    "setup.subtitle": "Local 1v1 on one device",
    "setup.white": "⬜ White",
    "setup.black": "⬛ Black",
    "setup.whitePlaceholder": "Player 1",
    "setup.blackPlaceholder": "Player 2",
    "setup.start": "Start game",
    "setup.hint": "Standard 8×8 chess · Mini variants (6×8, 7×8) coming soon",
    "setup.errorCreate": "Error creating game",
    "setup.errorMove": "Invalid move",
    "setup.error": "Error",

    "playing.back": "← Back",
    "playing.captured": "{name} captured",
    "playing.moves": "Moves:",
    "playing.resign": "🏳️ Resign",

    "result.checkmate": "♚ Checkmate!",
    "result.stalemate": "Stalemate — Draw",
    "result.draw": "Draw",
    "result.resigned": "🏳️ Resigned",
    "result.winner": "{name} wins!",
    "result.movesPlayed": "{n} moves played",
  },
};

