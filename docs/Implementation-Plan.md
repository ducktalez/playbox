# Implementation Plan — PlayBox

## Current Status

**Phase:** Execution in Progress
**Last Updated:** 2026-04-02

## Roadmap

| Phase | Description | Target Date | Status |
|-------|------------|-------------|--------|
| 0 | Project scaffolding, CI/CD, Docker setup | 2026-04 | in progress |
| 1 | Imposter — MVP | 2026-05 | in progress |
| 2 | Piccolo — MVP | 2026-06 | in progress |
| 3 | Quiz ("Wer wird Elite-Hater?") — MVP | 2026-07 | in progress |
| 4 | Quiz — ELO system + media attachments | 2026-08 | in progress |
| 5 | Chess Variants — MVP (low priority) | 2026-04 | in progress |
| 6 | Polish, PWA optimization, offline hardening | TBD | planned |

---

## Phase 0 — Scaffolding

- Done: app factory, API mounting, `/health`, frontend Vite app, Docker, shared navigation, repo-root `.env` bootstrap, PyCharm run configurations, and **PWA shell** (manifest, Service Worker with Workbox runtime caching, SVG placeholder icons) are in place.
- Open: CI workflow, proper PNG icons for production.

- [ ] Initialize Git repo, push to GitHub
- [x] Set up FastAPI backend with app factory pattern
- [x] Set up React/TypeScript frontend with Vite
- [x] Docker Compose: backend + PostgreSQL + frontend dev server
- [x] Production Dockerfile (backend serves built frontend)
- [ ] GitHub Actions: lint + test pipeline
- [x] PWA basics: manifest.json, Service Worker shell, Workbox runtime caching
- [x] Shared layout / navigation between games
- [x] Health endpoint `GET /health`

## Phase 1 — Imposter MVP

- Done: core backend flow is available (`words`, `report`, `session`, reveal endpoint), and the frontend now supports player setup, pass-and-play reveals, a discussion timer, a post-round report flow, category filters, configurable timer, sound/vibration alerts, round history, and **offline support** (client-side fallback with cached word list).
- All Phase 1 items complete.

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
- [x] Offline support: pre-cache word list via Service Worker (PWA shell ready)

### Medium Priority

- [x] Category filter for word selection
- [x] Configurable timer duration
- [x] Sound/vibration on timer end
- [x] Round history (how many rounds played)

## Phase 2 — Piccolo MVP

- Done: in-memory challenge pool, session-based gameplay, backend challenge endpoints, tests, a minimal frontend setup/next-challenge flow, category-balanced session ordering, slide-in transitions between challenges, and **offline support** (client-side fallback with cached challenge templates) are implemented.
- All Phase 2 High Priority items complete.

### High Priority

- [x] Challenge data model and seed data
- [x] Backend: `GET /api/v1/piccolo/challenges`
- [x] Backend: `POST /api/v1/piccolo/session`
- [x] Backend: `GET /api/v1/piccolo/session/{id}/next`
- [x] Frontend: player name entry
- [x] Frontend: challenge display with player name insertion
- [x] Frontend: category selection
- [x] Intensity level selector (mild / medium / spicy)
- [x] Offline support (PWA shell ready)

### Medium Priority

- [x] Challenge types: dare, question, group, versus, vote
- [x] Ensure no immediate repeat of challenges
- [x] Animations / transitions between challenges

## Phase 3 — Quiz MVP ("Wer wird Elite-Hater?")

**STORY — Three Game Modes, One Shared Core:**

### "Wer wird Elite-Haider" (Millionär Mode)
- Solo player selects this mode from the game selection screen
- Auto-generated "Gast" player (no names required)
- 15 questions with escalating difficulty (ELO-based)
- Each question shows 4 possible answers in 2×2 grid (WWM diamond-shaped)
- Prize ladder (€50 → €1 Million) displayed on left side
- Safety marks at level 5 (€500) and level 10 (€16,000)
- Three jokers: 50:50, Audience Poll, Phone (Drachenlord)
- WWM-style dark blue gradient UI with animations
- Sound effects served from `/media/sounds/wwm/` at key moments
- Game ends when: player gets wrong OR all 15 answered
- Wrong answer → falls back to last safety mark prize
- Results screen: final prize, ELO, option to play again

### "Quizduell" (1v1 — Local MVP ✓)
- Two players on one device, pass-and-play
- Name entry (falls back to "Spieler 1" / "Spieler 2")
- 10 questions (alternating: odd → P1, even → P2)
- Handover screen between turns ("Gib das Gerät an ...")
- Live score display during gameplay
- Same Q&A flow as other modes
- Tracks: correct count per player
- Winner: most correct answers (or draw)
- Results: show winner, both ELOs, replay option
- Future: real 1v1 duel via WebSocket

