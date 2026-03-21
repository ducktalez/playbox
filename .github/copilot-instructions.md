# PlayBox – Copilot Instructions

## What is this?
PlayBox is a multi-game PWA — party games (Imposter, Piccolo) and a quiz game ("Wer wird Elite-Hater?") share one FastAPI backend and one React/TypeScript frontend. Each game is an isolated module; games never import from each other, only from `core/`. See `.github/instructions/backend.instructions.md` and `frontend.instructions.md` for layer-specific rules.

## Development Phase Policy
The project is in early development. Only implement what is **technically necessary right now**.
- **Security, auth, caching, monitoring, styling polish**: deferred. Mark placeholders with `# TODO: post-dev`.
- **No speculative features or database columns.** If it's not needed for the current task, don't build it.
- Priority order: **Imposter → Piccolo → Quiz → Chess (lowest).**
- Within each game: **Backend API → Tests → Seed data → Frontend (minimal).**

## Coding Conventions
- All code, comments, docstrings, and documentation in **English**.
- Every new endpoint **must** have tests in `backend/tests/` (`test_{game}.py`).
- Shared test fixtures live in `conftest.py`.
- New models → `models.py`, schemas → `schemas.py`, routes → `games/{game}/router.py` (register in `main.py`).
- Each game backend exposes a FastAPI `APIRouter` mounted at `/api/v1/{game}/`.
- Keep it simple — working and lean over complex and perfect.

## API Conventions
- All endpoints prefixed with `/api/v1/`.
- Health check: `GET /health`.
- Error format: `{ "detail": "...", "code": "MACHINE_READABLE_CODE" }`.
- Enum values are **uppercase strings** in JSON.

## Known Pitfalls
- **Tests must run from `backend/`**: `cd backend && python -m pytest tests/ -v`.
- **Quiz uses PostgreSQL**, Imposter/Piccolo use **in-memory or SQLite**. Don't mix the engines per game.
- Imposter/Piccolo sessions are **in-memory only** — no DB persistence, data resets on restart.
- Quiz ELO: both questions and players have ELO scores. Always update **both** after an attempt.
- Quiz answers: exactly 1 correct, N wrong (N ≥ 1). The pool can be arbitrarily large; the API selects a random subset per request.
- Media (clips, images, docs) are stored as **files**, referenced by URL — never binary in the DB.
- After `db.commit()` + `db.close()`, do **not** access ORM attributes on detached objects → `DetachedInstanceError`.

## Maintaining These Instructions
When a change introduces new conventions, pitfalls, or architectural decisions, **update the relevant instruction file** (this file, or `.github/instructions/*.instructions.md`). Keep them accurate and lean.

## Working Process: Maintaining Docs
- Update architectural changes in `Architecture.md`.
- Track deferred work in `Implementation-Plan.md`.
- New games get their own module in `backend/app/games/` and `frontend/src/games/` — never add game logic to `core/`.

