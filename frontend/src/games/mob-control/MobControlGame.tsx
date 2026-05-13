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
const PLAY_SPEED = 1.1; // px/frame — normal gameplay
// const TEST_SPEED = 4.0; // px/frame — fast testing
const SCROLL_SPEED = PLAY_SPEED;

const PLAYER_LERP = 0.10; // horizontal smoothing (0=no movement, 1=instant)

// ── Level layout ──────────────────────────────────────────────────────────────
const FIRST_GATE_BASE_Y = -130; // first gate starts above screen
const GATE_SPACING = 220; // world-px between consecutive gates (player reaction time)
const ENEMY_EXTRA_GAP = 280; // extra gap after last gate before enemy

// ── Gate dimensions ───────────────────────────────────────────────────────────
const GATE_H = 54; // height of the gate band

// ── Dot cluster rendering ─────────────────────────────────────────────────────
const DOT_R = 5; // radius of each soldier dot
const MAX_VISUAL_DOTS = 30; // cap dots for performance / readability
const FLASH_FRAMES = 30;
const BATTLE_DELAY_MS = 1400;

// ── Types ─────────────────────────────────────────────────────────────────────
type Op = "+" | "−" | "×" | "÷";
type Phase = "start" | "playing" | "battle" | "game-over";

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

/** Mutable game state stored in a ref — never causes React re-renders on its own. */
interface GS {
  phase: Phase;
  soldiers: number;
  level: number;
  score: number;
  scroll: number;
  playerX: number; // current (lerped) horizontal position
  targetX: number; // mouse/touch target
  gates: Gate[];
  enemy: number;
  enemyBaseY: number;
  flash: number;
  flashMsg: string;
  flashGreen: boolean;
  raf: number;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function applyOp(n: number, opt: GateOpt): number {
  switch (opt.op) {
    case "+": return n + opt.val;
    case "−": return Math.max(1, n - opt.val);
    case "×": return n * opt.val;
    case "÷": return Math.max(1, Math.round(n / opt.val));
  }
}

function optLabel(opt: GateOpt): string {
  return `${opt.op}${opt.val}`;
}

function isPositiveOp(opt: GateOpt): boolean {
  return opt.op === "+" || opt.op === "×";
}

// ── Level generation ──────────────────────────────────────────────────────────

function makeOpt(level: number): GateOpt {
  const r = Math.random();
  if (r < 0.38) return { op: "+", val: 3 + Math.floor(Math.random() * (5 + level)) };
  if (r < 0.60) return { op: "×", val: 2 + (level >= 3 ? Math.floor(Math.random() * 2) : 0) };
  if (r < 0.82) return { op: "−", val: 1 + Math.floor(Math.random() * (2 + Math.floor(level * 0.6))) };
  return { op: "÷", val: 2 + (level >= 5 ? 1 : 0) };
}

function makeLevel(level: number, soldiers: number) {
  const gateCount = Math.min(2 + Math.floor(level / 2), 6);
  const enemyTarget = Math.floor(soldiers * (1.4 + level * 0.25));
  const enemy = Math.max(5, enemyTarget) + Math.floor(Math.random() * (1 + level * 3));

  const gates: Gate[] = [];
  for (let i = 0; i < gateCount; i++) {
    gates.push({
      left: makeOpt(level),
      right: makeOpt(level),
      baseY: FIRST_GATE_BASE_Y - i * GATE_SPACING,
      cleared: false,
    });
  }

  const enemyBaseY = FIRST_GATE_BASE_Y - gateCount * GATE_SPACING - ENEMY_EXTRA_GAP;
  return { gates, enemy, enemyBaseY, scroll: 0 as const };
}

// ── Dot cluster helpers ───────────────────────────────────────────────────────

/**
 * Phyllotaxis (golden-angle spiral) layout — gives a natural "crowd" look.
 * Returns up to n positions, stable across frames (deterministic for same n).
 */
function phyllotaxisPositions(n: number): [number, number][] {
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle ≈ 137.5°
  const spread = 9 + Math.sqrt(n) * 4.5;    // cluster radius grows with count
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = spread * Math.sqrt((i + 0.5) / n);
    const theta = i * phi;
    result.push([r * Math.cos(theta), r * Math.sin(theta)]);
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

  // Count label below the cluster
  const r = clusterRadius(vis);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(count), cx, cy + r + 5);
}