### "Quizduell Speed" (Solo Speed Mode) ✨ NEW
- Solo player races against 20-second countdown timer
- Each question: 20-second limit to answer
- Display: question + 4 answers + **COUNTDOWN TIMER** (red if ≤5s)
- User selects answer within time → submit immediately
- If timeout → auto-submit as wrong (counts as incorrect attempt)
- Show feedback: "Richtig!" / "Falsch!" + ELO change (1-2 seconds)
- **Auto-advance** to next question after feedback (no manual "Next" button)
- Play 10 rapid-fire questions (2-3 minutes total game time)
- Game ends: all 10 answered (correct or timeout)
- Results: final ELO vs. starting ELO, points scored, replay option

### Shared Implementation Core
```
┌─────────────────────────────────────────────┐
│ 1. Mode Selection (Setup Screen)            │
│ 2. Auto Create Player ("Gast")              │
│ 3. Create Session (mode + player_id)        │
│ 4. Fetch Questions (balanced by category)   │
│ 5. Question Loop:                           │
│    - Load question + 4 answers              │
│    - User selects answer                    │
│    - Submit attempt → get ELO delta         │
│    - Show feedback (correct/wrong, ELO)     │
│    - Next button → load next question       │
│ 6. Finish Session (update player ELO/stats) │
│ 7. Results Screen (final ELO, replay)       │
└─────────────────────────────────────────────┘
```

**Shared API Contracts:**
- `POST /api/v1/quiz/players` — Create guest player
- `POST /api/v1/quiz/sessions` — Create session (mode + player_id)
- `GET /api/v1/quiz/questions?limit=N&balanced_categories=true` — Fetch questions
- `GET /api/v1/quiz/questions/{id}?num_answers=4` — Get question with 4 answers
- `POST /api/v1/quiz/questions/{id}/attempt` — Submit answer + get ELO update
- `POST /api/v1/quiz/sessions/{id}/finish` — Finish session + return final state

**Game-Specific Differences:**

| Aspekt | Millionär | Quizduell 1v1 | QD Speed |
|--------|-----------|-----------|-----------|
| Players | 1 (solo) | 2 (vs) | 1 (solo) |
| Question Count | 15 | 10 each | 10 |
| Time Limit/Question | None | None | 20s |
| Difficulty | Ascending ELO | Random/balanced | Random/balanced |
| Category | Auto (balanced) | Player choice | Auto (balanced) |
| Answer Control | Manual | Manual | Manual or Timeout |
| Lifelines | 50:50, Audience, Phone | None | None |
| Auto-Advance | No | No | No |
| Leaderboard | Yes (ELO) | Yes (wins) | Yes (ELO) |
| Leaderboard | Yes | Yes (wins/loss) |

- Done: PostgreSQL models, Alembic scaffolding, the session finish flow, all three game modes (Millionär, 1v1 local duel, Speed), question form, jokers, standardized error payloads, question update/delete endpoints, ordering questions (Kandidatenfrage), volume control, and most core backend endpoints are present. Audience poll percentage bug and phone joker second-chance bug are fixed. Millionär has a working "Nochmal spielen" replay button.
- Open: player profiles, tag-based quiz creation, and real-time 1v1 via WebSocket.

### High Priority

- [x] PostgreSQL schema: questions, answers, categories, tags, players
- [x] Alembic migration setup
- [x] Backend: question CRUD (`GET/POST /api/v1/quiz/questions`)
- [x] Backend: answer submission (`POST /api/v1/quiz/questions/{id}/attempt`)
- [x] Backend: category and tag endpoints
- [x] Backend: session management (start, state, finish)
- [x] Frontend: Mode selection screen (three buttons: Millionär, 1v1, Speed)
- [x] Frontend: Auto player creation ("Gast")
- [x] Frontend: Question loop (display Q + 4 answers, submit, show feedback)
- [x] Frontend: Results screen (final ELO, play again)
- [x] Frontend: Quizduell Speed mode (20-second timer, 10 questions, auto-advance)
- [x] Frontend: Quizduell 1v1 mode — local pass-and-play duel (DuelGame component)
- [x] Frontend: question submission form (text, correct answer, wrong answers, category, tags)
- [x] Seed initial Drachenlord question set (~50+ questions)
- [x] Player creation (name + UUID, no auth)

### Medium Priority

