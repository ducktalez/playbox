# Architecture — PlayBox

## Overview

PlayBox is a multi-game platform serving browser-based party and quiz games as a single PWA. One FastAPI backend mounts each game as an isolated sub-router. One React/TypeScript frontend provides a shared PWA shell with per-game UI modules. Games can be developed, tested, and deployed independently within the monolith.

## System Context

```
┌─────────────┐        ┌──────────────────────────────────────────┐
│   Browser   │◄──────►│              PlayBox PWA                 │
│   (PWA)     │        │                                          │
│             │        │  ┌──────────┬──────────┬───────┬───────┐ │
│             │        │  │ Imposter │ Piccolo  │ Quiz  │ Chess │ │
│             │        │  └──────────┴──────────┴───┬───┴───────┘ │
│             │        │                            │              │
│             │        │  ┌─────────────────────────▼────────────┐ │
│             │        │  │        FastAPI Backend               │ │
│             │        │  │  /api/v1/imposter  /api/v1/piccolo   │ │
│             │        │  │  /api/v1/quiz      /api/v1/chess     │ │
│             │        │  └─────────────┬───────────────────────┘ │
│             │        │                │                          │
│             │        │  ┌─────────────▼───────────────────────┐ │
│             │        │  │  PostgreSQL (Quiz)  │  SQLite (local)│ │
│             │        │  └─────────────────────────────────────┘ │
└─────────────┘        └──────────────────────────────────────────┘
```

- **No external API dependencies** — all game logic is self-contained
- **Offline-first** for Imposter & Piccolo (Service Worker caches everything)
- **Online required** for Quiz (question DB, ELO updates, media)
- Chess: TBD (may use external engine library)

## Components

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| `backend/app/core/` | App factory, config, DB setup, shared middleware | FastAPI, SQLAlchemy |
| `backend/app/games/imposter/` | Imposter game logic & API | FastAPI router |
| `backend/app/games/piccolo/` | Piccolo game logic & API | FastAPI router |
| `backend/app/games/quiz/` | Quiz game logic, ELO engine, question CRUD | FastAPI router, SQLAlchemy |
| `backend/app/games/chess/` | Chess variant logic & API | FastAPI router, python-chess |
| `frontend/src/core/` | PWA shell, Service Worker, layout, routing | React, TypeScript, Vite |
| `frontend/src/games/imposter/` | Imposter UI (pass-and-play, timer) | React |
| `frontend/src/games/piccolo/` | Piccolo UI (challenge display) | React |
| `frontend/src/games/quiz/` | Quiz UI (both game modes, question submission) | React |
| `frontend/src/games/chess/` | Chess variant UI (board rendering) | React, chessboard lib |

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React (TypeScript), Vite | PWA with Service Worker |
| Backend | FastAPI (Python 3.11+) | Single instance, multi-game routers |
| Database | PostgreSQL 15+ | Quiz questions, ELO scores, players |
| Database | SQLite | Imposter word list, local data |
| ORM | SQLAlchemy / SQLModel | Models + Alembic migrations |
| Auth | None / lightweight player model | No central identity needed |
| Deployment | Docker, Docker Compose | Single container or split |
| CI/CD | GitHub Actions | Lint, test, build |

## Key Architecture Decisions

