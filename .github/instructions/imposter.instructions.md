---
applyTo: "**/games/imposter/**"
---
# Imposter Instructions

These instructions apply to both backend and frontend files for the Imposter game.

## Scope
- Keep Imposter fully isolated inside its own game module.
- Prefer simple local state and in-memory session logic.
- Do not introduce PostgreSQL or cross-game dependencies.

## Backend Rules
- Sessions stay in-memory only; restarting the backend resets active rounds.
- Word metadata may come from bundled data or lightweight local/in-memory structures.
- Keep the API lean and directly aligned with the pass-and-play frontend flow.

## Frontend Rules
- Prioritize the local round flow: player setup, reveal, discussion, and round result.
- Keep the UX usable on one shared device.
- Favor app-like, tap-friendly round screens with minimal distractions during reveal and discussion phases.
- If players leave names empty during local testing, fall back to `Player 1`, `Player 2`, `Player 3`, ... instead of blocking the round.
- Reuse a shared `core/` helper for player-name normalization when the behavior matches other party games.
- Avoid complex persistence or multi-device synchronization during development.

## Current Focus
- Category filtering, timer options, and lightweight report handling are valid MVP work.
- Offline support can be added, but only when it directly supports the current frontend flow.



