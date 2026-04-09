# PlayBox 🎮

> A collection of small browser-based party & quiz games — PWA-installable, shared infrastructure.

## Ideas / Future TODOs

> Brainstorm items — not committed for implementation. Promote to [Implementation-Plan](docs/Implementation-Plan.md) when ready.

### WWM Visual Enhancements (Deferred)
- [ ] WWM studio background variants: (1) Drachenlord image + clip monitor, (2) WWM desk overlay + audience, (3) 3D studio with AI moderator voice — see Phase 3.5
- [ ] Quiz-show version: answers slide in sequentially, buzzer mode for local parties
- [ ] WWM intro screen with `intro.mp3` (currently unused — game jumps straight to Kandidatenfrage)

### Quiz Content Model (Deferred)
- [ ] Story mode for Drachenlord questions (daily 10 attempts, unlock legacy video)
- [ ] Multiple correct answers per question (currently: exactly 1 correct)
- [ ] WWM-specific questions (Wortwitz / trick questions) vs. general Quizduell pool — tagging or `mode_hint` field
- [ ] 6-answer option for special question types

### Other Games (Deferred)
- [ ] Piccolo: estimation questions (Schätzfragen)

### Resolved
- ~~Keine Ports in Python-Files → .env~~ — ports are in `.env` / config
- ~~WWM: Anordnungs-Frage zu Beginn nicht implementiert~~ — Kandidatenfrage (ordering question) implemented
- ~~Mehrere Sprachen~~ — deferred to backlog (Localization DE/EN)
## Games

