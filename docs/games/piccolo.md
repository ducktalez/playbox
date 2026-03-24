# Piccolo — Functional Overview

This document is the planning surface for the Piccolo game.
Use it to review or adjust the game flow, challenge taxonomy, and category list before expanding the implementation.

## Goal

Piccolo is a local party game for one shared device.
A group enters player names, chooses an intensity and optional categories, then moves through short challenge cards one by one.

## Core Game Flow

### 1. Setup
- Enter at least 2 player names
- Empty names fall back to `Player 1`, `Player 2`, ... for quick local testing
- Choose an intensity level
- Optionally limit the round to selected categories
- Start a session

### 2. Session Creation
- The backend filters the bundled challenge pool by intensity and category
- The filtered challenge list is balanced in memory so one category does not dominate the round opening
- A session is created in memory only

### 3. Challenge Loop
- The frontend requests the next challenge from the session
- The backend injects one or more player names into the template
- The challenge is shown in an app-like fullscreen view for the local group
- The active card fills the screen so the group can tap almost anywhere for the next challenge
- A small back/exit control remains available to leave the fullscreen round view

### 4. End / Reset
- The current MVP resets locally by returning to setup
- No history, persistence, or account state is stored during development

## Current Intensity Levels

| Intensity | Meaning | Backend behavior |
|----------|---------|------------------|
| `mild` | Thinker version without drinking pressure | Includes only `mild` templates |
| `medium` | Classic drinking-game mode | Includes `mild` + `medium` templates |
| `spicy` | Wild party mode | Includes `mild` + `medium` + `spicy` templates |

## Current Challenge Categories

This is the current category list used by the backend challenge templates.
Adjust this list intentionally when planning new cards or frontend filters.

| Category | Purpose | Typical card behavior |
|----------|---------|-----------------------|
| `dare` | Direct action prompt | One or more players must do something |
| `question` | Personal or funny question | One player answers |
| `group` | Whole-group action | Everyone does the action together |
| `vote` | Social comparison / voting prompt | Group decides or points at someone |
| `versus` | Small head-to-head interaction | Two players compete |
| `automarken` | Brand/topic prompt | The round names car brands or reacts to a fixed topic |
| `koffer packen` | Memory chain prompt | The group builds or repeats a packing list |
| `ich habe schon mal` | Shared-experience prompt | Players react to a "never have I ever" style statement |
| `trinkregeln` | Rule-introduction prompt | A temporary round rule is introduced |

## Current Challenge Structure

Backend challenge templates currently use this shape:

| Field | Meaning |
|------|---------|
| `text` | Template text with placeholders like `{player}` or `{player2}` |
| `category` | Category name from the list above |
| `intensity` | `mild`, `medium`, or `spicy` |
| `target_count` | Number of player placeholders to fill |

## Planning Notes For New Cards

### Recommended Rules
- Keep challenge text short and easy to scan in one glance
- Prefer prompts that work in a local pass-and-play context
- Keep category names stable once frontend filters depend on them
- Add new categories only when they have enough cards to justify a visible filter
- Keep session ordering category-balanced so very large categories do not crowd out the smaller ones

### Good Reasons To Add A New Category
- A new card family behaves differently from the current five categories
- The frontend should expose it as a distinct filter
- The challenge pool is large enough to support repeated use

### Good Reasons To Avoid A New Category
- The behavior already fits `dare`, `question`, `group`, `vote`, or `versus`
- The new category would only contain a handful of cards
- The distinction matters only internally, not for the player-facing experience

## Editable Planning Surface

Use this section when you want to review or change the planned taxonomy.

### Candidate Categories
- `dare`
- `question`
- `group`
- `vote`
- `versus`
- `automarken`
- `koffer packen`
- `ich habe schon mal`
- `trinkregeln`
- `truth` *(candidate, not implemented)*
- `penalty` *(candidate, not implemented)*
- `mini-game` *(candidate, not implemented)*

### Open Questions
- Should `truth` stay folded into `question`, or become its own category later?
- Should punishment-style cards remain `dare`, or become `penalty`?
- Do we want a separate category for short group mini-games?
- When should category icons or descriptions be added to the frontend?
- If Piccolo ever gains quiz-style prompts, which Quizduell questions would be worth linking instead of duplicating?

## Source Of Truth

- Runtime templates currently live in `backend/app/games/piccolo/service.py`
- If the challenge taxonomy or flow changes, update this file and this document together




