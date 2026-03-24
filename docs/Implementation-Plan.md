# Implementation Plan — PlayBox

## Current Status

**Phase:** Execution in Progress
**Last Updated:** 2026-03-24

## Roadmap

| Phase | Description | Target Date | Status |
|-------|------------|-------------|--------|
| 0 | Project scaffolding, CI/CD, Docker setup | 2026-04 | in progress |
| 1 | Imposter — MVP | 2026-05 | in progress |
| 2 | Piccolo — MVP | 2026-06 | in progress |
| 3 | Quiz ("Wer wird Elite-Hater?") — MVP | 2026-07 | in progress |
| 4 | Quiz — ELO system + media attachments | 2026-08 | in progress |
| 5 | Chess Variants — MVP (low priority) | TBD | planned |
| 6 | Polish, PWA optimization, offline hardening | TBD | planned |

---

## Phase 0 — Scaffolding

- Done: app factory, API mounting, `/health`, frontend Vite app, Docker and shared navigation are in place.
- Open: CI workflow and PWA shell are still missing.

- [ ] Initialize Git repo, push to GitHub
- [x] Set up FastAPI backend with app factory pattern
- [x] Set up React/TypeScript frontend with Vite
- [x] Docker Compose: backend + PostgreSQL + frontend dev server
- [x] Production Dockerfile (backend serves built frontend)
- [ ] GitHub Actions: lint + test pipeline
- [ ] PWA basics: manifest.json, Service Worker shell
- [x] Shared layout / navigation between games
- [x] Health endpoint `GET /health`

## Phase 1 — Imposter MVP

- Done: core backend flow is available (`words`, `report`, `session`, reveal endpoint), and the frontend now supports player setup, pass-and-play reveals, a discussion timer, and a post-round report flow.
- Open: expand seed data, add offline support, and complete medium-priority UX options.

### High Priority

- [x] Word list data model (SQLite or bundled JSON)
- [x] Seed initial word list (~200+ words, 5–10 categories)
- [x] Backend: `GET /api/v1/imposter/words`
- [x] Backend: `POST /api/v1/imposter/words/{id}/report`
- [x] Backend: `POST /api/v1/imposter/session` (create game, assign imposter)
- [x] Frontend: player name entry screen
- [x] Frontend: pass-and-play word reveal screen (tap to reveal, tap to hide)
- [x] Frontend: imposter assignment (random player sees "Imposter")
- [x] Frontend: 5-minute discussion timer with alert
- [x] Frontend: "report word" button
- [ ] Offline support: cache word list in Service Worker

### Medium Priority

- [ ] Category filter for word selection
- [ ] Configurable timer duration
- [ ] Sound/vibration on timer end
- [ ] Round history (how many rounds played)

## Phase 2 — Piccolo MVP

- Done: in-memory challenge pool, session-based gameplay, backend challenge endpoints, tests, a minimal frontend setup/next-challenge flow, and category-balanced session ordering are implemented.
- Open: add offline support, richer challenge pools, and medium-priority UX polish.

### High Priority

- [x] Challenge data model and seed data
- [x] Backend: `GET /api/v1/piccolo/challenges`
- [x] Backend: `POST /api/v1/piccolo/session`
- [x] Backend: `GET /api/v1/piccolo/session/{id}/next`
- [x] Frontend: player name entry
- [x] Frontend: challenge display with player name insertion
- [x] Frontend: category selection
- [x] Intensity level selector (mild / medium / spicy)
- [ ] Offline support

### Medium Priority

- [x] Challenge types: dare, question, group, versus, vote
- [x] Ensure no immediate repeat of challenges
- [ ] Animations / transitions between challenges

## Phase 3 — Quiz MVP ("Wer wird Elite-Hater?")

- Done: PostgreSQL models, Alembic scaffolding, the session finish flow, and most core backend endpoints are present.
- Open: complete the remaining frontend game modes and full endpoint test coverage.

### High Priority