- [x] Leaderboard (`GET /api/v1/quiz/leaderboard`)
- [x] Balanced general question listing across categories
- [x] Player profile page with stats
- [ ] Quizduell 1v1 real-time via WebSocket (requires opponent matchmaking)
- [x] Tag-based quiz creation (play questions filtered by tag)
- [x] Lifelines in Millionär mode (50:50, audience, phone)
- [x] Randomized wrong answer selection from pool
- [ ] Authentication system (replace "Gast" with real accounts)

## Phase 3.5 — WWM Immersion & Drachenlord AI (Planned)

> These features add atmosphere and entertainment value but are deferred until the core game loop is stable.

### Sound & Atmosphere

- [ ] Audience clapping at correct answers (timed applause samples)
- [ ] Dynamic audience murmuring in background (ambient loop)
- [ ] Drachenlord samples injected every few seconds during gameplay
- [x] Level-appropriate background music (low/mid/high/million question music)
- [x] Sound effects: lock-in sound, suspense build, reveal sting
- [x] Real WWM MP3 sound files served from `/media/sounds/wwm/`
- [x] Tier-appropriate correct/wrong/safety/win stings
- [x] Joker sound effects (50:50, audience, phone)

### Drachenlord AI Moderator

- [ ] AI-generated commentary reacting to player answers
- [ ] Emotional responses: excitement on correct, disappointment on wrong
- [ ] Melancholic / nostalgic reactions when questions touch his life story
- [ ] Spontaneous outbursts and catchphrases ("Meddl Leude!", "Etzala!")
- [ ] Commentary adapts to current prize level (more nervous at high stakes)

### Question Tier / Difficulty Model

- [x] Evaluate whether `tier` field on Question model needs expansion for WWM difficulty curve
- [x] Map tiers to prize ladder levels (tier 1 = €50–€500, tier 2 = €1k–€16k, tier 3 = €32k+)
- [x] ELO-based question ordering: serve easier questions first, harder later
- [x] Category-balanced difficulty progression within a single game

### Visual Enhancements

- [x] Animated spotlight flash on question entry (brightness + slide-in CSS animation)
- [x] Dramatic pause before revealing correct answer (1.8-second delay with orange-gold pulsing)
- [x] Confetti / particle effects on reaching safety marks (pure CSS, auto-dismiss overlay)
- [x] Full-screen celebration on winning €1 Million (confetti rain + pulsing gold prize)

## Phase 4 — Quiz ELO + Media

- Done: ELO engine and per-attempt ELO update for player and question are implemented. Media upload/delete endpoints, static file serving, and frontend media display are implemented. Bulk question import endpoint is available. **Question difficulty badges** (EASY/MEDIUM/HARD based on ELO) and **ELO history tracking** per player (new `PlayerEloHistory` model + `GET /players/{id}/elo-history` endpoint) are implemented. **Moderation queue** for user-submitted questions is implemented (PENDING/APPROVED/REJECTED workflow, admin endpoints, placeholder auth). **ELO history chart** in PlayerProfile (SVG line chart, no external deps).
- Open: —

### High Priority

- [x] ELO calculation engine (K=32, base 1200)
- [x] ELO update on each question attempt (player + question)
- [x] Question ordering by ELO in Millionär mode
- [x] Media upload endpoint (`POST /questions/{id}/media` — image, video, document)
- [x] Media delete endpoint (`DELETE /questions/{id}/media`)
- [x] Static file serving (`/media/` mount via FastAPI)
- [x] Media display in question UI (image viewer, video player, document link)
- [x] Media upload in question submission form (QuestionForm.tsx)
- [x] Media type validation (JPEG, PNG, GIF, WebP, MP4, WebM, PDF)
- [x] File size limit enforcement (configurable via `PLAYBOX_MAX_MEDIA_SIZE_MB`)

### Medium Priority

- [x] ELO history / progression chart per player (frontend)
- [x] Question difficulty badge (based on ELO range: EASY < 1100, MEDIUM 1100–1300, HARD ≥ 1300)
- [x] ELO history tracking per player (`PlayerEloHistory` model + `GET /players/{id}/elo-history`)
- [x] Moderation queue for user-submitted questions
- [x] Bulk question import (JSON via API)

## Phase 5 — Chess Variants (Low Priority)

- Done: Standard 8×8 chess MVP is fully playable. `python-chess` engine integration, in-memory game store, API endpoints (create, move, resign, list), backend tests (24 passing), and interactive frontend (CSS Grid board with Unicode pieces, click-to-select/move, captured pieces, move history, resign, result screen). Engine abstraction ready for mini-board variants.
- Open: 6×8 and 7×8 variant engine implementation, client-side offline support.