// ── Scene drawing ─────────────────────────────────────────────────────────────

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

      // Label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(optLabel(opt), x + w / 2, sy);
    }
  }

  // ── Enemy cluster ─────────────────────────────────────────────────────────
  const esy = g.enemyBaseY + g.scroll;
  if (esy > -80 && esy < CH + 40) {
    drawDotCluster(ctx, CW / 2, esy, g.enemy, "#cc2233", "#ff4466");
  }

  // ── Player cluster ────────────────────────────────────────────────────────
  drawDotCluster(ctx, g.playerX, PLAYER_Y, g.soldiers, "#2255dd", "#3366ff");

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
    enemy: 0,
    enemyBaseY: 0,
    flash: 0,
    flashMsg: "",
    flashGreen: true,
    raf: 0,
  });

  const [ui, setUi] = useState({
    phase: "start" as Phase,
    soldiers: 10,
    score: 0,
    level: 1,
  });

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

      // Smooth player toward mouse/touch target
      g.playerX += (g.targetX - g.playerX) * PLAYER_LERP;
      g.playerX = Math.max(DOT_R * 2, Math.min(CW - DOT_R * 2, g.playerX));

      // Countdown flash
      if (g.flash > 0) g.flash--;

      // Check gates — auto-apply based on player side
      let uiDirty = false;
      for (const gate of g.gates) {
        if (gate.cleared) continue;
        if (gate.baseY + g.scroll >= PLAYER_Y - GATE_H / 2) {
          const side: "left" | "right" = g.playerX < CW / 2 ? "left" : "right";
          const opt = side === "left" ? gate.left : gate.right;
          const prev = g.soldiers;
          g.soldiers = applyOp(g.soldiers, opt);
          gate.cleared = true;

          const delta = g.soldiers - prev;
          g.flashMsg = delta >= 0 ? `+${delta}` : `${delta}`;
          g.flashGreen = delta >= 0;
          g.flash = FLASH_FRAMES;
          uiDirty = true;
        }
      }

      // Check enemy
      if (g.enemyBaseY + g.scroll >= PLAYER_Y - GATE_H / 2) {
        const win = g.soldiers > g.enemy;
        g.phase = "battle";
        g.flashMsg = win ? "✔ Sieg!" : "✘ Niederlage";
        g.flashGreen = win;
        g.flash = FLASH_FRAMES * 2;
        uiDirty = true;

        setTimeout(() => {
          const g2 = gsRef.current;
          if (win) {
            g2.score += 1;
            g2.level += 1;
            g2.soldiers = Math.max(5, g2.soldiers - Math.floor(g2.enemy * 0.6));
            const next = makeLevel(g2.level, g2.soldiers);
            g2.gates = next.gates;
            g2.enemy = next.enemy;
            g2.enemyBaseY = next.enemyBaseY;
            g2.scroll = 0;
            g2.flash = 0;
            g2.phase = "playing";
          } else {
            g2.phase = "game-over";
          }
          syncUi();
          if (g2.phase === "playing") {
            g2.raf = requestAnimationFrame(gameLoop);
          }
        }, BATTLE_DELAY_MS);
      }

      if (uiDirty) syncUi();
    } else if (g.phase === "battle") {
      if (g.flash > 0) g.flash--;
    }

    drawScene(ctx, g);

    if (g.phase === "playing" || g.phase === "battle") {
      g.raf = requestAnimationFrame(gameLoop);
    }
  }, []); // stable: reads only from refs

  // ── Mouse / touch tracking ────────────────────────────────────────────────
  function updateTargetX(clientX: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * CW;
    gsRef.current.targetX = Math.max(0, Math.min(CW, cx));
  }

  // ── Start / restart ──────────────────────────────────────────────────────
  function startGame() {
    const g = gsRef.current;
    cancelAnimationFrame(g.raf);

    const levelData = makeLevel(1, 10);
    Object.assign(g, {
      phase: "playing",
      soldiers: 10,
      level: 1,
      score: 0,
      playerX: CW / 2,
      targetX: CW / 2,
      flash: 0,
      flashMsg: "",
      ...levelData,
    });

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
        }}
        onMouseMove={(e) => updateTargetX(e.clientX)}
        onTouchMove={(e) => { e.preventDefault(); updateTargetX(e.touches[0].clientX); }}
        onTouchStart={(e) => { e.preventDefault(); updateTargetX(e.touches[0].clientX); }}
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
      </div>
    </div>
  );
}