- [x] PostgreSQL schema: questions, answers, categories, tags, players
- [x] Alembic migration setup
- [ ] Backend: question CRUD (`GET/POST /api/v1/quiz/questions`)
- [x] Backend: answer submission (`POST /api/v1/quiz/questions/{id}/attempt`)
- [x] Backend: category and tag endpoints
- [x] Backend: session management (start, state, finish)
- [ ] Frontend: "Wer wird Millionär" mode — escalating difficulty, single player
- [ ] Frontend: "Quizduell" mode — 1v1, category selection, alternating turns
- [ ] Frontend: question submission form (text, correct answer, wrong answers, category, tags)
- [ ] Seed initial Drachenlord question set (~50+ questions)
- [ ] Player creation (name + UUID, no auth)

### Medium Priority

- [x] Leaderboard (`GET /api/v1/quiz/leaderboard`)
- [x] Balanced general question listing across categories
- [ ] Player profile page with stats
- [ ] Tag-based quiz creation (play questions filtered by tag)
- [ ] Lifelines in Millionär mode (50:50, audience, phone)
- [x] Randomized wrong answer selection from pool

## Phase 4 — Quiz ELO + Media

- Done: ELO engine and per-attempt ELO update for player and question are implemented.
- Open: media upload/display endpoints and stricter media type handling.

### High Priority

- [x] ELO calculation engine (K=32, base 1200)
- [x] ELO update on each question attempt (player + question)
- [ ] Question ordering by ELO in Millionär mode
- [ ] Media upload endpoint (clips, images, documents)
- [ ] Media display in question UI (video player, image viewer)
- [ ] Media type support: `image`, `video`, `document`

### Medium Priority

- [ ] ELO history / progression chart per player
- [ ] Question difficulty badge (based on ELO range)
- [ ] Moderation queue for user-submitted questions
- [ ] Bulk question import (CSV/JSON)

## Phase 5 — Chess Variants (Low Priority)

- [ ] Evaluate `python-chess` / `chess.js` for engine
- [ ] Board rendering (6×8 and 7×8 variants)
- [ ] Move validation for modified board sizes
- [ ] Basic game flow: create, move, checkmate detection
- [ ] Frontend: interactive chessboard component

---

## Next Sprint (1-2 weeks)

### High Priority

- [x] Add Piccolo endpoint `GET /api/v1/piccolo/challenges` (filterable by category/intensity)
- [x] Add backend tests for Piccolo API in `backend/tests/test_piccolo.py`
- [x] Add backend tests for Quiz API in `backend/tests/test_quiz.py`
- [ ] Complete Quiz session flow with explicit finish endpoint/state update
- [x] Expand Imposter seed list to target at least 5-10 categories and 200+ words

### Medium Priority

- [x] Implement minimal Imposter frontend flow (name entry + reveal + timer)
- [x] Implement minimal Piccolo frontend flow (name entry + category/intensity + next challenge)
- [ ] Add Quiz seed script for initial question set (minimal, file-based)
- [ ] Add/update API error payloads to consistently include `{ detail, code }`

## Backlog (Unscheduled)

- [ ] Multiplayer over WebSocket (Quiz Duel real-time)
- [ ] Question rating / voting by users
- [ ] Achievement system
- [ ] Dark mode / theme toggle
- [ ] Localization (DE / EN)
- [ ] Analytics dashboard (most played games, popular categories)
- [ ] Admin panel for word/question/challenge moderation

## Blockers

| Blocker | Impact | Owner | Status |
|---------|--------|-------|--------|
| CSS/UI framework decision | Affects all frontend work | — | open |
| Quiz media storage decision | Affects Phase 4 | — | open |

## Completed

- FastAPI app factory and router mounting structure
- `/health` endpoint
- Docker + frontend Vite scaffold
- Imposter backend core endpoints
- Imposter seed word list (220 words, 10 categories)
- Piccolo backend session flow endpoints
- Piccolo `GET /challenges` endpoint (filterable by category/intensity)
- Quiz core backend endpoints with ELO integration
- Shared test fixtures in `conftest.py`
- Backend tests: `test_imposter.py` (7), `test_piccolo.py` (18), `test_quiz.py` (20), `test_elo.py` (8)
- Shared PyCharm run configurations (`.run/`)

## Dependencies

- Meta-repo standards and templates (followed)
- PostgreSQL instance for Quiz game
- No external API dependencies

## Notes

- Imposter and Piccolo are the quickest wins — fully offline, minimal backend
- Quiz is the most complex game — plan for iterative development
- Chess is explicitly lowest priority — implement only after the other three are stable




