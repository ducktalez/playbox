/**
 * Mob Control — arcade game.
 *
 * Pure frontend, no backend.
 *
 * Controls:
 *   Mouse / touch: move left or right — the player blob follows the cursor.
 *   Gates are passed automatically: when a gate band scrolls down to the player,
 *   whichever side (left/right of centre) the player is on determines the operator.
 *
 * World model:
 *   `scroll` increases each frame.
 *   screenY(obj) = obj.baseY + scroll
 *   Objects start at negative baseY (above screen) and scroll downward.
 *   Gate triggers when screenY >= PLAYER_Y − GATE_H/2 (band overlaps player).
 *
 * Rendering:
 *   Player / enemy blobs = cluster of small filled circles (phyllotaxis layout).
 *   Count shown as text below the cluster.
 *
 * Speed constant:
 *   Set SCROLL_SPEED to TEST_SPEED for fast testing, PLAY_SPEED for normal gameplay.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "../../core/i18n";
import { mobControlTranslations } from "./translations";

// ── Canvas geometry ───────────────────────────────────────────────────────────
const CW = 400;
const CH = 620;
const PLAYER_Y = 510; // fixed screen-Y for the player blob

// ── Speeds (swap for testing) ─────────────────────────────────────────────────
const PLAY_SPEED = 1.1; // px/frame — constant, never increases with level
// const TEST_SPEED = 4.0; // px/frame — fast testing
const SCROLL_SPEED = PLAY_SPEED;

// No lerp — player moves to mouse/touch position directly each frame

// ── Level layout ──────────────────────────────────────────────────────────────
const FIRST_GATE_BASE_Y = -130; // first gate starts above screen
const GATE_SPACING = 220; // world-px between consecutive gates (player reaction time)
const ENEMY_EXTRA_GAP = 280; // extra gap after last gate before enemy

// ── Gate dimensions ───────────────────────────────────────────────────────────
const GATE_H = 54; // height of the gate band

// ── Dot cluster rendering ─────────────────────────────────────────────────────
const DOT_R = 5; // radius of each soldier dot
const MAX_VISUAL_DOTS = 100; // cap dots for performance / readability
const FLASH_FRAMES = 30;
const BATTLE_DELAY_MS = 1400;
/** Pixels per frame the enemy cluster "grinds" forward during the clash. */
const BATTLE_GRIND_SPEED = 0.5;

// ── Shooting & barriers ───────────────────────────────────────────────────────
const BULLET_SPEED = 8;        // px/frame; bullets travel upward
const BULLET_R = 3;             // bullet circle radius px
const AUTO_FIRE_INTERVAL = 60;  // frames between automatic shots (1/s at 60 fps)
const WEAPON_SPREAD_BULLETS = 5; // bullets per volley when weapon gate is collected
const BARRIER_H = 26;            // barrier band height px
const BARRIER_W = 260;       // barrier width px (centered, CW = 400)
const REGROUP_FRAMES = 40;  // frames for dot-regroup animation after barrier contact

// ── Persistence keys ──────────────────────────────────────────────────────────
const HIGH_SCORE_KEY = "mobControl_highScore";
const HINT_SEEN_KEY  = "mobControl_hintSeen";

// ── Types ─────────────────────────────────────────────────────────────────────
/** "🔫" is a special gate option: activates multi-shot mode, no soldier change. */
type Op = "+" | "−" | "×" | "÷" | "🔫";
/**
 * Phase transitions:
 *   start → playing → battle-anim → battle (flash) → playing (if non-boss win)
 *                                                   → playing (next level, if boss win)
 *                                                   → game-over (if lose)
 *
 * During `playing` the player can also shoot bullets (pointerdown).
 */
type Phase = "start" | "playing" | "battle-anim" | "battle" | "game-over";

interface GateOpt {
  op: Op;
  val: number;
}

interface Gate {
  left: GateOpt;
  right: GateOpt;
  /** Y offset (negative = above canvas). screenY = baseY + scroll. */
  baseY: number;
  cleared: boolean;
}

/** An enemy group on the track. Clearing the boss ends the level. */
interface EnemyEncounter {
  count: number;
  baseY: number;
  cleared: boolean;
  isBoss: boolean;
}

/**
 * A bullet fired by the player.
 * Travels upward at BULLET_SPEED; removed on hit or when it leaves the canvas.
 */
interface Bullet {
  x: number;
  y: number;
  dead: boolean;
}

/**
 * A barrier obstacle on the track.
 * Shoot it down (hp → 0) to clear it harmlessly.
 * If it reaches the player with hp > 0 it acts as a blockade:
 *   dots whose absolute X falls within the barrier's X range are swept away;
 *   survivors then animate back into formation (regroup).
 */
interface Barrier {
  baseY: number;
  hp: number;
  maxHp: number;
  cleared: boolean;
}

