/**
 * PlayerProfile — Shows extended player stats + recent session history.
 *
 * Fetches data from GET /api/v1/quiz/players/{id}/profile
 * Displays: name, ELO, games played, accuracy, recent sessions.
 */

import { useState, useEffect } from "react";

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

const MODE_LABELS: Record<string, string> = {
  millionaire: "Millionär",
  duel: "Quizduell 1v1",
  speed: "Speed-Modus",
};

export default function PlayerProfile({
  playerId,
  onBack,
}: {
  playerId: string;
  onBack: () => void;
}) {
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
        <p className="leaderboard__status">Lade Profil...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="quiz-container">
        <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          ← Zurück
        </button>
        <p className="alert-text">{error || "Spieler nicht gefunden"}</p>
      </div>
    );
  }

  const accuracyPct = Math.round(profile.accuracy * 100);

  return (
    <div className="quiz-container">
      <div className="player-profile">
        <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>
          ← Zurück
        </button>

        <h1 className="player-profile__name">👤 {profile.name}</h1>

        <div className="player-profile__stats">
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{Math.round(profile.elo_score)}</span>
            <span className="player-profile__stat-label">ELO</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{profile.games_played}</span>
            <span className="player-profile__stat-label">Spiele</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{profile.correct_count}</span>
            <span className="player-profile__stat-label">Richtig</span>
          </div>
          <div className="player-profile__stat">
            <span className="player-profile__stat-value">{accuracyPct}%</span>
            <span className="player-profile__stat-label">Trefferquote</span>
          </div>
        </div>

        <h2 className="player-profile__section-title">Letzte Spiele</h2>

        {profile.recent_sessions.length === 0 ? (
          <p className="leaderboard__status">Noch keine Spiele absolviert.</p>
        ) : (
          <div className="player-profile__sessions">
            {profile.recent_sessions.map((s) => (
              <div key={s.id} className="player-profile__session-row">
                <span className="player-profile__session-mode">
                  {MODE_LABELS[s.mode] || s.mode}
                </span>
                <span className="player-profile__session-score">
                  {s.score} Punkte
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

