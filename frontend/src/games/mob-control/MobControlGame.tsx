/**
 * Mob Control — minimal arcade game.
 *
 * Pure frontend, no backend. Player controls a blob of soldiers (blue circle)
 * that passes through gate pairs (+, −, ×, ÷) and then battles a red enemy blob.
 * Gate choice: tap left or right half of the canvas.
 *
 * World model:
 *   scroll increases each frame.
 *   screenY(obj) = obj.baseY + scroll
 *   Objects start at negative baseY (above screen) and scroll downward.
 *   When screenY >= CHOICE_Y the game pauses and waits for player input.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslation } from "../../core/i18n";
import { mobControlTranslations } from "./translations";

// ── Canvas geometry ───────────────────────────────────────────────────────────
const CW = 400;
const CH = 620;
const PLAYER_X = CW / 2;
const PLAYER_Y = 520;
const CHOICE_Y = 350; // gate/enemy triggers choice when screenY >= CHOICE_Y
const BLOB_R = 32;

// ── Scrolling & animation ─────────────────────────────────────────────────────
const SCROLL_SPEED = 2.5; // px/frame
const GATE_SPACING = 185; // world pixels between consecutive gate rows
const FIRST_GATE_BASE_Y = -120; // first gate starts this far above screen
const ENEMY_EXTRA_GAP = 220; // extra gap between last gate and enemy
const FLASH_FRAMES = 28; // flash effect duration
const BATTLE_DELAY_MS = 1300; // ms before next level / game-over after battle

// ── Gate dimensions ───────────────────────────────────────────────────────────
const GATE_W = 114;
const GATE_H = 46;
const GATE_GAP = 12;

// ── Types ─────────────────────────────────────────────────────────────────────
type Op = "+" | "−" | "×" | "÷";
type Phase =
  | "start"
  | "scroll"
  | "choose"
  | "resolve"
  | "battle"
  | "game-over";

interface GateOpt {
  op: Op;
  val: number;
}

interface Gate {
  left: GateOpt;
  right: GateOpt;
  /** Y offset from canvas top when scroll=0 (negative = above screen). */
  baseY: number;
  cleared: boolean;
}