/**
 * Mutable game state stored in a ref — never causes React re-renders on its own. */
interface GS {
  phase: Phase;
  soldiers: number;
  level: number;
  score: number;
  scroll: number;
  playerX: number; // current horizontal position (direct, no interpolation)
  targetX: number; // mouse/touch position
  gates: Gate[];
  enemies: EnemyEncounter[];
  barriers: Barrier[];
  bullets: Bullet[];
  weaponActive: boolean; // true after collecting a 🔫 gate → all soldiers shoot (spread)
  currentBattleEnemy: EnemyEncounter | null; // enemy being fought right now
  flash: number;
  flashMsg: string;
  flashGreen: boolean;
  // ── Battle animation state ──────────────────────────────────────────────
  battlePlayerVis: number;
  battleEnemyVis: number;
  battleAnimTimer: number;
  battleFramesPerStep: number;
  /** Enemy Y during battle-anim — starts at outer-edge contact, creeps toward PLAYER_Y. */
  battleEnemyY: number;
  battlePlayerSortedPos: [number, number][];
  battleEnemySortedPos: [number, number][];
  // ── Regroup animation (after barrier blockade) ─────────────────────────
  /** Scattered "from" positions that converge to normal phyllotaxis layout. */
  regroup: { from: [number, number][]; t: number } | null;
  bulletCooldown: number; // frames until next auto-fire
  raf: number;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function applyOp(n: number, opt: GateOpt): number {
  switch (opt.op) {
    case "+": return n + opt.val;
    case "−": return Math.max(1, n - opt.val);
    case "×": return n * opt.val;
    case "÷": return Math.max(1, Math.round(n / opt.val));
    case "🔫": return n; // no soldier change — weapon activation handled in gate check
  }
}

function optLabel(opt: GateOpt): string {
  if (opt.op === "🔫") return "🔫";
  return `${opt.op}${opt.val}`;
}

function isPositiveOp(opt: GateOpt): boolean {
  return opt.op === "+" || opt.op === "×" || opt.op === "🔫";
}

// ── Level generation ──────────────────────────────────────────────────────────

function makeOpt(level: number): GateOpt {
  const r = Math.random();
  if (r < 0.10) return { op: "🔫", val: 0 };
  if (r < 0.44) return { op: "+", val: 3 + Math.floor(Math.random() * (5 + level)) };
  if (r < 0.64) return { op: "×", val: 2 + (level >= 3 ? Math.floor(Math.random() * 2) : 0) };
  if (r < 0.84) return { op: "−", val: 1 + Math.floor(Math.random() * (2 + Math.floor(level * 0.6))) };
  return { op: "÷", val: 2 + (level >= 5 ? 1 : 0) };
}

/**
 * Generates a level as interleaved gate segments, HP barriers, and enemy groups.
 *
 * Structure per enemy group:
 *   GATE GATE → BARRIER(hp) → ENEMY
 *
 * Scroll speed is constant; difficulty comes from stronger/more barriers+enemies.
 * Enemies are more numerous than before — shooting reduces them before contact.
 */
function makeLevel(level: number, soldiers: number) {
  const GATES_PER_SEG = 2;
  const groupCount = Math.min(1 + Math.floor(level / 2), 3);

  const gates: Gate[] = [];
  const enemies: EnemyEncounter[] = [];
  const barriers: Barrier[] = [];


  let y = FIRST_GATE_BASE_Y;

  for (let e = 0; e < groupCount; e++) {
    const isBoss = e === groupCount - 1;

    // Gate segment
    for (let gi = 0; gi < GATES_PER_SEG; gi++) {
      gates.push({ left: makeOpt(level), right: makeOpt(level), baseY: y, cleared: false });
      y -= GATE_SPACING;
    }

    // Barrier before the enemy — shoot down or face casualties
    const barrierHp = Math.max(3, 2 + level + Math.floor(Math.random() * 3));
    y -= ENEMY_EXTRA_GAP / 2;
    barriers.push({ baseY: y, hp: barrierHp, maxHp: barrierHp, cleared: false });
    y -= ENEMY_EXTRA_GAP / 2;

    // Enemy group — more numerous; player shooting reduces count before contact
    const sizeRatio = isBoss
      ? 1.8 + level * 0.18  // boss: significantly harder
      : 0.7 + e * 0.25;     // checkpoints: noticeable threat
    const count = Math.max(5, Math.floor(soldiers * sizeRatio) + Math.floor(Math.random() * (2 + level)));

    enemies.push({ count, baseY: y, cleared: false, isBoss });
    y -= GATE_SPACING;
  }

  return { gates, enemies, barriers, scroll: 0 as const };
}

// ── Dot cluster helpers ───────────────────────────────────────────────────────

/**
 * Phyllotaxis (golden-angle spiral) layout — gives a natural "crowd" look.
 * Returns up to n positions, stable across frames (deterministic for same n).
 *
 * When n > 30 the cluster widens horizontally so it fits the canvas better:
 *   aspect = 1.0 at n ≤ 30  →  2.0 at n = 100  (linear interpolation)
 * The Y spread stays unchanged, so vertical collision math is unaffected.
 */
function phyllotaxisPositions(n: number): [number, number][] {
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle ≈ 137.5°
  const spread = 9 + Math.sqrt(n) * 4.5;    // cluster Y-radius grows with count
  // Horizontal stretch: 1× for small groups, up to 2× for large groups
  const aspect = 1 + Math.max(0, (n - 30) / 70);
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = spread * Math.sqrt((i + 0.5) / n);
    const theta = i * phi;
    result.push([r * Math.cos(theta) * aspect, r * Math.sin(theta)]);
  }
  return result;
}

