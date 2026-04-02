---
applyTo: "backend/**"
---
# Backend Instructions

## Architecture
- Single FastAPI app in `app/main.py` mounts each game as a sub-router.
- Game modules: `app/games/{imposter,piccolo,quiz,chess}/`. Each exposes a `router` (`APIRouter`).
- Shared code (config, DB, middleware): `app/core/`.
- Games must **never** import from each other.

## Database
- **Quiz**: PostgreSQL, SQLAlchemy/SQLModel, Alembic migrations. UUID PKs, `snake_case`, audit fields (`created_at`, `updated_at`), soft delete (`deleted_at`).
- **Imposter/Piccolo**: prefer in-memory storage during development; use SQLite only when a lightweight local store is technically needed. No PostgreSQL dependency.
- See `database.instructions.md` for full ORM conventions, query style, transaction patterns, and test DB strategy.

## Local configuration
- The shared development environment file is the repo-root `.env`.
- Do not introduce separate backend-only `.env` conventions unless technically required.

## Deferred until go-live
- **Security & auth**: no tokens, sessions, hashing, or input sanitization. Quiz players are identified by name + UUID, no passwords.
- **Caching**: no Redis or in-memory caching layers.
- **Logging pipeline**: no structured logging beyond basic stdout.
- **Rate limiting**: not implemented.

## Content Reporting
- New games should follow the same feedback/report schema convention used by Quiz and Imposter: `feedback_type` enum + optional `category` set (comma-separated) + optional free-text `comment`.
- Keep validation consistent: validate each element in a comma-separated category string against the allowed set for that feedback type.

