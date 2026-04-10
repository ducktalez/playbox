/**
 * Leaderboard — Shows top quiz players ranked by ELO.
 *
 * Fetches data from GET /api/v1/quiz/leaderboard and displays
 * a ranked list with name, ELO, games played, and correct count.
 */

import { useState, useEffect } from "react";
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { quizTranslations } from "./translations";

const translations = mergeTranslations(coreTranslations, quizTranslations);

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
  const { t } = useTranslation(translations);
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
        if (!ignore) setError(e instanceof Error ? e.message : t("elo.loadError"));
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
          {t("back")}
        </button>
        <h1 className="leaderboard__title">{t("lb.title")}</h1>
        <p className="leaderboard__subtitle">{t("lb.subtitle")}</p>

        {loading && <p className="leaderboard__status">{t("lb.loading")}</p>}
        {error && <p className="alert-text">{error}</p>}

        {!loading && entries.length === 0 && !error && (
          <p className="leaderboard__status">{t("lb.empty")}</p>
        )}

        {entries.length > 0 && (
          <div className="leaderboard__table">
            <div className="leaderboard__header">
              <span className="leaderboard__col leaderboard__col--rank">#</span>
              <span className="leaderboard__col leaderboard__col--name">{t("lb.colName")}</span>
              <span className="leaderboard__col leaderboard__col--elo">{t("lb.colElo")}</span>
              <span className="leaderboard__col leaderboard__col--games">{t("lb.colGames")}</span>
              <span className="leaderboard__col leaderboard__col--correct">{t("lb.colCorrect")}</span>
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
                  <span className="leaderboard__col leaderboard__col--correct" title={t("lb.accuracy", { pct: accuracy })}>
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
