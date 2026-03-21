# Copilot Instructions — PlayBox

> Keep this file **short and focused**. Only project-specific rules here.
> General standards are defined in the [meta-repo](https://github.com/ducktalez/meta-repo).

## Project Context

PlayBox is a multi-game PWA containing party and quiz games. It uses a single FastAPI backend that mounts each game as a sub-router and a React/TypeScript frontend with per-game modules sharing a common PWA shell.

## Standards Reference

This project follows the standards defined in the **meta-repo**:

- [Technology Targets](https://github.com/ducktalez/meta-repo/blob/main/standards/technology-targets.md)
- [Database Conventions](https://github.com/ducktalez/meta-repo/blob/main/standards/database-conventions.md)
- [Core Entities](https://github.com/ducktalez/meta-repo/blob/main/data-models/core-entities.md)

## Project-Specific Rules

### Architecture

- Each game lives in its own module: `backend/app/games/{game}/` and `frontend/src/games/{game}/`
- Games must not import from each other — only from `core/`
- Shared utilities (DB setup, config, PWA shell) live in `core/`
- Each game backend exposes a FastAPI `APIRouter` that is mounted in `main.py`

### API

- All game routes are prefixed: `/api/v1/{game}/`
- Health endpoint: `GET /health`
- Error format: `{ "detail": "...", "code": "MACHINE_READABLE_CODE" }`

### Database

- **Quiz game:** PostgreSQL with SQLAlchemy/SQLModel, migrations via Alembic
- **Imposter/Piccolo:** SQLite or in-memory only (offline-first, no server DB needed)
- Follow meta-repo database conventions: `snake_case`, UUID PKs, audit fields (`created_at`, `updated_at`)
- Soft delete for quiz questions (`deleted_at`)

### Frontend

- React with TypeScript, Vite as bundler
- Each game has its own route: `/imposter`, `/piccolo`, `/quiz`, `/chess`
- Shared PWA shell handles: Service Worker, manifest, offline cache, layout
- Linting: `eslint` + `prettier`

### Quiz-Specific Rules

- Questions have exactly 1 correct answer and N wrong answers (N ≥ 1, pool can be arbitrarily large)
- ELO system: questions and players both have ELO scores, adjusted after each answer
- Media (clips, images, documents) stored as files, referenced by URL — never in the DB
- User-submitted questions must include at least 1 correct and 3 wrong answers
- Tags are free-form strings, categories are predefined

### Imposter-Specific Rules

- Word list is bundled with the app (JSON or SQLite)
- Flagged/reported words are stored locally and can be synced if a backend is available
- Game sessions are in-memory only — no persistence needed

### Code Style

- Python: `ruff` for linting and formatting
- TypeScript: `eslint` + `prettier`
- Python type hints required on all function signatures
- Pydantic models for all API request/response schemas

## Key Files

- `Architecture.md` — system architecture and data models
- `Implementation-Plan.md` — current tasks and roadmap
- `backend/app/main.py` — FastAPI entry point, mounts all game routers
- `backend/app/core/config.py` — application configuration
- `backend/app/core/database.py` — DB engine and session setup
- `frontend/src/main.tsx` — React entry point
- `frontend/src/core/` — shared PWA shell, layout, routing

## Deviations from Meta-Repo Standards

| Standard | Deviation | Reason |
|----------|-----------|--------|
| PostgreSQL as default DB | SQLite for Imposter & Piccolo | Offline-first party games need no server DB |
| Central identity model | Lightweight optional player model | Full identity is overkill for party games |

