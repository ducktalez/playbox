# PlayBox 🎮

> A collection of small browser-based party & quiz games — PWA-installable, shared infrastructure.

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
| Database | PostgreSQL (quiz), SQLite (offline games) |
| Deployment | Docker, PWA |
| CI/CD | GitHub Actions |

## Project Structure

```
playbox/
├── backend/
│   ├── app/
│   │   ├── core/              # Shared: app factory, config, DB
│   │   ├── games/
│   │   │   ├── imposter/      # Imposter game
│   │   │   ├── piccolo/       # Piccolo game
│   │   │   ├── quiz/          # Quiz game
│   │   │   └── chess/         # Chess variants
│   │   └── main.py            # Unified server
│   ├── alembic/               # DB migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── core/              # Shared PWA shell
│   │   ├── games/             # Game UIs
│   │   └── main.tsx
│   ├── public/media/          # Quiz media assets
│   ├── package.json
│   └── vite.config.ts
├── .github/
│   └── copilot-instructions.md
├── Architecture.md
├── Implementation-Plan.md
├── pyproject.toml
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+ (for quiz game)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker compose up --build
```

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

- [Architecture.md](Architecture.md) — system architecture
- [Implementation-Plan.md](Implementation-Plan.md) — roadmap and task tracking

## Meta-Repo

This project is governed by the [meta-repo](https://github.com/ducktalez/meta-repo). See [catalog/playbox.md](https://github.com/ducktalez/meta-repo/blob/main/catalog/playbox.md) for the catalog entry.

## License

_To be defined._

