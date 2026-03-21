# Implementation Plan — PlayBox

## Current Status

**Phase:** Initial Planning
**Last Updated:** 2026-03-21

## Roadmap

| Phase | Description | Target Date | Status |
|-------|------------|-------------|--------|
| 0 | Project scaffolding, CI/CD, Docker setup | 2026-04 | planned |
| 1 | Imposter — MVP | 2026-05 | planned |
| 2 | Piccolo — MVP | 2026-06 | planned |
| 3 | Quiz ("Wer wird Elite-Hater?") — MVP | 2026-07 | planned |
| 4 | Quiz — ELO system + media attachments | 2026-08 | planned |
| 5 | Chess Variants — MVP (low priority) | TBD | planned |
| 6 | Polish, PWA optimization, offline hardening | TBD | planned |

---

## Phase 0 — Scaffolding

- [ ] Initialize Git repo, push to GitHub
- [ ] Set up FastAPI backend with app factory pattern
- [ ] Set up React/TypeScript frontend with Vite
- [ ] Docker Compose: backend + PostgreSQL + frontend dev server
- [ ] Production Dockerfile (backend serves built frontend)
- [ ] GitHub Actions: lint + test pipeline
- [ ] PWA basics: manifest.json, Service Worker shell
- [ ] Shared layout / navigation between games
- [ ] Health endpoint `GET /health`

## Phase 1 — Imposter MVP

### High Priority

- [ ] Word list data model (SQLite or bundled JSON)
- [ ] Seed initial word list (~200+ words, 5–10 categories)
- [ ] Backend: `GET /api/v1/imposter/words`
- [ ] Backend: `POST /api/v1/imposter/words/{id}/report`
- [ ] Backend: `POST /api/v1/imposter/session` (create game, assign imposter)
- [ ] Frontend: player name entry screen
- [ ] Frontend: pass-and-play word reveal screen (tap to reveal, tap to hide)
- [ ] Frontend: imposter assignment (random player sees "Imposter")
- [ ] Frontend: 5-minute discussion timer with alert
- [ ] Frontend: "report word" button
- [ ] Offline support: cache word list in Service Worker

### Medium Priority

- [ ] Category filter for word selection
- [ ] Configurable timer duration
- [ ] Sound/vibration on timer end
- [ ] Round history (how many rounds played)

## Phase 2 — Piccolo MVP

### High Priority

- [ ] Challenge data model and seed data
- [ ] Backend: `GET /api/v1/piccolo/challenges`
- [ ] Backend: `POST /api/v1/piccolo/session`
- [ ] Backend: `GET /api/v1/piccolo/session/{id}/next`
- [ ] Frontend: player name entry
- [ ] Frontend: challenge display with player name insertion
- [ ] Frontend: category selection
- [ ] Intensity level selector (mild / medium / spicy)
- [ ] Offline support

### Medium Priority

- [ ] Challenge types: dare, question, group, versus, vote
- [ ] Ensure no immediate repeat of challenges
- [ ] Animations / transitions between challenges

## Phase 3 — Quiz MVP ("Wer wird Elite-Hater?")

### High Priority

- [ ] PostgreSQL schema: questions, answers, categories, tags, players
- [ ] Alembic migration setup
- [ ] Backend: question CRUD (`GET/POST /api/v1/quiz/questions`)
- [ ] Backend: answer submission (`POST /api/v1/quiz/questions/{id}/attempt`)
- [ ] Backend: category and tag endpoints
- [ ] Backend: session management (start, state, finish)
- [ ] Frontend: "Wer wird Millionär" mode — escalating difficulty, single player
- [ ] Frontend: "Quizduell" mode — 1v1, category selection, alternating turns
- [ ] Frontend: question submission form (text, correct answer, wrong answers, category, tags)
- [ ] Seed initial Drachenlord question set (~50+ questions)
- [ ] Player creation (name + UUID, no auth)

### Medium Priority

- [ ] Leaderboard (`GET /api/v1/quiz/leaderboard`)
- [ ] Player profile page with stats
- [ ] Tag-based quiz creation (play questions filtered by tag)
- [ ] Lifelines in Millionär mode (50:50, audience, phone)
- [ ] Randomized wrong answer selection from pool

## Phase 4 — Quiz ELO + Media

### High Priority

- [ ] ELO calculation engine (K=32, base 1200)
- [ ] ELO update on each question attempt (player + question)
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

_Nothing yet — project in planning phase._

## Dependencies

- Meta-repo standards and templates (followed)
- PostgreSQL instance for Quiz game
- No external API dependencies

## Notes

- Imposter and Piccolo are the quickest wins — fully offline, minimal backend
- Quiz is the most complex game — plan for iterative development
- Chess is explicitly lowest priority — implement only after the other three are stable

