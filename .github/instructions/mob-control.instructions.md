---
applyTo: "**/games/mob-control/**"
---
# Mob Control Instructions

These instructions apply to the Mob Control frontend game module.

## Scope
- Mob Control is a **pure frontend arcade game** — no backend, no database, no API.
- All game logic lives in `frontend/src/games/mob-control/`.
- No cross-game imports; only `core/` utilities (i18n) are allowed.

## Architecture

### Rendering
- Canvas-based (`<canvas>` element, 400 × 620 px).
- Game loop via `requestAnimationFrame`; `useCallback` with empty deps for stability.
- All mutable game state lives in a **single `useRef<GS>`** — never in React state.
- React `useState` is only used for the overlay layer (start screen, game-over) and the HUD.
- Call `syncUi()` after any change that should update the HUD or trigger overlay transitions.

### Phase machine
```
start → playing → battle-anim → battle → playing (non-boss win)
                                        → playing (next level, boss win)
                                        → game-over (lose)
```
- `playing`: world scrolls, player steers, gates auto-apply, enemy collision detected.
- `battle-anim` — single continuous clash phase:
  - Trigger fires exactly when the **outer edges** of both clusters first touch:
    `triggerY = PLAYER_Y − clusterRadius(playerDots) − clusterRadius(enemyDots)`.
  - Enemy cluster **grinds forward** at `BATTLE_GRIND_SPEED` (0.5 px/frame) toward
    `PLAYER_Y`, capped there — like armies pushing against each other.
  - Dot removal (via pre-sorted positions, front-facing first) runs simultaneously
    from the very first frame of contact — no separate approach phase.
- `battle`: brief result flash; `setTimeout` triggers next-level or game-over.
- `start` / `game-over`: canvas is static; DOM overlay rendered on top.

### World model
- `scroll` increases every `playing` frame at a **fixed** `SCROLL_SPEED` (never level-scaled).
- Object screen position: `screenY = object.baseY + scroll`.
- Negative `baseY` → above the canvas, scrolls down toward the player.
- Gate trigger: `baseY + scroll >= PLAYER_Y − GATE_H / 2`.

### Dot cluster rendering
- Blobs are rendered as clusters of small circles (phyllotaxis / golden-angle spiral layout).
- `phyllotaxisPositions(n)` is deterministic for a given `n` — stable across frames, no RNG per draw.
- Visual dot count capped at `MAX_VISUAL_DOTS` (100); actual count shown as text below cluster.
- **Elliptical layout for large groups**: `phyllotaxisPositions` scales the X axis by
  `aspect = 1 + max(0, (n − 30) / 70)` — circular at n ≤ 30, up to 2× wider at n = 100.
  Y spread is unchanged, so vertical collision math (`clusterRadius`) remains correct.
- During `battle-anim`, positions are **pre-sorted once** at battle start — not recomputed per frame:
  - Player: sorted ascending Y (topmost = facing enemy) → index 0 removed first.
  - Enemy: sorted descending Y (bottommost = facing player) → index 0 removed first.
  - `drawBattleCluster` skips the first `(total - visCount)` entries, so front-facing dots disappear first.

### Controls
- Mouse `mousemove` / touch `touchmove` on the canvas wrapper updates `gsRef.current.targetX`.
- `playerX = targetX` each frame (direct, no interpolation).
- Gate selection is **automatic**: when a gate band reaches `PLAYER_Y`, whichever side
  (`playerX < CW/2` = left, else right) the player is on determines the applied operator.

## Level Design
Each level is a sequence of **gate segments** interleaved with **enemy groups**:
```
GATE GATE → ENEMY(checkpoint) → GATE GATE → ENEMY(boss)
```
- Gates per segment: `GATES_PER_SEG = 2` (fixed — no level scaling of pace).
- Enemy groups: 1 at level 1, +1 every 2 levels, max 3.
- **Checkpoint** enemy ≈ 40 % of current soldiers — survivable but punishing if weak.
- **Boss** enemy ≈ 140 %+ — requires good gate choices; defeating it ends the level.
- After each non-boss win: 600 ms flash, continue scrolling.
- After boss win: 1 400 ms flash, load next level.

## Known Pitfalls
- **Do not update soldiers / level in `gsRef` and `useState` in separate places** — always
  change `gsRef.current` first and then call `syncUi()` to push into React.
- **Never call `syncUi()` inside `drawScene()`** — `drawScene` reads `gsRef` directly.
- The `gameLoop` function captures `gsRef` and `canvasRef` via closure; they must be stable refs.
  Passing anything else into it will cause stale-closure bugs.
- `requestAnimationFrame` is continued only for phases `"playing"`, `"battle-anim"`, `"battle"`.
  All other phases (`"start"`, `"game-over"`) rely on DOM overlays, not the canvas loop.
- **Always call `cancelAnimationFrame(g2.raf)` at the top of every `setTimeout` callback**
  before scheduling a new RAF. The `battle` phase keeps the RAF running for the flash
  countdown; without the cancel, a second loop starts and the game doubles in speed per battle.

## File Structure
```
frontend/src/games/mob-control/
├── MobControlGame.tsx   # Canvas game loop, phase machine, all rendering
└── translations.ts      # German/English strings (uses shared i18n system)
```

## Current Status (Phase 8 — done)
- [x] Canvas game loop with requestAnimationFrame
- [x] Dot-cluster rendering (phyllotaxis)
- [x] Gate pairs — two full-width halves, direct mouse/touch steering
- [x] Auto-apply gate on collision (left/right based on playerX)
- [x] Multiple enemy groups per level (checkpoint + boss structure)
- [x] Battle animation — dots removed one by one from both sides
- [x] Level scaling — more/stronger enemies, constant scroll speed
- [x] HUD (level, score, soldiers), start screen, game-over screen
- [x] Route `/mob-control`, lazy-loaded, added to Home grid and navigation
- [x] German/English translations via shared i18n

## Deferred / Future (Phase 9)

See `docs/Implementation-Plan.md § Phase 9` for the full prioritised roadmap.
Short summary:

**A — Quality of Life (next up)**
- High-score persistence (localStorage)
- Count label always visible (no overlap with cluster)
- Gate labels colour-coded (green = positive, red = negative/divide)
- Mobile first-run touch hint

**B — Shooting mechanic** *(only after A is solid)*
- `pointerdown` fires a bullet (small white circle) upward from player position
- Bullet hits enemy outer edge → removes 1 enemy dot, bullet disappears
- Bullets stored in `GS.bullets: { x, y }[]`; advanced each `playing` frame
- Separate from battle-anim — shooting reduces enemy count *before* contact

**C — Low-priority extras**
- Sound effects (Web Audio API)
- Distinct boss / checkpoint enemy rendering
- Leaderboard backend (only if concrete demand)







