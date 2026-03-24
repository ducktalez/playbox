---
applyTo: "**/games/quiz/**"
---
# Quiz Instructions

These instructions apply to both backend and frontend files for the Quiz game.

## Scope
- Quiz is the only current game that may rely on PostgreSQL.
- Keep all quiz-specific logic inside the quiz module.
- Respect the existing ELO-based question/player model.

## Backend Rules
- Preserve UUID-based persistent models and the current Alembic-backed schema flow.
- Do not access detached ORM entities after commit/close.
- Any new question/attempt/session endpoint must have backend tests.
- Prefer category-balanced question selection when listing general question pools so large categories do not crowd out the smaller ones.

## Frontend Rules
- Prioritize core game modes over styling polish.
- Keep question, answer, leaderboard, and session flows lean.
- Favor app-like, touch-friendly play screens where it improves the current mode flow.
- Keep quiz screens workable on phones first, even when desktop layouts exist.
- Do not introduce auth complexity; player identity remains lightweight.

## Current Focus
- Session completion, frontend mode flows, and question submission remain higher value than advanced polish.
- Media support should stay URL/file-based only.
- Quizduell questions may later be linked to Piccolo quiz-style prompts, but that relationship should be introduced only when there is a concrete gameplay need.