- [x] Evaluate `python-chess` / `chess.js` for engine — **Result:** `python-chess` for 8×8 backend, custom `VariantEngine` ABC for mini-boards
- [ ] Board rendering (6×8 and 7×8 variants) — **Stub ready**, engine raises `NotImplementedError`
- [x] Move validation for standard board size (via `python-chess`)
- [x] Basic game flow: create, move, checkmate detection, resign
- [x] Frontend: interactive chessboard component (CSS Grid + Unicode pieces, mobile-first)

---

## Next Sprint (1-2 weeks)

### High Priority

- [x] Evaluate whether `tier` field on Question model needs expansion for WWM difficulty curve
  - **Result:** 3 tiers (1→1000, 2→1200, 3→1400) are sufficient. ELO self-calibrates through gameplay. Re-evaluate if question pool exceeds 500+.
- [x] Media upload endpoint (clips, images, documents) — Phase 4
- [x] Media display in question UI (video player, image viewer) — Phase 4

### Medium Priority

- [ ] Initialize Git repo, push to GitHub
- [ ] GitHub Actions: lint + test pipeline
- [ ] TODO: post-dev — generate proper PNG icons for PWA (replace SVG placeholders)

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
| ~~Quiz media storage decision~~ | ~~Affects Phase 4~~ | — | **resolved** (local filesystem, `/media/` mount) |

## Completed

