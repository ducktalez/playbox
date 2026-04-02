/**
 * EloChart — Lightweight SVG line chart showing ELO progression.
 *
 * Fetches data from GET /api/v1/quiz/players/{id}/elo-history
 * and renders a responsive SVG chart (no external charting library).
 * Mobile-optimized with touch-friendly tap areas.
 */

import { useState, useEffect, useMemo } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type EloHistoryEntry = {
  id: string;
  question_id: string;
  session_id: string | null;
  elo_before: number;
  elo_after: number;
  answered_correctly: boolean;
  created_at: string;
};

// Chart dimensions (viewBox-based — scales responsively)
const W = 400;
const H = 200;
const PAD_LEFT = 45;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

export default function EloChart({ playerId }: { playerId: string }) {
  const [entries, setEntries] = useState<EloHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch(
          `${API_BASE}/players/${playerId}/elo-history?limit=100`
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data: EloHistoryEntry[] = await res.json();
        if (!ignore) setEntries(data);
      } catch (e) {
        if (!ignore)
          setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [playerId]);

  // Build data points: start with elo_before of first entry, then elo_after for each
  const points = useMemo(() => {
    if (entries.length === 0) return [];
    const pts: { elo: number; correct: boolean | null; label: string }[] = [];
    // Starting point
    pts.push({
      elo: entries[0].elo_before,
      correct: null,
      label: "Start",
    });
    for (const e of entries) {
      const date = new Date(e.created_at);
      const timeStr = date.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      pts.push({
        elo: e.elo_after,
        correct: e.answered_correctly,
        label: `${timeStr} — ${e.answered_correctly ? "✓" : "✗"} → ${Math.round(e.elo_after)}`,
      });
    }
    return pts;
  }, [entries]);

  if (loading) {
    return <p className="elo-chart__status">Lade ELO-Verlauf...</p>;
  }

  if (error) {
    return <p className="elo-chart__status elo-chart__error">{error}</p>;
  }

  if (points.length < 2) {
    return (
      <p className="elo-chart__status">
        Noch nicht genug Daten für den ELO-Verlauf.
      </p>
    );
  }

  // Scale computation
  const elos = points.map((p) => p.elo);
  const minElo = Math.floor(Math.min(...elos) / 10) * 10 - 10;
  const maxElo = Math.ceil(Math.max(...elos) / 10) * 10 + 10;
  const eloRange = maxElo - minElo || 1;

  const toX = (i: number) =>
    PAD_LEFT + (i / (points.length - 1)) * CHART_W;
  const toY = (elo: number) =>
    PAD_TOP + CHART_H - ((elo - minElo) / eloRange) * CHART_H;

  // SVG path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.elo).toFixed(1)}`)
    .join(" ");

  // Gradient area path (filled below the line)
  const areaPath =
    linePath +
    ` L${toX(points.length - 1).toFixed(1)},${(PAD_TOP + CHART_H).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${(PAD_TOP + CHART_H).toFixed(1)} Z`;

  // Y-axis labels (5 ticks)
  const yTicks: number[] = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(Math.round(minElo + (eloRange * i) / tickCount));
  }

  // Reference line at 1200 (base ELO)
  const baseY = toY(1200);
  const showBaseLine = minElo < 1200 && maxElo > 1200;

  return (
    <div className="elo-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="elo-chart__svg"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHoveredIdx(null)}
        onTouchEnd={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              y1={toY(tick)}
              x2={W - PAD_RIGHT}
              y2={toY(tick)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
            <text
              x={PAD_LEFT - 6}
              y={toY(tick) + 3.5}
              textAnchor="end"
              className="elo-chart__tick-label"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Base ELO reference line */}
        {showBaseLine && (
          <line
            x1={PAD_LEFT}
            y1={baseY}
            x2={W - PAD_RIGHT}
            y2={baseY}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.8"
            strokeDasharray="4 3"
          />
        )}

        {/* Filled area */}
        <path d={areaPath} fill="url(#eloGrad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            {/* Invisible larger hit area for touch */}
            <circle
              cx={toX(i)}
              cy={toY(p.elo)}
              r={12}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              onTouchStart={() => setHoveredIdx(i)}
              style={{ cursor: "pointer" }}
            />
            <circle
              cx={toX(i)}
              cy={toY(p.elo)}
              r={hoveredIdx === i ? 4.5 : 3}
              fill={
                p.correct === null
                  ? "var(--text-muted)"
                  : p.correct
                    ? "#4caf50"
                    : "#f44336"
              }
              stroke="var(--bg-surface)"
              strokeWidth="1.5"
              style={{ transition: "r 0.15s ease" }}
            />
          </g>
        ))}

        {/* Tooltip */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <g>
            <rect
              x={Math.min(toX(hoveredIdx) - 60, W - PAD_RIGHT - 120)}
              y={toY(points[hoveredIdx].elo) - 24}
              width="120"
              height="18"
              rx="4"
              fill="var(--bg-elevated)"
              stroke="var(--accent)"
              strokeWidth="0.5"
              opacity="0.95"
            />
            <text
              x={Math.min(toX(hoveredIdx), W - PAD_RIGHT - 60)}
              y={toY(points[hoveredIdx].elo) - 12}
              textAnchor="middle"
              className="elo-chart__tooltip-text"
            >
              {points[hoveredIdx].label}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="elo-chart__legend">
        <span className="elo-chart__legend-item">
          <span className="elo-chart__dot elo-chart__dot--correct" /> Richtig
        </span>
        <span className="elo-chart__legend-item">
          <span className="elo-chart__dot elo-chart__dot--wrong" /> Falsch
        </span>
        <span className="elo-chart__legend-item">
          <span className="elo-chart__dot elo-chart__dot--start" /> Start
        </span>
      </div>
    </div>
  );
}

