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
- **Imposter/Piccolo**: in-memory or bundled data only. No PostgreSQL dependency.

## Deferred until go-live
- **Security & auth**: no tokens, sessions, hashing, or input sanitization. Quiz players are identified by name + UUID, no passwords.
- **Caching**: no Redis or in-memory caching layers.
- **Logging pipeline**: no structured logging beyond basic stdout.
- **Rate limiting**: not implemented.