- FastAPI app factory and router mounting structure
- `/health` endpoint
- Docker + frontend Vite scaffold
- Imposter backend core endpoints
- Imposter seed word list (220 words, 10 categories)
- Piccolo backend session flow endpoints
- Piccolo `GET /challenges` endpoint (filterable by category/intensity)
- Quiz core backend endpoints with ELO integration
- Quiz file-based starter seed importer (`python -m app.games.quiz.seed`)
- Shared test fixtures in `conftest.py`
- Shared PyCharm run configurations (`.run/`) and local IDE copies via `setup.py`
- Drachenlord seed question set (75+ questions across 8 categories, tier-based ELO)
- ELO-based question ordering for Millionär mode (ascending difficulty)
- Backend tests: `test_imposter.py` (11), `test_piccolo.py` (20), `test_quiz.py` (119), `test_elo.py` (8), `test_smoke.py` (6) — total 165 (all green)
- WWM sound system: 25 MP3 files, tier-appropriate bg music, lock-in sting, 1.8s reveal delay, joker/safety/win sounds
- WWM visual: orange-gold lock-in color, pulsing reveal animation, diamond answer buttons
- WWM visual: safety-mark confetti celebration overlay (Level 5/10), win confetti rain, spotlight flash between questions
- WWM: "Nochmal spielen" replay button on game-over/won screen (re-triggers full init)
- WWM: Phone joker second-chance bug fixed (wrong answer removed, user picks again)
- WWM: Volume control (slider + mute button, right side of header, syncs to all audio elements)
- WWM: Kandidaten-Auswahlfrage (ordering question before main game, extra life reward up to €32,000)
- ELO tier offsets: tier 1 = 1000, tier 2 = 1200, tier 3 = 1400 — system self-calibrates through gameplay
- Imposter: category filter, configurable timer, sound/vibration on timer end, round history counter
- Piccolo: slide-in animation transitions between challenges
- Standardized API error payloads: `{ "detail": "...", "code": "MACHINE_READABLE_CODE" }` via `AppError` + global exception handlers
- SQLAlchemy error handler: catches unhandled DB errors and returns `{ detail, code: "DATABASE_ERROR" }` instead of crashing
- Quizduell 1v1: local pass-and-play duel mode (DuelGame component, two players, alternating turns, scores, winner)
- Seed YAML tag coercion fix (integer year tags like `2011` auto-converted to strings)
- Smoke tests: `test_smoke.py` covers full Millionär game flow, jokers, leaderboard, and DB table creation from scratch
- conftest.py `sys.path` fix ensures in-memory SQLite override works correctly for quiz tests
- Question CRUD: `PATCH /questions/{id}` (partial update) and `DELETE /questions/{id}` (soft-delete) with tests
- Audience poll percentage distribution bug fixed (guaranteed sum = 100, deterministic remainder)
- Tier-based initial ELO offsets restored: tier 1 = 1000, tier 2 = 1200, tier 3 = 1400 — gives Millionär a natural difficulty curve on fresh databases
- Category-balanced difficulty within Millionär: ELO-sorted questions are interleaved by category within 5-question bands so one category doesn't dominate a difficulty tier
- Seed data expanded to 75+ questions (added tier 1/2/3 questions across all categories for better replayability)
- ELO-band balanced ordering: edge-case tests added (multi-category bands, single-category, fewer-than-band-size, empty DB)
- Smoke test aligned with frontend: `test_full_millionaire_game_from_scratch` now uses `balanced_categories=true` matching MillionaireGame.tsx
- Architecture.md updated with Question Ordering Strategy section and full Quiz API endpoint table
- Tag-based quiz filtering: backend `?tag=` param + frontend tag chip selector tested end-to-end (3 new tests: filter, unknown tag, tag+balanced combo)
- Player profile: `GET /players/{id}/profile` (accuracy + recent sessions), `GET /players/{id}/sessions` (history), frontend `PlayerProfile.tsx` component with "Mein Profil" button (5 new tests)
- PWA shell: `vite-plugin-pwa` with Workbox runtime caching (NetworkFirst for API, CacheFirst for media), SPA navigation fallback, SVG placeholder icons, iOS PWA meta tags in `index.html`
- Architecture.md updated with PWA Configuration section (caching strategies, offline capability per game)
- Imposter offline support: client-side fallback with cached word list (localStorage), automatic offline session creation and reveal when backend unreachable, "Offline-Modus" indicator
- Piccolo offline support: client-side fallback with cached challenge templates (localStorage), offline session with category-balanced challenge ordering, "Offline-Modus" indicator
- Tier field evaluation: 3 tiers (1→1000, 2→1200, 3→1400) confirmed sufficient for current question pool size (~75). ELO self-calibrates; no model expansion needed.
- Quiz media system: upload (`POST /questions/{id}/media`), delete (`DELETE /questions/{id}/media`), static serving (`/media/` mount), frontend display (image, video, document) in all quiz modes, media upload in QuestionForm, MIME type validation (JPEG/PNG/GIF/WebP/MP4/WebM/PDF), configurable size limit, Vite dev proxy for `/media`, 8 new tests (all green)
- Question feedback system: `POST /questions/{id}/feedback` + `GET /questions/{id}/feedback`, three feedback types (THUMBS_UP, THUMBS_DOWN, REPORT), category sets per type, optional free-text comment, consistent with cross-game reporting conventions, 16 tests (all green)
- Bulk question import: `POST /api/v1/quiz/questions/import` — accepts JSON in seed file format, deduplicates by text, auto-creates categories/tags, reuses `seed_quiz_dataset()`, 6 tests (all green)
- Draft seeds (drachenlord-seed-draft.yaml) evaluated: all 6 questions already present in German in seed_questions.yaml — no promotion needed
- Question difficulty badge: computed `difficulty` field (EASY/MEDIUM/HARD) on `QuestionOut` based on ELO thresholds (<1100 / 1100–1300 / ≥1300), 4 tests
- ELO history tracking: `PlayerEloHistory` model records every ELO change per attempt, `GET /players/{id}/elo-history` endpoint (oldest first for charting), 6 tests
- Bulk import tests restored: 6 tests covering create, dedup, tags, invalid payload, empty, ordering questions
- Moderation queue: `moderation_status` field (PENDING/APPROVED/REJECTED) on Question model, `POST /questions/submit` (user → PENDING), `POST /questions` (admin → APPROVED), `GET /admin/questions/pending`, `POST /admin/questions/{id}/moderate`, placeholder `X-Admin-Token` auth, seed/import auto-APPROVED, 11 tests
- ELO history chart: SVG-based line chart in `PlayerProfile.tsx` (EloChart component), fetches `GET /players/{id}/elo-history`, touch-friendly tooltips, correct/wrong color-coded dots, gradient fill, responsive viewBox, no external charting dependency
- Chess MVP: `python-chess` integration, `StandardEngine` (8×8) + `VariantEngine` ABC (6×8/7×8 stub), in-memory game store, API endpoints (create/get/list/move/resign), 24 backend tests (all green), interactive frontend board (CSS Grid + Unicode pieces, click-to-select/move, captured pieces display, move history, resign, result screen, mobile-first), chess module mounted at `/api/v1/chess/`
- Backend tests: `test_imposter.py` (11), `test_piccolo.py` (20), `test_quiz.py` (120), `test_elo.py` (8), `test_smoke.py` (6), `test_chess.py` (24) — total 189 (all green)

## Dependencies

- Meta-repo standards and templates (followed)
- SQLite for development (all games); PostgreSQL available for production quiz deployment
- No external API dependencies

## Notes

- Imposter and Piccolo are the quickest wins — fully offline, minimal backend
- Quiz is the most complex game — plan for iterative development
- Chess is explicitly lowest priority — implement only after the other three are stable




