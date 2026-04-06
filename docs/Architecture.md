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
- **Online required** for Chess (game state managed by backend via `python-chess`)

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
| `frontend/src/games/chess/` | Chess variant UI (board rendering) | React, CSS Grid, Unicode pieces |

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

┌──────────────────────┐       ┌──────────────────────┐
│  question_feedback   │       │  player_elo_history   │
├──────────────────────┤       ├──────────────────────┤
│ id (UUID PK)         │       │ id (UUID PK)         │
│ question_id          │       │ player_id            │
│ player_id (optional) │       │ question_id          │
│ session_id (optional)│       │ session_id (optional)│
│ feedback_type        │       │ elo_before           │
│ category (optional)  │       │ elo_after            │
│ comment (optional)   │       │ answered_correctly   │
│ created_at           │       │ created_at           │
└──────────────────────┘       └──────────────────────┘
```

### Imposter Game (SQLite / bundled JSON)

| Table | Fields |
|-------|--------|
| `words` | `id`, `text`, `category`, `is_active`, `is_flagged` |
| `word_reports` | `id`, `word_id`, `reason`, `created_at` |

Game sessions are in-memory only (no persistence).

### Chess Game (In-Memory)

Chess games are **in-memory only** — no database. Data resets on server restart.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique game identifier |
| `variant` | String | `STANDARD` (8×8), `MINI_6X8`, `MINI_7X8` |
| `player_white` | String | White player name (default: "Player 1") |
| `player_black` | String | Black player name (default: "Player 2") |
| `engine` | ChessEngine | `python-chess` Board wrapper |
| `status` | String | `ACTIVE`, `CHECK`, `CHECKMATE`, `STALEMATE`, `DRAW`, `RESIGNED` |
| `move_history` | List[str] | UCI move strings (e.g. `["e2e4", "e7e5"]`) |
| `captured_white` | List[str] | Pieces captured by white (Unicode symbols) |
| `captured_black` | List[str] | Pieces captured by black (Unicode symbols) |

**Engine abstraction:** `ChessEngine` (ABC) → `StandardEngine` (8×8 via `python-chess`). `VariantEngine` (6×8, 7×8) is stubbed with `NotImplementedError` — the extension point for future mini-board support.

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

### Question Ordering Strategy (Millionär Mode)

Millionär mode needs 15 questions sorted easy→hard, but must avoid long runs of the same category. The API uses **ELO-band category balancing**:

```
Input:  ELO-sorted questions (ascending)

Step 1: Split into bands of 5 questions each
        Band 1 (levels 1-5):   easy questions
        Band 2 (levels 6-10):  medium questions
        Band 3 (levels 11-15): hard questions

Step 2: Within each band, interleave by category
        (round-robin: pick one question per category, repeat)