| Game | Description | Status | Priority |
|------|-------------|--------|----------|
| [Imposter](#imposter) | Local multiplayer word-guessing party game | ✅ ready | high |
| [Piccolo](#piccolo) | Party challenge/dare game with player targeting | ✅ ready | high |
| [Wer wird Elite-Hater?](#wer-wird-elite-hater-quiz) | Quiz game with ELO system and community questions | ✅ ready | high |
| [Schach](#schach) | Standard 8×8 chess, local 1v1 | ✅ ready | low |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) |
| Frontend | React (TypeScript), Vite |
| Database | PostgreSQL (quiz), in-memory/SQLite (offline games during development) |
| Deployment | Docker, PWA |
| CI/CD | GitHub Actions |

## Repository Overview

```
playbox/
├── backend/
│   └── app/                   # FastAPI app and game modules
├── frontend/
│   └── src/                   # React app and game UIs
├── .github/
│   ├── copilot-instructions.md
│   └── instructions/
│       └── ...                # Layer and game-specific instructions
├── .run/                      # Shared PyCharm run configurations
├── docs/
│   └── ...                    # Architecture, roadmap, and game docs
├── pyproject.toml
└── README.md
```

Detailed system architecture, data model notes, and longer design decisions live in [`docs/Architecture.md`](docs/Architecture.md).

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+ (for quiz game)
- Make (optional, for convenience commands)

### Quick Start

**Step 1 — Install dependencies (one-time)**
```bash
make install
```

**Step 2 — Start everything**
```bash
python setup.py
```

This single command:
1. Creates the repo-root `.env` from `.env.example` if it doesn't exist yet.
2. Generates (or updates) shared PyCharm run configurations in `.run/`.
3. Writes local PyCharm copies to `.idea/runConfigurations/` for the currently opened workspace.
4. Starts backend (uvicorn) and frontend (vite) together.

Press **Ctrl+C** to stop both servers.

**Optional — seed a small quiz starter dataset**
```bash
cd backend
python -m app.games.quiz.seed
```

This imports the file-based starter questions from `backend/app/games/quiz/seed_questions.yaml`.

**PyCharm alternative (after first `python setup.py` run)**

Select `PlayBox Fullstack (compound)` in the run/debug dropdown and press **F5**. The compound config starts backend + frontend simultaneously.

### Local vs. LAN URLs

When `python setup.py` starts, it prints two groups of URLs:

- **This computer** → use these on the same machine running PlayBox (`localhost`)
- **Same LAN / Wi-Fi** → use these from a phone or another device in the same network

That means you will usually see **two frontend/backend pairs**, not four different servers:

- frontend on port `5173`
- backend API on port `8015`
- once as `localhost`
- once as your LAN IP (for example `192.168.x.x`)

If Vite itself also prints multiple network addresses, that usually just means your computer has multiple network adapters (for example Wi-Fi, Ethernet, VPN, Docker, or virtual adapters). In practice, the relevant one is typically the active Wi-Fi/LAN address in the same subnet as your phone.

**Individual servers (for debugging)**
```bash
make dev-backend      # http://localhost:8015
make dev-frontend     # http://localhost:5173
```

### All Makefile Commands

```bash
make help              # Show all available commands
make install           # Install all dependencies
make setup             # Generate PyCharm configs + start all servers
make test              # Run backend tests
make docker-up         # Start with docker-compose
```

### Docker

```bash
docker compose up --build
```

## PyCharm Run Configurations

This repository ships shared PyCharm run configurations in `.run/`. The setup script also writes local copies into `.idea/runConfigurations/` so PyCharm can see them immediately in the current workspace.

- `PlayBox Fullstack (compound)` starts backend + frontend together (recommended default)
- `PlayBox Backend (uvicorn)` runs `uvicorn app.main:app --reload` from `backend/`
- `PlayBox Frontend (vite)` runs `npm run dev` from `frontend/`
- `PlayBox Backend Tests (pytest)` runs `python -m pytest tests/ -v` from `backend/`

How to use:

1. Open the project root in PyCharm.
2. Wait for indexing and interpreter/package detection.
3. Select `PlayBox Fullstack (compound)` from the Run/Debug dropdown for normal development.
4. Use individual configs when needed (`pytest`, backend only, frontend only).

Note: a README link cannot reliably trigger an automatic PyCharm import action. Versioning `.run` files plus generating local `.idea/runConfigurations/` entries is the most reliable portable workaround.

## API Routes

| Game | Route Prefix |
|------|-------------|
| Imposter | `/api/v1/imposter/` |
| Piccolo | `/api/v1/piccolo/` |
| Quiz | `/api/v1/quiz/` |
| Chess | `/api/v1/chess/` |
| Health | `GET /health` |

---

## Game Descriptions

### Imposter

A local multiplayer party game. Players enter their names, pass the device around — each sees a secret word except one random player who sees **"Imposter"**. The group has 5 minutes to figure out who the Imposter is.

**Key features:** word list with categories, report-inappropriate-word button, configurable timer, fully offline-capable.

### Piccolo

Reimplementation of the popular Piccolo party game. Players enter names, and the app dishes out random challenges, dares, and questions targeted at specific players. Configurable intensity levels.

### Wer wird Elite-Hater? (Quiz)

A quiz game with three modes:

1. **Wer wird Elite-Haider (Millionär)** — single-player, 15 questions with escalating difficulty (ELO-based), prize ladder (€50 → €1 Million), three jokers (50:50, Audience, Phone), WWM-style dark blue UI with sound effects
2. **Quizduell 1v1** — two players on one device, pass-and-play, 10 questions each, score comparison
3. **Quizduell Speed** — solo, 20-second timer per question, 10 rapid-fire questions

Features a community-driven question database with ELO scoring (like chess tactic puzzles), media attachments (clips, images, documents), tags, categories, moderation queue, and player profiles. Initial content theme: **Drachenlord lore**.

### Schach

Standard 8×8 chess — local 1v1 on one device. Backend-powered move validation via `python-chess`. Interactive CSS Grid board with Unicode pieces, mobile-first. Engine abstraction ready for future mini-board variants (6×8, 7×8).

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — system architecture
- [docs/Implementation-Plan.md](docs/Implementation-Plan.md) — roadmap and task tracking
- [docs/games/piccolo.md](docs/games/piccolo.md) — Piccolo flow, challenge categories, and extension notes
- [docs/games/quiz/README.md](docs/games/quiz/README.md) — Quiz research notes and source dossier index

## Meta-Repo

This project is governed by the [meta-repo](https://github.com/ducktalez/meta-repo). See [catalog/playbox.md](https://github.com/ducktalez/meta-repo/blob/main/catalog/playbox.md) for the catalog entry.

## License

_To be defined._

