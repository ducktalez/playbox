/**
 * PlayerProfile — Shows extended player stats + recent session history.
 *
 * Fetches data from GET /api/v1/quiz/players/{id}/profile
 * Displays: name, ELO, games played, accuracy, recent sessions.
 */

import { useState, useEffect } from "react";
import EloChart from "./EloChart";
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { quizTranslations } from "./translations";

const translations = mergeTranslations(coreTranslations, quizTranslations);

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type SessionEntry = {
  id: string;
  mode: string;
  score: number;
  finished_at: string | null;
};

type ProfileData = {
  id: string;
  name: string;
  elo_score: number;
  games_played: number;
  correct_count: number;
  accuracy: number;
  recent_sessions: SessionEntry[];
};

export default function PlayerProfile({
  playerId,
  onBack,
}: {
  playerId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation(translations);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/players/${playerId}/profile`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data: ProfileData = await res.json();
        if (!ignore) setProfile(data);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : "Fehler beim Laden");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => { ignore = true; };
  }, [playerId]);

  if (loading) {
    return (
      <div className="quiz-container">
        <p className="leaderboard__status">{t("profile.loading")}</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="quiz-container">
        <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          {t("back")}
        </button>
        <p className="alert-text">{error || t("profile.notFound")}</p>
      </div>
    );
  }

  const accuracyPct = Math.round(profile.accuracy * 100);

  return (
    <div className="quiz-container">
      <div className="player-profile">
        <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          {t("back")}
        </button>

        <h1 className="player-profile__name">👤 {profile.name}</h1>

        <div className="player-profile__stats">
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{Math.round(profile.elo_score)}</span>
            <span className="player-profile__stat-label">{t("profile.elo")}</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{profile.games_played}</span>
            <span className="player-profile__stat-label">{t("profile.games")}</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{profile.correct_count}</span>
            <span className="player-profile__stat-label">{t("profile.correct")}</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{accuracyPct}%</span>
            <span className="player-profile__stat-label">{t("profile.accuracy")}</span>
          </div>
        </div>

        <h2 className="player-profile__section-title">{t("profile.eloHistory")}</h2>
        <EloChart playerId={playerId} />

        <h2 className="player-profile__section-title">{t("profile.recentGames")}</h2>

        {profile.recent_sessions.length === 0 ? (
          <p className="leaderboard__status">{t("profile.noGames")}</p>
        ) : (
          <div className="player-profile__sessions">
            {profile.recent_sessions.map((s) => (
              <div key={s.id} className="player-profile__session-row">
                <span className="player-profile__session-mode">
                  {t(`profile.mode${s.mode.charAt(0).toUpperCase() + s.mode.slice(1)}`) || s.mode}
                </span>
                <span className="player-profile__session-score">
                  {t("profile.points", { n: s.score })}
                </span>
                <span className="player-profile__session-status">
                  {s.finished_at ? "✅" : "⏳"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