/** All mutable game state — lives in a ref, never triggers re-renders directly. */
interface GS {
  phase: Phase;
  soldiers: number;
  level: number;
  score: number;
  scroll: number;
  gates: Gate[];
  enemy: number;
  enemyBaseY: number;
  pendingGate: Gate | null;
  flash: number;
  flashMsg: string;
  flashGreen: boolean;
  raf: number;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function applyOp(n: number, opt: GateOpt): number {
  switch (opt.op) {
    case "+":
      return n + opt.val;
    case "−":
      return Math.max(1, n - opt.val);
    case "×":
      return n * opt.val;
    case "÷":
      return Math.max(1, Math.round(n / opt.val));
  }
}

function optLabel(opt: GateOpt): string {
  return `${opt.op}${opt.val}`;
}

function isPositiveOp(opt: GateOpt): boolean {
  return opt.op === "+" || opt.op === "×";
}

function makeSingleOpt(level: number): GateOpt {
  const r = Math.random();
  if (r < 0.38) {
    return { op: "+", val: 3 + Math.floor(Math.random() * (5 + level)) };
  } else if (r < 0.6) {
    return {
      op: "×",
      val: 2 + (level >= 3 ? Math.floor(Math.random() * 2) : 0),
    };
  } else if (r < 0.82) {
    return {
      op: "−",
      val: 1 + Math.floor(Math.random() * (2 + Math.floor(level * 0.6))),
    };
  } else {
    return { op: "÷", val: 2 + (level >= 5 ? 1 : 0) };
  }
}

function makeLevel(level: number, soldiers: number) {
  const gateCount = Math.min(2 + Math.floor(level / 2), 6);
  // Enemy scales with total potential after gates (rough estimate: assume +50% per gate path)
  const enemyTarget = Math.floor(soldiers * (1.4 + level * 0.25));
  const enemy =
    Math.max(5, enemyTarget) + Math.floor(Math.random() * (1 + level * 3));

  const gates: Gate[] = [];
  for (let i = 0; i < gateCount; i++) {
    const left = makeSingleOpt(level);
    const right = makeSingleOpt(level);
    gates.push({
      left,
      right,
      baseY: FIRST_GATE_BASE_Y - i * GATE_SPACING,
      cleared: false,
    });
  }

  const enemyBaseY =
    FIRST_GATE_BASE_Y - gateCount * GATE_SPACING - ENEMY_EXTRA_GAP;

  return { gates, enemy, enemyBaseY, scroll: 0 as const };
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  fill: string,
  glow: string,
) {
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(x, y, BLOB_R, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  const fontSize = n > 9999 ? 14 : n > 999 ? 16 : n > 99 ? 19 : 22;
  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  g: GS,
  highSide: "left" | "right" | null,
) {
  // Background
  ctx.fillStyle = "#0b0b1a";
  ctx.fillRect(0, 0, CW, CH);

  // Road strip
  const roadLeft = CW / 2 - 76;
  const roadRight = CW / 2 + 76;
  ctx.fillStyle = "#14142a";
  ctx.fillRect(roadLeft, 0, roadRight - roadLeft, CH);

  // Road edges
  ctx.strokeStyle = "#252545";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(roadLeft, 0);
  ctx.lineTo(roadLeft, CH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(roadRight, 0);
  ctx.lineTo(roadRight, CH);
  ctx.stroke();

  // Center dashes
  ctx.strokeStyle = "#222244";
  ctx.lineWidth = 1;
  ctx.setLineDash([14, 18]);
  ctx.beginPath();
  ctx.moveTo(CW / 2, 0);
  ctx.lineTo(CW / 2, CH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Gates
  for (const gate of g.gates) {
    if (gate.cleared) continue;
    const sy = gate.baseY + g.scroll;
    if (sy < -GATE_H - 10 || sy > CH + 10) continue;

    const lx = CW / 2 - GATE_GAP / 2 - GATE_W;
    const rx = CW / 2 + GATE_GAP / 2;
    const gy = sy - GATE_H / 2;

    const isPending = g.pendingGate === gate;
    const lHl = isPending && highSide === "left";
    const rHl = isPending && highSide === "right";

    // Left gate
    const lGood = isPositiveOp(gate.left);
    ctx.fillStyle = lHl
      ? "#1a4a2e"
      : lGood
        ? "#162838"
        : "#321622";
    drawRoundRect(ctx, lx, gy, GATE_W, GATE_H, 10);
    ctx.fill();
    ctx.strokeStyle = lHl ? "#44ffaa" : lGood ? "#3399cc" : "#cc3366";
    ctx.lineWidth = lHl ? 2.5 : 1.5;
    drawRoundRect(ctx, lx, gy, GATE_W, GATE_H, 10);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold 19px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(optLabel(gate.left), lx + GATE_W / 2, sy);

    // Right gate
    const rGood = isPositiveOp(gate.right);
    ctx.fillStyle = rHl
      ? "#1a4a2e"
      : rGood
        ? "#162838"
        : "#321622";
    drawRoundRect(ctx, rx, gy, GATE_W, GATE_H, 10);
    ctx.fill();
    ctx.strokeStyle = rHl ? "#44ffaa" : rGood ? "#3399cc" : "#cc3366";
    ctx.lineWidth = rHl ? 2.5 : 1.5;
    drawRoundRect(ctx, rx, gy, GATE_W, GATE_H, 10);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold 19px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(optLabel(gate.right), rx + GATE_W / 2, sy);
  }

  // Enemy blob
  const esy = g.enemyBaseY + g.scroll;
  if (esy > -BLOB_R * 2 && esy < CH + BLOB_R) {
    drawBlob(ctx, PLAYER_X, esy, g.enemy, "#cc2233", "#ff4466");
  }

  // Player blob
  drawBlob(ctx, PLAYER_X, PLAYER_Y, g.soldiers, "#2255dd", "#4477ff");

  // Flash overlay
  if (g.flash > 0) {
    const alpha = (g.flash / FLASH_FRAMES) * 0.35;
    ctx.fillStyle = g.flashGreen
      ? `rgba(0,200,80,${alpha})`
      : `rgba(200,30,50,${alpha})`;
    ctx.fillRect(0, 0, CW, CH);

    if (g.flashMsg) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(g.flashMsg, CW / 2, PLAYER_Y - BLOB_R - 24);
    }
  }

  // Choose hint: arrow indicators
  if (g.phase === "choose") {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◀ links", CW / 4, CH - 20);
    ctx.fillText("rechts ▶", (CW * 3) / 4, CH - 20);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MobControlGame() {
  const { t } = useTranslation(mobControlTranslations);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightRef = useRef<"left" | "right" | null>(null);

  const gsRef = useRef<GS>({
    phase: "start",
    soldiers: 10,
    level: 1,
    score: 0,
    scroll: 0,
    gates: [],
    enemy: 0,
    enemyBaseY: 0,
    pendingGate: null,
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

    if (g.phase === "scroll") {
      g.scroll += SCROLL_SPEED;

      // Check gates
      for (const gate of g.gates) {
        if (gate.cleared) continue;
        if (gate.baseY + g.scroll >= CHOICE_Y) {
          g.phase = "choose";
          g.pendingGate = gate;
          syncUi();
          break;
        }
      }

      // Check enemy (only if no gate triggered)
      if (g.phase === "scroll" && g.enemyBaseY + g.scroll >= CHOICE_Y) {
        const win = g.soldiers > g.enemy;
        g.phase = "battle";
        g.flash = FLASH_FRAMES;
        g.flashGreen = win;
        g.flashMsg = win ? "✔ Sieg!" : "✘ Niederlage";
        syncUi();

        setTimeout(() => {
          const g2 = gsRef.current;
          if (win) {
            g2.score += 1;
            g2.level += 1;
            // Survivors advance to next level
            g2.soldiers = Math.max(5, g2.soldiers - Math.floor(g2.enemy * 0.6));
            const next = makeLevel(g2.level, g2.soldiers);
            g2.gates = next.gates;
            g2.enemy = next.enemy;
            g2.enemyBaseY = next.enemyBaseY;
            g2.scroll = 0;
            g2.pendingGate = null;
            g2.flash = 0;
            g2.phase = "scroll";
          } else {
            g2.phase = "game-over";
          }
          syncUi();
          if (g2.phase === "scroll") {
            g2.raf = requestAnimationFrame(gameLoop);
          }
        }, BATTLE_DELAY_MS);
      }
    } else if (g.phase === "resolve") {
      g.scroll += SCROLL_SPEED * 0.5;
      g.flash = Math.max(0, g.flash - 1);
      if (g.flash === 0) {
        g.phase = "scroll";
        g.pendingGate = null;
        highlightRef.current = null;
        syncUi();
      }
    } else if (g.phase === "battle") {
      g.flash = Math.max(0, g.flash - 1);
    }

    drawScene(ctx, g, highlightRef.current);

    if (g.phase !== "game-over" && g.phase !== "start" && g.phase !== "battle") {
      g.raf = requestAnimationFrame(gameLoop);
    }
  }, []); // stable: reads only from refs

  // ── Start / restart ─────────────────────────────────────────────────────────
  function startGame() {
    const g = gsRef.current;
    cancelAnimationFrame(g.raf);

    const level = 1;
    const soldiers = 10;
    const levelData = makeLevel(level, soldiers);

    g.phase = "scroll";
    g.soldiers = soldiers;
    g.level = level;
    g.score = 0;
    g.gates = levelData.gates;
    g.enemy = levelData.enemy;
    g.enemyBaseY = levelData.enemyBaseY;
    g.scroll = 0;
    g.pendingGate = null;
    g.flash = 0;
    g.flashMsg = "";
    highlightRef.current = null;

    syncUi();
    g.raf = requestAnimationFrame(gameLoop);
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function handleInput(clientX: number) {
    const g = gsRef.current;
    if (g.phase !== "choose" || !g.pendingGate) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * CW;
    const side: "left" | "right" = cx < CW / 2 ? "left" : "right";
    const opt = side === "left" ? g.pendingGate.left : g.pendingGate.right;

    const prev = g.soldiers;
    g.soldiers = applyOp(g.soldiers, opt);
    g.pendingGate.cleared = true;

    const delta = g.soldiers - prev;
    highlightRef.current = side;
    g.flashMsg = delta >= 0 ? `+${delta}` : `${delta}`;
    g.flashGreen = delta >= 0;
    g.flash = FLASH_FRAMES;
    g.phase = "resolve";

    syncUi();
    cancelAnimationFrame(g.raf);
    g.raf = requestAnimationFrame(gameLoop);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0b0b1a";
      ctx.fillRect(0, 0, CW, CH);
    }
    return () => cancelAnimationFrame(gsRef.current.raf);
  }, []);

  const isChoosing = ui.phase === "choose";
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
      {/* HUD — only during active game */}
      {ui.phase !== "start" && ui.phase !== "game-over" && (
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
          <span>
            Level <strong>{ui.level}</strong>
          </span>
          <span>
            🏆 <strong>{ui.score}</strong>
          </span>
          <span>
            🪖 <strong>{ui.soldiers}</strong>
          </span>
        </div>
      )}

      {/* Canvas wrapper */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: CW,
          aspectRatio: `${CW} / ${CH}`,
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
            cursor: isChoosing ? "pointer" : "default",
          }}
          onClick={(e) => handleInput(e.clientX)}
          onTouchStart={(e) => {
            e.preventDefault();
            handleInput(e.touches[0].clientX);
          }}
        />

        {/* Overlay: start or game-over */}
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
                <p
                  style={{
                    color: "var(--text-muted)",
                    margin: 0,
                    textAlign: "center",
                    maxWidth: "80%",
                    fontSize: "0.9rem",
                  }}
                >
                  {t("subtitle")}
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
                <div
                  style={{
                    background: "var(--bg-surface)",
                    padding: "0.6rem 1.4rem",
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {t("finalScore")}
                  </p>
                  <p
                    style={{
                      margin: "0.2rem 0 0",
                      fontSize: "2rem",
                      fontWeight: "bold",
                    }}
                  >
                    {ui.score}
                  </p>
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

