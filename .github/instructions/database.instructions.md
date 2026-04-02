---
applyTo: "backend/**"
---
# Database & ORM Instructions

These rules apply to all backend code that interacts with a database or ORM layer.

## Engines & Sessions

- **Dual-engine setup** in `app/core/database.py`:
  - `pg_engine` / `PgSessionLocal` — PostgreSQL (or SQLite fallback) for **Quiz**.
  - `sqlite_engine` / `SqliteSessionLocal` — SQLite for **Imposter / Piccolo** local data.
- Both sessionmakers use `expire_on_commit=False` so attributes remain accessible after commit without an extra refresh.
- Sessions are exposed as FastAPI dependencies via generator functions (`get_pg_session`, `get_sqlite_session`). Always use `Depends(get_pg_session)` (or the SQLite variant) — never instantiate sessions manually in route handlers.
- **Imposter & Piccolo prefer pure in-memory storage** during development. Only use SQLite when lightweight persistence is technically needed.

## Model Conventions (SQLModel)

- All persistent models inherit from `SQLModel` with `table=True`.
- **Primary keys**: `uuid.UUID`, generated via `default_factory=uuid.uuid4`.
- **Table names**: explicit `__tablename__` in `snake_case` (plural, e.g. `"questions"`, `"game_sessions"`).
- **Audit timestamps**: `created_at` (`datetime`, default `utcnow`), `updated_at` (`datetime | None`, set manually on mutations).
- **Soft delete**: `deleted_at: datetime | None`. Queries must filter with `.where(Model.deleted_at.is_(None))` — never use hard deletes on quiz content.
- **Relationships**: use `Relationship(back_populates=...)` for bidirectional links. Junction tables (e.g. `QuestionTag`) are plain `SQLModel` tables with composite PKs.
- **JSON-in-column**: for ordered lists that don't need relational queries (e.g. `OrderingQuestion.ordered_answers_json`), store as `Text` column with a `@property` pair for serialize/deserialize. Avoid this pattern for data that needs filtering or joining.

## Query Style (SQLAlchemy 2.0)

- Use the **2.0-style `select()` API** — no legacy `session.query()`.
- Single-row PK lookup: `db.get(Model, pk)`.
- Filtered queries: `db.execute(select(Model).where(...)).scalars().all()`.
- Scalar aggregates: `db.scalar(select(func.count()).where(...))`.
- Existence / unique lookup: `db.execute(select(Model).where(...)).scalar_one_or_none()`.
- Always add `.where(Model.deleted_at.is_(None))` to question queries (soft-delete guard).

## Transaction Patterns

- **`flush()`** to obtain auto-generated IDs (e.g. after creating a `Category`, before using `category.id` as FK). Do not `commit()` mid-operation.
- **`commit()`** once at the end of a service method — one logical transaction per API call.
- **`refresh(obj)`** after commit when the returned schema needs server-generated fields (e.g. `created_at`).
- After `commit()` + `close()`, do **not** access ORM relationship attributes — this causes `DetachedInstanceError`. Either:
  - Read all needed data before closing, or
  - Use `expire_on_commit=False` (already the project default).

## Test Database Strategy

- Tests replace the real DB engine with **in-memory SQLite** via FastAPI `dependency_overrides`.
- `conftest.py` provides:
  - `db_engine` — fresh in-memory SQLite, tables created via `SQLModel.metadata.create_all`.
  - `db_session` — transactional session that **rolls back** after each test (full isolation).
  - `quiz_client` — `TestClient` with `get_pg_session` overridden to the in-memory session.
  - `seeded_quiz_client` — same, but pre-seeded with 20 mock questions across 4 categories.
- New test fixtures that need a DB session must follow this pattern. Never connect to a real PostgreSQL instance in tests.
- SQLite quirk: always pass `connect_args={"check_same_thread": False}` when creating an SQLite engine.

## Migration Rules (Alembic)

- Quiz schema changes require an **Alembic migration** (`backend/alembic/`).
- During early development, `SQLModel.metadata.create_all` is acceptable for local bootstrapping, but the Alembic history must stay in sync for production.
- Do not add speculative columns — only migrate what is needed for the current task.

## Cross-Game Isolation

- Each game owns its own models in `app/games/{game}/models.py`. Games must **never** import models from another game.
- Shared DB utilities (engine creation, session factories) live in `app/core/database.py`.
- If a new game needs a DB, decide engine (pg vs. sqlite vs. in-memory) based on the game's persistence requirements and document the choice in `backend.instructions.md`.

