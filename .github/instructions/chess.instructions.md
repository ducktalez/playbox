---
applyTo: "**/games/chess/**"
---
# Chess Instructions

These instructions apply to both backend and frontend files for the Chess game.

## Scope
- Chess is explicitly the lowest-priority game in the repo.
- Keep any implementation minimal until Imposter, Piccolo, and Quiz are further along.
- Avoid broad shared abstractions built only for chess.

## Backend Rules
- Add only the smallest API surface needed for current work.
- Prefer in-memory state during development unless persistence becomes technically necessary.
- Keep variant logic self-contained within the chess module.

## Frontend Rules
- Favor a basic playable or inspectable MVP over feature-rich UI.
- Do not add speculative multiplayer, engine hosting, or account systems.
- Prefer app-like fullscreen board views and touch-friendly controls when they help the active game screen.
- Keep chess interactions workable on phones first during development.
- Any board or move UI should remain isolated to `frontend/src/games/chess/`.

## Current Focus
- Evaluation and MVP groundwork are acceptable.
- Large architectural investment is deferred until higher-priority games are stable.



