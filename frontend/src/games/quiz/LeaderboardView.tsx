/**
 * Leaderboard — Shows top quiz players ranked by ELO.
 *
 * Fetches data from GET /api/v1/quiz/leaderboard and displays
 * a ranked list with name, ELO, games played, and correct count.
 */

import { useState, useEffect } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type LeaderboardEntry = {
  rank: number;
  player_id: string;
  name: string;
  elo_score: number;
  games_played: number;
  correct_count: number;
};

export default function LeaderboardView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/leaderboard?limit=20`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data: LeaderboardEntry[] = await res.json();
        if (!ignore) setEntries(data);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => { ignore = true; };
  }, []);

  return (
    <div className="quiz-container">
      <div className="leaderboard">
        <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          ← Zurück
        </button>
        <h1 className="leaderboard__title">🏆 Leaderboard</h1>
        <p className="leaderboard__subtitle">Top-Spieler nach ELO-Rating</p>

        {loading && <p className="leaderboard__status">Lade Leaderboard...</p>}
        {error && <p className="alert-text">{error}</p>}

        {!loading && entries.length === 0 && !error && (
          <p className="leaderboard__status">Noch keine Spieler vorhanden.</p>
        )}

        {entries.length > 0 && (
          <div className="leaderboard__table">
            <div className="leaderboard__header">
              <span className="leaderboard__col leaderboard__col--rank">#</span>
              <span className="leaderboard__col leaderboard__col--name">Name</span>
              <span className="leaderboard__col leaderboard__col--elo">ELO</span>
              <span className="leaderboard__col leaderboard__col--games">Spiele</span>
              <span className="leaderboard__col leaderboard__col--correct">Richtig</span>
            </div>
            {entries.map((entry) => {
              const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "";
              const accuracy = entry.games_played > 0
                ? Math.round((entry.correct_count / Math.max(entry.games_played, 1)) * 100)
                : 0;

              return (
                <div
                  key={entry.player_id}
                  className={`leaderboard__row ${entry.rank <= 3 ? "leaderboard__row--top" : ""}`}
                >
                  <span className="leaderboard__col leaderboard__col--rank">
                    {medal || entry.rank}
                  </span>
                  <span className="leaderboard__col leaderboard__col--name">
                    {entry.name}
                  </span>
                  <span className="leaderboard__col leaderboard__col--elo">
                    {Math.round(entry.elo_score)}
                  </span>
                  <span className="leaderboard__col leaderboard__col--games">
                    {entry.games_played}
                  </span>
                  <span className="leaderboard__col leaderboard__col--correct" title={`${accuracy}% Trefferquote`}>
                    {entry.correct_count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