function clusterRadius(vis: number): number {
  return 9 + Math.sqrt(vis) * 4.5;
}

/**
 * Draw a soldier/enemy blob as a cluster of small circles.
 */
function drawDotCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  fill: string,
  glow: string,
) {
  const vis = Math.min(count, MAX_VISUAL_DOTS);
  const positions = phyllotaxisPositions(vis);

  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.fillStyle = fill;
  for (const [dx, dy] of positions) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Count label — always visible with a dark background pill
  const r = clusterRadius(vis);
  const label = String(count);
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelY = cy + r + 6;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(11,11,26,0.72)";
  ctx.fillRect(cx - tw / 2 - 4, labelY - 1, tw + 8, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx, labelY);
}

/**
 * Draw a cluster during battle using pre-sorted positions.
 * sortedPos[0] = the dot facing the opponent (removed first).
 * We skip the first (total - show) entries so that front-facing dots vanish first.
 */
function drawBattleCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sortedPos: [number, number][],
  visCount: number,   // how many dots are still alive (actual count, capped at sortedPos.length)
  actualCount: number, // displayed number label
  fill: string,
  glow: string,
) {
  const total = sortedPos.length;
  const show = Math.min(visCount, total);
  const skip = total - show; // skip front-facing dots first

  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.fillStyle = fill;
  for (let i = skip; i < total; i++) {
    ctx.beginPath();
    ctx.arc(cx + sortedPos[i][0], cy + sortedPos[i][1], DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const r = clusterRadius(show);
  const label = String(actualCount);
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelY = cy + r + 6;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(11,11,26,0.72)";
  ctx.fillRect(cx - tw / 2 - 4, labelY - 1, tw + 8, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx, labelY);
}

/**
 * Draw a barrier obstacle.
 * HP is shown as a row of circles: filled = intact, outlined = already shot out.
 */
function drawBarrier(ctx: CanvasRenderingContext2D, barrier: Barrier, sy: number) {
  const bLeft = CW / 2 - BARRIER_W / 2;
  const top   = sy - BARRIER_H / 2;

  // Background band
  ctx.fillStyle = "#1e1000";
  ctx.fillRect(bLeft, top, BARRIER_W, BARRIER_H);
  ctx.strokeStyle = "#cc7700";
  ctx.lineWidth = 2;
  ctx.strokeRect(bLeft + 1, top + 1, BARRIER_W - 2, BARRIER_H - 2);

  // HP circles: each circle = 1 hp
  const n = barrier.maxHp;
  const circleR = Math.min(8, Math.floor((BARRIER_W - 20) / (n * 3)));
  const gap = circleR * 0.6;
  const totalW = n * circleR * 2 + (n - 1) * gap;
  const startX = CW / 2 - totalW / 2 + circleR;

  for (let i = 0; i < n; i++) {
    const cx = startX + i * (circleR * 2 + gap);
    ctx.beginPath();
    ctx.arc(cx, sy, circleR, 0, Math.PI * 2);
    if (i < barrier.hp) {
      const ratio = barrier.hp / barrier.maxHp;
      ctx.fillStyle = `rgb(255,${Math.round(140 * ratio)},0)`;
      ctx.fill();
    } else {
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/**
 * Draw the player cluster during the regroup animation.
 * Dot positions lerp (smoothstep) from `from` toward the normal phyllotaxis layout.
 */
function drawRegroupCluster(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  from: [number, number][],
  soldiers: number,
  fill: string, glow: string,
  t: number,
) {
  const vis = Math.min(soldiers, MAX_VISUAL_DOTS);
  const to = phyllotaxisPositions(vis);
  const st = t * t * (3 - 2 * t); // smoothstep

  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.fillStyle = fill;
  for (let i = 0; i < vis; i++) {
    const [fx, fy] = i < from.length ? from[i] : [0, 0];
    const [tx, ty] = to[i];
    ctx.beginPath();
    ctx.arc(cx + fx + (tx - fx) * st, cy + fy + (ty - fy) * st, DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const r = clusterRadius(vis);
  const label = String(soldiers);
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelY = cy + r + 6;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(11,11,26,0.72)";
  ctx.fillRect(cx - tw / 2 - 4, labelY - 1, tw + 8, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx, labelY);
}

// ── Scene drawing ─────────────────────────────────────────────────────────────

/**
 * Fire bullet(s) from the player.
 * Without weapon: 1 bullet from playerX.
 * With weapon active: WEAPON_SPREAD_BULLETS bullets spread across the cluster width.
 */
function spawnBullets(g: GS): void {
  if (!g.weaponActive) {
    g.bullets.push({ x: g.playerX, y: PLAYER_Y - 20, dead: false });
  } else {
    const vis = Math.min(g.soldiers, MAX_VISUAL_DOTS);
    const r = clusterRadius(vis) * 0.85;
    for (let i = 0; i < WEAPON_SPREAD_BULLETS; i++) {
      const frac = WEAPON_SPREAD_BULLETS === 1 ? 0
        : (i / (WEAPON_SPREAD_BULLETS - 1)) * 2 - 1;
      g.bullets.push({ x: g.playerX + frac * r, y: PLAYER_Y - 20, dead: false });
    }
  }
}

function drawScene(ctx: CanvasRenderingContext2D, g: GS) {
  // Background
  ctx.fillStyle = "#0b0b1a";
  ctx.fillRect(0, 0, CW, CH);

  // Road (decorative strip)
  const RL = CW / 2 - 80;
  const RR = CW / 2 + 80;
  ctx.fillStyle = "#13132a";
  ctx.fillRect(RL, 0, RR - RL, CH);

  // Road edges
  ctx.strokeStyle = "#252548";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  for (const x of [RL, RR]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke();
  }

  // Centre dash
  ctx.strokeStyle = "#20204a";
  ctx.lineWidth = 1;
  ctx.setLineDash([12, 18]);
  ctx.beginPath(); ctx.moveTo(CW / 2, 0); ctx.lineTo(CW / 2, CH); ctx.stroke();
  ctx.setLineDash([]);

  // ── Gates ────────────────────────────────────────────────────────────────
  for (const gate of g.gates) {
    if (gate.cleared) continue;
    const sy = gate.baseY + g.scroll;
    if (sy < -GATE_H - 10 || sy > CH + 10) continue;

    const top = sy - GATE_H / 2;
    const mid = CW / 2;

    // Which side is the player on right now?
    const playerSide = g.playerX < mid ? "left" : "right";

    // Highlight intensity grows as gate approaches player
    const dist = Math.max(0, 90 - Math.abs(sy - PLAYER_Y));
    const hlAlpha = dist / 90;

    for (const side of ["left", "right"] as const) {
      const isLeft = side === "left";
      const opt = isLeft ? gate.left : gate.right;
      const x = isLeft ? 0 : mid;
      const w = mid;

      const good = isPositiveOp(opt);
      const active = playerSide === side;

      // Base background
      ctx.fillStyle = good ? "#162838" : "#321622";
      ctx.fillRect(x, top, w, GATE_H);

      // Active-side tint
      if (active && hlAlpha > 0) {
        ctx.fillStyle = good
          ? `rgba(0,180,80,${0.30 * hlAlpha})`
          : `rgba(200,40,40,${0.28 * hlAlpha})`;
        ctx.fillRect(x, top, w, GATE_H);
      }

      // Border
      ctx.strokeStyle = good
        ? (active ? "#44ffaa" : "#2288aa")
        : (active ? "#ff5566" : "#883344");
      ctx.lineWidth = active && hlAlpha > 0.3 ? 2.5 : 1.5;
      ctx.strokeRect(x + 1, top + 1, w - 2, GATE_H - 2);

      // Label — colour-coded: green for positive ops, red for negative/divide
      ctx.fillStyle = good ? "#66ffcc" : "#ff7788";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(optLabel(opt), x + w / 2, sy);
    }
  }

  // ── Barrier obstacles ────────────────────────────────────────────────────
  for (const bar of g.barriers) {
    if (bar.cleared) continue;
    const bsy = bar.baseY + g.scroll;
    if (bsy > -BARRIER_H && bsy < CH + BARRIER_H) drawBarrier(ctx, bar, bsy);
  }


  // ── Enemy clusters ────────────────────────────────────────────────────────
  if (g.phase === "battle-anim" || g.phase === "battle") {
    // Active battle enemy: uses pre-sorted positions, moves during approach
    if (g.battleEnemyVis > 0 || g.phase === "battle-anim") {
      drawBattleCluster(ctx, CW / 2, g.battleEnemyY,
        g.battleEnemySortedPos, g.battleEnemyVis,
        Math.max(0, g.battleEnemyVis), "#cc2233", "#ff4466");
    }
    // Other non-cleared enemies scroll normally
    for (const enemy of g.enemies) {
      if (enemy.cleared || enemy === g.currentBattleEnemy) continue;
      const esy = enemy.baseY + g.scroll;
      if (esy > -80 && esy < CH + 40) {
        drawDotCluster(ctx, CW / 2, esy, enemy.count, "#cc2233", "#ff4466");
      }
    }
  } else {
    for (const enemy of g.enemies) {
      if (enemy.cleared) continue;
      const esy = enemy.baseY + g.scroll;
      if (esy > -80 && esy < CH + 40) {
        drawDotCluster(ctx, CW / 2, esy, enemy.count, "#cc2233", "#ff4466");
      }
    }
  }

  // ── Player cluster ────────────────────────────────────────────────────────
  if (g.phase === "battle-anim" || g.phase === "battle") {
    drawBattleCluster(ctx, g.playerX, PLAYER_Y,
      g.battlePlayerSortedPos, g.battlePlayerVis,
      Math.max(0, g.battlePlayerVis), "#2255dd", "#3366ff");
  } else if (g.regroup) {
    drawRegroupCluster(ctx, g.playerX, PLAYER_Y,
      g.regroup.from, g.soldiers, "#2255dd", "#3366ff", g.regroup.t);
  } else {
    drawDotCluster(ctx, g.playerX, PLAYER_Y, g.soldiers, "#2255dd", "#3366ff");
  }

  // ── Bullets ───────────────────────────────────────────────────────────────
  if (g.bullets.length > 0) {
    ctx.shadowColor = "#aaddff";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#eef8ff";
    for (const b of g.bullets) {
      if (b.y < -BULLET_R || b.y > CH + BULLET_R) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ── Flash overlay ─────────────────────────────────────────────────────────
  if (g.flash > 0) {
    const alpha = (g.flash / FLASH_FRAMES) * 0.32;
    ctx.fillStyle = g.flashGreen
      ? `rgba(0,200,80,${alpha})`
      : `rgba(200,30,50,${alpha})`;
    ctx.fillRect(0, 0, CW, CH);

    if (g.flashMsg) {
      ctx.fillStyle = g.flashGreen ? "#66ffaa" : "#ff6677";
      ctx.font = "bold 26px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(g.flashMsg, CW / 2, PLAYER_Y - 70);
    }
  }

  // ── Steering hint when a gate is approaching ──────────────────────────────
  if (g.phase === "playing") {
    const near = g.gates.find(
      (gt) => !gt.cleared && gt.baseY + g.scroll > -80 && gt.baseY + g.scroll < PLAYER_Y - 10,
    );
    if (near) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("← bewegen →", CW / 2, CH - 18);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MobControlGame() {
  const { t } = useTranslation(mobControlTranslations);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gsRef = useRef<GS>({
    phase: "start",
    soldiers: 10,
    level: 1,
    score: 0,
    scroll: 0,
    playerX: CW / 2,
    targetX: CW / 2,
    gates: [],
    enemies: [],
    barriers: [],
    bullets: [],
    weaponActive: false,
    currentBattleEnemy: null,
    flash: 0,
    flashMsg: "",
    flashGreen: true,
    battlePlayerVis: 0,
    battleEnemyVis: 0,
    battleAnimTimer: 0,
    battleFramesPerStep: 2,
    battleEnemyY: 0,
    battlePlayerSortedPos: [],
    battleEnemySortedPos: [],
    regroup: null,
    bulletCooldown: 0,
    raf: 0,
  });

  const [ui, setUi] = useState({
    phase: "start" as Phase,
    soldiers: 10,
    score: 0,
    level: 1,
  });

  const [highScore, setHighScore] = useState<number>(
    () => Number(localStorage.getItem(HIGH_SCORE_KEY) || "0"),
  );
  const [showTouchHint, setShowTouchHint] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);

  function syncUi() {
    const g = gsRef.current;
    setUi({ phase: g.phase, soldiers: g.soldiers, score: g.score, level: g.level });
  }

  // ── Game loop ───────────────────────────────────────────────────────────────
  const gameLoop = useCallback(() => {
    const g = gsRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (g.phase === "playing") {
      // Advance world
      g.scroll += SCROLL_SPEED;

      // Direct movement — no interpolation
      g.playerX = Math.max(DOT_R * 2, Math.min(CW - DOT_R * 2, g.targetX));

      // Countdown flash
      if (g.flash > 0) g.flash--;

      // Check gates — auto-apply based on player side
      let uiDirty = false;
      for (const gate of g.gates) {
        if (gate.cleared) continue;
        if (gate.baseY + g.scroll >= PLAYER_Y - GATE_H / 2) {
          const side: "left" | "right" = g.playerX < CW / 2 ? "left" : "right";
          const opt = side === "left" ? gate.left : gate.right;
          gate.cleared = true;

          if (opt.op === "🔫") {
            // Weapon gate: activate multi-shot, no soldier change
            g.weaponActive = true;
            g.flashMsg = "🔫 Alle schießen!";
            g.flashGreen = true;
          } else {
            const prev = g.soldiers;
            g.soldiers = applyOp(g.soldiers, opt);
            const delta = g.soldiers - prev;
            g.flashMsg = delta >= 0 ? `+${delta}` : `${delta}`;
            g.flashGreen = delta >= 0;
          }
          g.flash = FLASH_FRAMES;
          uiDirty = true;
        }
      }

      // Check enemies — trigger exactly when outer edges of both clusters touch
      for (const enemy of g.enemies) {
        if (enemy.cleared) continue;

        const playerDots = Math.min(g.soldiers, MAX_VISUAL_DOTS);
        const enemyDots  = Math.min(enemy.count, MAX_VISUAL_DOTS);
        // triggerY: enemy center Y when the two outer edges first meet
        const triggerY = PLAYER_Y - clusterRadius(playerDots) - clusterRadius(enemyDots);

        if (enemy.baseY + g.scroll >= triggerY) {
          g.currentBattleEnemy = enemy;

          // Pre-sort positions once: index 0 = dot facing the opponent (removed first)
          // Player: top-most (smallest Y) faces enemy above  → sort ascending Y
          // Enemy:  bottom-most (largest Y) faces player below → sort descending Y
          g.battlePlayerSortedPos = phyllotaxisPositions(playerDots)
            .sort(([, ay], [, by]) => ay - by);
          g.battleEnemySortedPos  = phyllotaxisPositions(enemyDots)
            .sort(([, ay], [, by]) => by - ay);

          // Position enemy at the exact contact point (no separate approach phase)
          g.battleEnemyY = triggerY;

          // Clash speed: ~90 frames regardless of troop count
          const steps = Math.max(1, Math.min(g.soldiers, enemy.count));
          g.battleFramesPerStep = Math.max(1, Math.round(90 / Math.min(steps, 60)));
          g.battleAnimTimer = g.battleFramesPerStep;

          g.battlePlayerVis = g.soldiers;
          g.battleEnemyVis  = enemy.count;

          g.phase = "battle-anim";
          uiDirty = true;
          break;
        }
      }

      if (uiDirty) syncUi();

      // ── Auto-fire: 1 shot/sec; spread volley when weapon gate is active ─────
      // Manual tap (onPointerDown → fireBullet) also fires in parallel.
      if (g.bulletCooldown > 0) {
        g.bulletCooldown--;
      } else {
        spawnBullets(g);
        g.bulletCooldown = AUTO_FIRE_INTERVAL;
      }

      // ── Advance bullets + collision checks ────────────────────────────────
      if (g.bullets.length > 0) {
        for (const b of g.bullets) b.y -= BULLET_SPEED;

        const bLeft  = CW / 2 - BARRIER_W / 2;
        const bRight = CW / 2 + BARRIER_W / 2;

        for (const b of g.bullets) {
          if (b.dead) continue;

          // vs enemies — reduce count before contact
          for (const enemy of g.enemies) {
            if (enemy.cleared || enemy.count === 0) continue;
            const esy = enemy.baseY + g.scroll;
            const r = clusterRadius(Math.min(enemy.count, MAX_VISUAL_DOTS));
            if (Math.abs(b.y - esy) < r + BULLET_R &&
                Math.abs(b.x - CW / 2) < r * 1.5 + BULLET_R) {
              enemy.count--;
              b.dead = true;
              if (enemy.count === 0) enemy.cleared = true;
              uiDirty = true;
              break;
            }
          }
          if (b.dead) continue;

          // vs barriers — reduce HP
          for (const bar of g.barriers) {
            if (bar.cleared) continue;
            const bsy = bar.baseY + g.scroll;
            if (Math.abs(b.y - bsy) < BARRIER_H / 2 + BULLET_R &&
                b.x >= bLeft && b.x <= bRight) {
              bar.hp--;
              b.dead = true;
              if (bar.hp <= 0) bar.cleared = true;
              break;
            }
          }
        }
        g.bullets = g.bullets.filter(b => !b.dead && b.y > -BULLET_R * 2);
      }

      // ── Barrier contact: blockade sweeps dots in its X range ──────────────
      for (const bar of g.barriers) {
        if (bar.cleared) continue;
        if (bar.baseY + g.scroll >= PLAYER_Y - BARRIER_H / 2) {
          if (bar.hp > 0) {
            const blL = CW / 2 - BARRIER_W / 2;
            const blR = CW / 2 + BARRIER_W / 2;
            const vis = Math.min(g.soldiers, MAX_VISUAL_DOTS);
            const positions = phyllotaxisPositions(vis);

            // Surviving = dots whose absolute X is outside the barrier's X range
            const surviving = positions.filter(([dx]) => {
              const ax = g.playerX + dx;
              return ax < blL || ax > blR;
            });

            const ratio = vis > 0 ? surviving.length / vis : 0;
            const prevSoldiers = g.soldiers;
            g.soldiers = Math.max(1, Math.ceil(g.soldiers * ratio));

            // Regroup: survivors animate from their current positions to new layout
            const newVis = Math.min(g.soldiers, MAX_VISUAL_DOTS);
            const fromPos: [number, number][] = Array.from({ length: newVis }, (_, i) =>
              i < surviving.length
                ? surviving[i]
                : [(Math.random() - 0.5) * clusterRadius(vis) * 2,
                   (Math.random() - 0.5) * clusterRadius(vis)] as [number, number]
            );
            g.regroup = { from: fromPos, t: 0 };

            const delta = g.soldiers - prevSoldiers;
            g.flashMsg = String(delta);
            g.flashGreen = false;
            g.flash = FLASH_FRAMES;
            uiDirty = true;
          }
          bar.cleared = true;
        }
      }

      // ── Advance regroup animation ─────────────────────────────────────────
      if (g.regroup) {
        g.regroup.t = Math.min(1, g.regroup.t + 1 / REGROUP_FRAMES);
        if (g.regroup.t >= 1) g.regroup = null;
      }

    } else if (g.phase === "battle-anim") {
      // Enemy "grinds" slowly toward player center while dots are removed
      g.battleEnemyY = Math.min(g.battleEnemyY + BATTLE_GRIND_SPEED, PLAYER_Y);

      // Dot removal: outermost facing dots first (pre-sorted positions)
      g.battleAnimTimer--;
      if (g.battleAnimTimer <= 0) {
        g.battleAnimTimer = g.battleFramesPerStep;
          if (g.battlePlayerVis > 0) g.battlePlayerVis--;
          if (g.battleEnemyVis > 0) g.battleEnemyVis--;

          if (g.battlePlayerVis === 0 || g.battleEnemyVis === 0) {
            const currentEnemy = g.currentBattleEnemy!;
            const win = g.soldiers > currentEnemy.count;
            g.soldiers = win ? Math.max(1, g.battlePlayerVis) : 0;
            g.phase = "battle";
            g.flashGreen = win;
            g.flash = FLASH_FRAMES;
            syncUi();

            if (win) {
              currentEnemy.cleared = true;
              const isBoss = currentEnemy.isBoss;
              g.flashMsg = isBoss ? "✔ Level klar!" : "✔ Sieg!";
              setTimeout(() => {
                const g2 = gsRef.current;
                cancelAnimationFrame(g2.raf);
                if (isBoss) {
                  g2.score += 1;
                  g2.level += 1;
                  g2.soldiers = Math.max(5, g2.soldiers);
                  const next = makeLevel(g2.level, g2.soldiers);
                  g2.gates = next.gates;
                  g2.enemies = next.enemies;
                  g2.barriers = next.barriers;
                  g2.weaponActive = false; // reset weapon for new level
                  g2.currentBattleEnemy = null;
                  g2.scroll = 0;
                  g2.flash = 0;
                  g2.phase = "playing";
                } else {
                  g2.currentBattleEnemy = null;
                  g2.flash = 0;
                  g2.phase = "playing";
                }
                syncUi();
                g2.raf = requestAnimationFrame(gameLoop);
              }, isBoss ? BATTLE_DELAY_MS : 600);
            } else {
              g.flashMsg = "✘ Niederlage";
              setTimeout(() => {
                const g2 = gsRef.current;
                g2.phase = "game-over";
                // Persist high score
                const prev = Number(localStorage.getItem(HIGH_SCORE_KEY) || "0");
                if (g2.score > prev) {
                  localStorage.setItem(HIGH_SCORE_KEY, String(g2.score));
                  setHighScore(g2.score);
                  setIsNewBest(true);
                } else {
                  setHighScore(prev);
                  setIsNewBest(false);
                }
                syncUi();
              }, BATTLE_DELAY_MS);
            }
          }
        }
    } else if (g.phase === "battle") {
      if (g.flash > 0) g.flash--;
    }

    drawScene(ctx, g);

    if (g.phase === "playing" || g.phase === "battle-anim" || g.phase === "battle") {
      g.raf = requestAnimationFrame(gameLoop);
    }
  }, []); // stable: reads only from refs

  // ── Mouse / touch / pointer tracking ────────────────────────────────────
  function updateTargetX(clientX: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * CW;
    gsRef.current.targetX = Math.max(0, Math.min(CW, cx));
  }

  /** Manual fire — works in parallel with auto-fire. Uses same spread logic. */
  function fireBullet(clientX: number) {
    const g = gsRef.current;
    if (g.phase !== "playing") return;
    updateTargetX(clientX);
    spawnBullets(g);
  }

  // ── Start / restart ──────────────────────────────────────────────────────
  function startGame() {
    const g = gsRef.current;
    cancelAnimationFrame(g.raf);

    const levelData = makeLevel(1, 15);
    Object.assign(g, {
      phase: "playing",
      soldiers: 15,
      level: 1,
      score: 0,
      playerX: CW / 2,
      targetX: CW / 2,
      flash: 0,
      flashMsg: "",
      bullets: [],
      bulletCooldown: 0,
      weaponActive: false,
      currentBattleEnemy: null,
      regroup: null,
      ...levelData,
    });

    setIsNewBest(false);

    // Show steering hint on first run
    if (!localStorage.getItem(HINT_SEEN_KEY)) {
      setShowTouchHint(true);
    }

    syncUi();
    g.raf = requestAnimationFrame(gameLoop);
  }

  // ── Canvas initial render ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#0b0b1a"; ctx.fillRect(0, 0, CW, CH); }
    return () => cancelAnimationFrame(gsRef.current.raf);
  }, []);

  const showOverlay = ui.phase === "start" || ui.phase === "game-over";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem",
        userSelect: "none",
      }}
    >
      {/* HUD */}
      {!showOverlay && (
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            background: "var(--bg-surface)",
            borderRadius: 10,
            padding: "0.3rem 1.1rem",
            fontSize: "0.85rem",
            minWidth: "min(100%, 400px)",
            justifyContent: "center",
          }}
        >
          <span>Level <strong>{ui.level}</strong></span>
          <span>🏆 <strong>{ui.score}</strong></span>
          <span>🪖 <strong>{ui.soldiers}</strong></span>
        </div>
      )}

      {/* Canvas wrapper — captures mouse/touch for steering */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: CW,
          aspectRatio: `${CW} / ${CH}`,
          cursor: ui.phase === "playing" ? "none" : "default",
          touchAction: "none",
        }}
        onPointerMove={(e) => updateTargetX(e.clientX)}
        onPointerDown={(e) => {
          e.preventDefault();
          if (showTouchHint) {
            setShowTouchHint(false);
            localStorage.setItem(HINT_SEEN_KEY, "1");
          }
          fireBullet(e.clientX);
        }}
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 12,
            display: "block",
            touchAction: "none",
          }}
        />

        {/* Start / Game-Over overlay */}
        {showOverlay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.2rem",
              background: "rgba(11,11,26,0.92)",
              borderRadius: 12,
            }}
          >
            {ui.phase === "start" ? (
              <>
                <div style={{ fontSize: "3rem" }}>⚔️</div>
                <h1 style={{ margin: 0, fontSize: "1.8rem" }}>{t("title")}</h1>
                <p style={{ color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: "75%", fontSize: "0.9rem" }}>
                  {t("subtitle")}
                </p>
                <p style={{ color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: "75%", fontSize: "0.85rem" }}>
                  {t("hint")}
                </p>
                <button
                  className="button button--primary"
                  onClick={startGame}
                  style={{ fontSize: "1.1rem", padding: "0.75rem 2.2rem" }}
                >
                  {t("start")}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2.5rem" }}>💀</div>
                <h2 style={{ margin: 0 }}>{t("gameOver")}</h2>
                <div style={{ background: "var(--bg-surface)", padding: "0.6rem 1.4rem", borderRadius: 10, textAlign: "center" }}>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8rem" }}>{t("finalScore")}</p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "2rem", fontWeight: "bold" }}>{ui.score}</p>
                </div>
                {isNewBest ? (
                  <p style={{ margin: 0, color: "#ffd700", fontWeight: "bold", fontSize: "1rem" }}>
                    {t("newBest")}
                  </p>
                ) : highScore > 0 ? (
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {t("bestScore")}: <strong style={{ color: "#fff" }}>{highScore}</strong>
                  </p>
                ) : null}
                <button
                  className="button button--primary"
                  onClick={startGame}
                  style={{ fontSize: "1rem", padding: "0.65rem 1.8rem" }}
                >
                  {t("playAgain")}
                </button>
              </>
            )}
          </div>
        )}

        {/* First-run touch hint — dismisses on first pointer event */}
        {showTouchHint && (
          <div
            style={{
              position: "absolute",
              bottom: "18%",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(11,11,26,0.88)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 10,
              padding: "0.55rem 1.1rem",
              color: "#ccc",
              fontSize: "0.9rem",
              pointerEvents: "none",
              textAlign: "center",
              whiteSpace: "nowrap",
              letterSpacing: "0.03em",
            }}
          >
            ← {t("steerHint")} →
          </div>
        )}
      </div>
    </div>
  );
}










































































