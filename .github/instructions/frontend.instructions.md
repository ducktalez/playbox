---
applyTo: "frontend/**"
---
# Frontend Instructions

These instructions supplement the global `.github/copilot-instructions.md` for files inside `frontend/`.

## What "only the necessary" means here
- **No complex state management.** Plain `useState`/`useEffect` is sufficient. No Redux, Zustand, etc.
- Use `react-router-dom` for routing. Each game gets its own route (`/imposter`, `/piccolo`, `/quiz`, `/chess`).
- The backend is the priority. Frontend must not block backend development.

## Game UI Rules
- Each game has its own directory: `src/games/{game}/`. Game components must not import from other games.
- Shared shell (layout, nav, PWA): `src/core/`.
- Game modules are **lazy-loaded** via `React.lazy()`.

## Deferred until go-live
- **Styling polish**: no design system, no CSS framework. Basic inline styles or minimal CSS are fine for now.
- **Animations**: not needed yet.
- **i18n / localization**: deferred. UI is German by default.
- **Offline caching**: Service Worker is configured but cache strategies are not tuned yet.

