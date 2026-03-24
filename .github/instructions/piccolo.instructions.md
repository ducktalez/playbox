---
applyTo: "**/games/piccolo/**"
---
# Piccolo Instructions

These instructions apply to both backend and frontend files for the Piccolo game.

## Scope
- Keep Piccolo fully isolated inside its own game module.
- Use in-memory challenge/session data during development.
- Do not introduce PostgreSQL or shared game logic across modules.

## Backend Rules
- Challenge templates stay file-based or in-memory unless a stronger need appears.
- The backend should remain filterable by category and intensity.
- Session progression stays lightweight and stateless beyond the in-memory session store.
- Prefer category-balanced session ordering so one overrepresented category does not dominate the round.
- If Piccolo later gains quiz-style prompts, they may be linked to Quizduell question content — document the linkage first, then implement only the technically necessary surface.

## Frontend Rules
- Focus on the local group flow: player setup, intensity/category selection, next challenge view.
- Keep the UI short-cycle and pass-and-play friendly.
- Active rounds should feel app-like: fullscreen-style challenge presentation, tap-anywhere progression, and minimal chrome are preferred.
- If players leave names empty during local testing, fall back to `Player 1`, `Player 2`, `Player 3`, ... instead of blocking the round.
- Reuse a shared `core/` helper for player-name normalization when the behavior matches other party games.
- Do not add account systems, moderation dashboards, or history storage unless technically required.

## Functional Reference
- Keep `docs/games/piccolo.md` up to date when the game flow, category list, or challenge taxonomy changes.
- Treat the documented challenge categories in that file as the planning surface for future implementation.




