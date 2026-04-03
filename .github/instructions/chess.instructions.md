---
applyTo: "**/games/chess/**"
---
# Chess Instructions

These instructions apply to both backend and frontend files for the Chess game.

## Scope
- Chess is explicitly the lowest-priority game in the repo.
- Keep any implementation minimal until Imposter, Piccolo, and Quiz are further along.
- Avoid broad shared abstractions built only for chess.

## Architecture
- **Engine:** `python-chess` for standard 8×8 via `StandardEngine`. Abstract `ChessEngine` ABC allows plugging in custom engines for variants (6×8, 7×8) via `VariantEngine`.
- **Storage:** In-memory game store (`dict[UUID, dict]`). No database persistence — data resets on restart.
- **API:** REST endpoints at `/api/v1/chess/` — create game, get state, make move (UCI notation), resign.
- **Frontend:** CSS Grid board + Unicode pieces. Click-to-select + click-to-move (no drag-and-drop). Auto-promote pawns to queen.

## Backend Rules
- Add only the smallest API surface needed for current work.
- Prefer in-memory state during development unless persistence becomes technically necessary.
- Keep variant logic self-contained within the chess module.
- Error codes: `GAME_NOT_FOUND`, `GAME_ALREADY_OVER`, `INVALID_MOVE`, `INVALID_VARIANT`, `VARIANT_NOT_IMPLEMENTED`, `INVALID_COLOR`.
- Use `AppError` from `app.core.errors` for all error responses.

## Frontend Rules
- Favor a basic playable MVP over feature-rich UI.
- Do not add speculative multiplayer, engine hosting, or account systems.
- Prefer app-like fullscreen board views and touch-friendly controls.
- Keep chess interactions workable on phones first during development.
- Any board or move UI should remain isolated to `frontend/src/games/chess/`.
- No external chess board library — CSS Grid + Unicode is sufficient for MVP.

## Current Focus
- Standard 8×8 chess is fully playable (MVP complete).
- Mini-board variants (6×8, 7×8) are stubbed — `VariantEngine` raises `NotImplementedError`.
- Next: implement `VariantEngine` with custom move generation if demand arises.
- Client-side offline support deferred (would require `chess.js` or equivalent).

## File Structure
```
backend/app/games/chess/
├── __init__.py     # Package docstring
├── engine.py       # ChessEngine ABC, StandardEngine (python-chess), VariantEngine (stub)
├── schemas.py      # Pydantic request/response models
├── service.py      # Business logic, in-memory game store
└── router.py       # FastAPI endpoints

frontend/src/games/chess/
├── api.ts          # Fetch wrapper for chess API
├── chess.css       # Styles (mobile-first)
├── ChessBoard.tsx  # Interactive board component
└── ChessGame.tsx   # Main game component (setup → play → result)
```