Step 3: Concatenate bands → final question list
```

This is triggered via `GET /api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=15`. The `_balance_within_elo_bands(band_size=5)` service method implements this.

**Seeded tier ELO offsets** ensure a natural difficulty curve on fresh databases:
- Tier 1 (easy): ELO 1000
- Tier 2 (medium): ELO 1200
- Tier 3 (hard): ELO 1400

As the community plays, question ELOs self-calibrate through the ELO update formula.

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
| POST | `/challenges/feedback` | Submit feedback on a challenge (THUMBS_UP/THUMBS_DOWN/REPORT) |
| GET | `/challenges/feedback` | List feedback entries (optional: `?challenge_text=`) |

#### Quiz — `/api/v1/quiz/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/questions` | List questions (filter by category, tag, ELO; `balanced_categories`, `order_by_elo`) |
| POST | `/questions` | Submit a new question with answers |
| GET | `/questions/{id}` | Get question with randomized answer subset (`num_answers`) |
| PATCH | `/questions/{id}` | Partial update of question fields |
| DELETE | `/questions/{id}` | Soft-delete a question |
| POST | `/questions/import` | Bulk import questions (JSON seed format) |
| POST | `/questions/{id}/attempt` | Submit an answer, returns result + ELO update |
| POST | `/questions/{id}/fifty-fifty` | 50:50 joker — remove 2 wrong answers |
| POST | `/questions/{id}/audience-poll` | Audience poll joker — vote percentages |
| POST | `/questions/{id}/phone-joker` | Phone joker — Drachenlord hint |
| POST | `/questions/{id}/media` | Upload media file (image, video, document) |
| DELETE | `/questions/{id}/media` | Remove media from a question |
| GET | `/categories` | List categories with question counts |
| POST | `/categories` | Create a new category |
| GET | `/tags` | List tags with question counts |
| POST | `/players` | Create a player (guest) |
| GET | `/players/{id}` | Player profile + stats |
| GET | `/players/{id}/profile` | Extended profile with accuracy + recent sessions |
| GET | `/players/{id}/sessions` | List player's sessions (newest first) |
| GET | `/players/{id}/elo-history` | ELO progression history (oldest first, for charts) |
| POST | `/sessions` | Start a quiz session (mode: millionaire / duel / speed) |
| GET | `/sessions/{id}` | Get session state |
| POST | `/sessions/{id}/finish` | Finish session, persist score |
| GET | `/leaderboard` | Player leaderboard by ELO |
| GET | `/ordering-question` | Random ordering question (shuffled answers) |
| POST | `/ordering-question/{id}/check` | Validate ordering answer sequence |
| GET | `/admin/questions/pending` | List questions awaiting moderation (admin) |
| POST | `/admin/questions/{id}/moderate` | Approve or reject a pending question (admin) |
| GET | `/offline-bundle` | All approved questions with answers (including `is_correct`) for IndexedDB caching |
| GET | `/offline-config` | Cache-sync metadata (version, question count) |

#### Chess — `/api/v1/chess/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/status` | Module status (active, variant support info) |
| POST | `/games` | Create a new game (variant, player names) |
| GET | `/games` | List recent games (newest first) |
| GET | `/games/{id}` | Get game state (FEN, legal moves, status) |
| POST | `/games/{id}/move` | Submit a move in UCI notation (e.g. `e2e4`) |
| POST | `/games/{id}/resign` | Resign for a given color (WHITE/BLACK) |

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Authentication & Authorization

- **No authentication** for party games (Imposter, Piccolo)
- **Optional lightweight player identity** for Quiz — player creates a name, gets a UUID, used for ELO tracking
- No passwords, no OAuth — purely identification, not authentication
- If a central identity system is later introduced via meta-repo, the player model can be migrated

## PWA Configuration

PlayBox is delivered as a Progressive Web App via `vite-plugin-pwa` (Workbox under the hood).

| Aspect | Value | Notes |
|--------|-------|-------|
| Update strategy | `autoUpdate` | New SW activates immediately, no prompt |
| Manifest | Inline in `vite.config.ts` | Generated as `manifest.webmanifest` at build |
| Icons | SVG placeholders (`icon-512.svg`, `maskable-icon-512.svg`) | TODO: post-dev — generate PNG icons via `pwa-asset-generator` |
| Precaching | All Vite build assets (JS, CSS, HTML) | Automatic via Workbox |
| Navigation fallback | `/index.html` for all non-API routes | Enables SPA deep-link support offline |

### Runtime Caching Strategies

| URL Pattern | Strategy | Cache Name | TTL | Purpose |
|-------------|----------|------------|-----|---------|
| `/api/v1/*` | NetworkFirst | `api-cache` | 5 min, 50 entries | API responses — fresh when online, cached fallback offline |
| `/media/*` | CacheFirst | `media-cache` | 30 days, 100 entries | Sound files, images — rarely change |

**Offline capability per game:**
- **Imposter / Piccolo**: word lists and challenge pools are cached via the `api-cache` strategy after the first fetch. Client-side fallback with cached data in localStorage. Fully playable offline once cached. Both support content reporting (word reports / challenge feedback).
- **Quiz**: playable offline after initial cache sync — questions with answer truth are pre-cached in IndexedDB via `/api/v1/quiz/offline-bundle`. All three modes (Millionär, Speed, 1v1) use a shared `questionTruthCache` module for cache-first question loading and local answer evaluation. ELO tracking requires online. Question feedback (THUMBS_UP/THUMBS_DOWN/REPORT) available when online.
- **Chess**: online required — game state managed server-side by `python-chess`.

## Deployment & Infrastructure

- **Docker Compose** for local development (FastAPI + PostgreSQL + Vite dev server)
- **Single Docker image** for production (backend serves static frontend)
- **PWA** — installable from browser, offline caching via Service Worker
- Media files served from `/media/` via FastAPI `StaticFiles` mount (local filesystem)

## Open Questions

- CSS/UI framework: Tailwind CSS vs. MUI vs. custom?
- Chess: ~~build from scratch vs. fork/extend existing open-source project?~~ → **Resolved: `python-chess`** for 8×8 standard chess. Custom `VariantEngine` abstraction ready for 6×8/7×8 mini-boards when needed.
- ~~Quiz media storage: local filesystem vs. S3-compatible object storage?~~ → **Resolved: local filesystem** (`./media/quiz/{question_id}/`), served via `/media/` static mount. Migrate to S3 post-dev if needed.
- Piccolo: how large should the initial challenge database be?
- ~~Should there be a moderation queue for user-submitted quiz questions?~~ → **Resolved: yes** — `moderation_status` field (PENDING/APPROVED/REJECTED), admin endpoints implemented in Phase 4.

## Deviations from Meta-Repo Standards

| Standard | Deviation | Reason | Accepted | Temporary |
|----------|-----------|--------|----------|-----------|
| PostgreSQL as default DB | SQLite for offline-only games | Imposter & Piccolo need no server DB | yes | no |
| Central identity model | Optional lightweight player model | Full identity overkill for party games | yes | no |