1. **Multi-game monolith over separate repos** — games share PWA infrastructure, deployment, and tooling. Separate repos would create unnecessary overhead for small games.
   - _Related: [ADR-002 React + FastAPI as default stack](https://github.com/ducktalez/meta-repo/blob/main/architecture/decisions/002-react-fastapi-as-default-stack.md)_

2. **Game isolation via sub-routers** — each game is a self-contained Python package exposing a `router`. No cross-game imports allowed. Shared code lives in `core/`.

3. **Dual database strategy** — PostgreSQL for persistent, server-side data (quiz). SQLite/in-memory for offline-first party games (imposter, piccolo). Avoids forcing a DB server for purely local games.

4. **ELO system for quiz questions** — questions and players both carry an ELO rating. Difficulty adapts organically as the community plays, similar to chess tactic puzzle ratings.

5. **PWA-first** — installable on home screen, offline support via Service Worker. Critical for party games used at gatherings without reliable internet.

## Data Model

### Quiz Game (PostgreSQL)

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  categories  │       │  questions   │       │   answers    │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (UUID PK) │◄──┐   │ id (UUID PK) │◄──┐   │ id (UUID PK) │
│ name         │   └───│ category_id  │   └───│ question_id  │
│ description  │       │ text         │       │ text         │
│ created_at   │       │ elo_score    │       │ is_correct   │
│ updated_at   │       │ media_url    │       │ created_at   │
└──────────────┘       │ media_type   │       └──────────────┘
                       │ created_by   │
                       │ created_at   │       ┌──────────────┐
                       │ updated_at   │       │    tags      │
                       │ deleted_at   │       ├──────────────┤
                       └──────┬───────┘       │ id (UUID PK) │
                              │               │ name         │
                       ┌──────▼───────┐       │ created_at   │
                       │ question_tags│       └──────┬───────┘
                       ├──────────────┤              │
                       │ question_id  │◄─────────────┘
                       │ tag_id       │
                       └──────────────┘

┌──────────────┐       ┌──────────────────┐       ┌────────────────────┐
│   players    │       │  game_sessions   │       │ question_attempts  │
├──────────────┤       ├──────────────────┤       ├────────────────────┤
│ id (UUID PK) │◄──┐   │ id (UUID PK)     │◄──┐   │ id (UUID PK)       │
│ name         │   │   │ mode             │   │   │ session_id         │
│ elo_score    │   └───│ player_ids       │   └───│ question_id        │
│ games_played │       │ score            │       │ player_id          │
│ correct_count│       │ started_at       │       │ answered_correctly │
│ created_at   │       │ finished_at      │       │ time_taken_ms      │
│ updated_at   │       └──────────────────┘       │ created_at         │
└──────────────┘                                   └────────────────────┘
```

### Imposter Game (SQLite / bundled JSON)

| Table | Fields |
|-------|--------|
| `words` | `id`, `text`, `category`, `is_active`, `is_flagged` |
| `word_reports` | `id`, `word_id`, `reason`, `created_at` |

Game sessions are in-memory only (no persistence).

### ELO Calculation

```
K = 32  (standard K-factor)

expected_score = 1 / (1 + 10^((question_elo - player_elo) / 400))

If player answers correctly:
  player_elo   += K * (1 - expected_score)
  question_elo -= K * (1 - expected_score)

If player answers wrong:
  player_elo   -= K * expected_score
  question_elo += K * expected_score
```

Base ELO for new questions: **1200**
Base ELO for new players: **1200**

## API Design

- **Style:** RESTful
- **Versioning:** URL prefix `/api/v1/`
- **Format:** JSON request/response bodies
- **Error format:**
  ```json
  { "detail": "Human-readable message", "code": "MACHINE_READABLE_CODE" }
  ```

### Endpoint Overview

#### Imposter — `/api/v1/imposter/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/words` | Get word list (optional: `?category=`) |
| POST | `/words/{id}/report` | Report a word as inappropriate |
| POST | `/session` | Start a new game session |

#### Piccolo — `/api/v1/piccolo/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/challenges` | Get challenges (optional: `?intensity=&category=`) |
| POST | `/session` | Start a new game session with player names |
| GET | `/session/{id}/next` | Get next challenge for session |

#### Quiz — `/api/v1/quiz/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/questions` | List questions (filter by category, tag, ELO range) |
| POST | `/questions` | Submit a new question with answers |
| GET | `/questions/{id}` | Get question with randomized answer subset |
| POST | `/questions/{id}/attempt` | Submit an answer, returns result + ELO update |
| GET | `/categories` | List categories |
| GET | `/tags` | List tags |
| POST | `/sessions` | Start a quiz session (mode: millionaire / duel) |
| GET | `/sessions/{id}` | Get session state |
| GET | `/leaderboard` | Player leaderboard by ELO |
| GET | `/players/{id}` | Player profile + stats |

#### Chess — `/api/v1/chess/` _(low priority)_

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/games` | Create a new game (variant, players) |
| GET | `/games/{id}` | Get game state |
| POST | `/games/{id}/move` | Submit a move |

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Authentication & Authorization

- **No authentication** for party games (Imposter, Piccolo)
- **Optional lightweight player identity** for Quiz — player creates a name, gets a UUID, used for ELO tracking
- No passwords, no OAuth — purely identification, not authentication
- If a central identity system is later introduced via meta-repo, the player model can be migrated

## Development Setup & Utilities

### Quick Start

The project provides **three setup methods**:

1. **PyCharm (Recommended)**
   - Run `make gen-pycharm` to auto-generate run configurations
   - Select "PlayBox Fullstack (compound)" and press F5

2. **Terminal with Makefile**
   - Run `make install` for one-time setup
   - Run `make serve-all` to start both servers simultaneously
   - Or run `make dev-backend` and `make dev-frontend` in separate terminals

3. **Docker Compose**
   - Run `docker compose up --build`

### Setup Utilities (`setup.py`)

The project includes `setup.py` with three utilities:

```bash
python setup.py config           # Show current configuration
python setup.py generate-pycharm # Generate/update PyCharm run configs
python setup.py serve-all        # Start backend + frontend (separate processes)
```

Or use the Makefile aliases:
```bash
make config
make gen-pycharm
make serve-all
```

**Why `setup.py` instead of just Makefile?**
- PyCharm integration: auto-generates `.run/*.xml` configurations dynamically
- Cross-platform: handles Windows paths without extra logic
- Unified CLI: config inspection, server launching, IDE setup in one place
- Mirrors the pattern from other projects (e.g., hometools)

### Run Configurations

PyCharm configurations are stored in `.run/`:
- **PlayBox Fullstack (compound)** — Launches both backend & frontend with separate Stop buttons
- **PlayBox Backend (uvicorn)** — Backend only
- **PlayBox Frontend (vite)** — Frontend only
- **PlayBox Backend Tests (pytest)** — Run backend tests

These are generated by `python setup.py generate-pycharm` and stored in version control.

## Deployment & Infrastructure

- **Docker Compose** for local development (FastAPI + PostgreSQL + Vite dev server)
- **Single Docker image** for production (backend serves static frontend)
- **PWA** — installable from browser, offline caching via Service Worker
- Media files served from `/public/media/` or a future file storage solution

## Open Questions

- CSS/UI framework: Tailwind CSS vs. MUI vs. custom?
- Chess: build from scratch vs. fork/extend existing open-source project?
- Quiz media storage: local filesystem vs. S3-compatible object storage?
- Piccolo: how large should the initial challenge database be?
- Should there be a moderation queue for user-submitted quiz questions?

## Deviations from Meta-Repo Standards

| Standard | Deviation | Reason | Accepted | Temporary |
|----------|-----------|--------|----------|-----------|
| PostgreSQL as default DB | SQLite for offline-only games | Imposter & Piccolo need no server DB | yes | no |
| Central identity model | Optional lightweight player model | Full identity overkill for party games | yes | no |

