# PlayBox 🎮

> A collection of small browser-based party & quiz games — PWA-installable, shared infrastructure.

## Ablage/TODOs

- "Story mode" für Winklerfragen (Jeden Tag zehn Versuche. Schaltet ein Legacy-Winkel-Video frei) 
  - Am Anfang: 6 Antworten
- Option: Mehr als eine richtige Antwort
- Plan: Mehrere Sprachen (Deutsch, Englisch). Vorrangig einheitlich, starten mit english. 
- Piccolo: Schätz-fragen 
- Keine Ports in python-files -> .env

## Games

| Game | Description | Status | Priority |
|------|-------------|--------|----------|
| [Imposter](#imposter) | Local multiplayer word-guessing party game | planned | high |
| [Piccolo](#piccolo) | Party challenge/dare game with player targeting | planned | high |
| [Wer wird Elite-Hater?](#wer-wird-elite-hater-quiz) | Quiz game with ELO system and community questions | planned | high |
| [Chess Variants](#chess-variants) | Custom chess with fewer rows (LiChess-inspired) | planned | low |

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

A quiz game with two modes:

1. **Wer wird Millionär** — single-player, escalating difficulty, lifelines
2. **Quizduell** — 1v1 / multiplayer, category-based, score comparison

Features a community-driven question database with ELO scoring (like chess tactic puzzles), media attachments (clips, images, documents), tags, and categories. Initial content theme: **Drachenlord lore**.

### Chess Variants

Custom chess variants inspired by LiChess — primarily chess with fewer rows (6×8 or 7×8). Lowest priority.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — system architecture
- [docs/Implementation-Plan.md](docs/Implementation-Plan.md) — roadmap and task tracking
- [docs/games/piccolo.md](docs/games/piccolo.md) — Piccolo flow, challenge categories, and extension notes
- [docs/games/quiz/README.md](docs/games/quiz/README.md) — Quiz research notes and source dossier index

## Meta-Repo

This project is governed by the [meta-repo](https://github.com/ducktalez/meta-repo). See [catalog/playbox.md](https://github.com/ducktalez/meta-repo/blob/main/catalog/playbox.md) for the catalog entry.

## License

_To be defined._

