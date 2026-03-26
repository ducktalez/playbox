/**
 * Quizduell 1v1 — Local pass-and-play duel mode.
 *
 * Two players alternate answering 10 questions on the same device.
 * Odd questions → Player 1, even questions → Player 2.
 * Winner = most correct answers. Ties are drawn.
 */

import { useState, useCallback } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;
const TOTAL_QUESTIONS = 10;

type PlayerOut = { id: string; name: string; elo_score: number };
type SessionOut = { id: string; mode: string; player_id: string; score: number };
type QuestionOut = {
  id: string; text: string; category: string; elo_score: number;
  answers: { id: string; text: string }[];
};
type AttemptOut = {
  correct: boolean; correct_answer_id: string; note: string | null;
  player_elo_before: number; player_elo_after: number;
  question_elo_before: number; question_elo_after: number;
};

type DuelStep = "names" | "handover" | "playing" | "result";

export default function DuelGame({ onBack }: { onBack: () => void }) {
  // Player setup
  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");

  // Game state
  const [duelStep, setDuelStep] = useState<DuelStep>("names");
  const [players, setPlayers] = useState<[PlayerOut, PlayerOut] | null>(null);
  const [sessions, setSessions] = useState<[SessionOut, SessionOut] | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionOut | null>(null);
  const [attempt, setAttempt] = useState<AttemptOut | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [slideKey, setSlideKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // Current player: odd question index (0,2,4,...) = Player 1, even (1,3,5,...) = Player 2
  const activePlayerIdx = currentIdx % 2;
  const activePlayer = players?.[activePlayerIdx] ?? null;
  const activeSession = sessions?.[activePlayerIdx] ?? null;
  const activeName = activePlayer?.name ?? `Spieler ${activePlayerIdx + 1}`;

  // --- Initialize game ---
  const initGame = async () => {
    const name1 = player1Name.trim() || "Spieler 1";
    const name2 = player2Name.trim() || "Spieler 2";

    setLoading(true);
    try {
      // Create two players
      const [p1Res, p2Res] = await Promise.all([
        fetch(`${API_BASE}/players`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name1 }),
        }),
        fetch(`${API_BASE}/players`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name2 }),
        }),
      ]);
      if (!p1Res.ok || !p2Res.ok) throw new Error("Player creation failed");
      const p1: PlayerOut = await p1Res.json();
      const p2: PlayerOut = await p2Res.json();
      setPlayers([p1, p2]);

      // Create two sessions
      const [s1Res, s2Res] = await Promise.all([
        fetch(`${API_BASE}/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "duel", player_id: p1.id }),
        }),
        fetch(`${API_BASE}/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "duel", player_id: p2.id }),
        }),
      ]);
      if (!s1Res.ok || !s2Res.ok) throw new Error("Session creation failed");
      setSessions([await s1Res.json(), await s2Res.json()]);

      // Fetch questions
      const qRes = await fetch(`${API_BASE}/questions?balanced_categories=true&limit=${TOTAL_QUESTIONS}`);
      if (!qRes.ok) throw new Error("Question fetch failed");
      const qData = await qRes.json();
      const ids = qData.items.map((q: { id: string }) => q.id);
      if (ids.length === 0) { alert("Keine Fragen vorhanden!"); onBack(); return; }

      setQuestionIds(ids);
      setScores([0, 0]);
      setCurrentIdx(0);
      setDuelStep("handover");
    } catch (e) {
      alert(`Fehler: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Load question ---
  const loadQuestion = async (id: string) => {
    setSelectedAnswer(null);
    setAttempt(null);
    setSlideKey((k) => k + 1);
    const res = await fetch(`${API_BASE}/questions/${id}?num_answers=4`);
    if (res.ok) setCurrentQuestion(await res.json());
  };

  // --- Submit answer ---
  const submitAnswer = useCallback(
    async (answerId: string) => {
      if (selectedAnswer || !currentQuestion || !activePlayer || !activeSession) return;
      setSelectedAnswer(answerId);

      try {
        const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/attempt`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer_id: answerId, player_id: activePlayer.id, session_id: activeSession.id,
          }),
        });
        if (!res.ok) return;
        const att: AttemptOut = await res.json();
        setAttempt(att);

        if (att.correct) {
          setScores((prev) => {
            const next: [number, number] = [...prev];
            next[activePlayerIdx] += 1;
            return next;
          });
        }

        // Update player ELO
        setPlayers((prev) => {
          if (!prev) return prev;
          const updated: [PlayerOut, PlayerOut] = [...prev];
          updated[activePlayerIdx] = { ...updated[activePlayerIdx], elo_score: att.player_elo_after };
          return updated;
        });
      } catch (e) { console.error(e); }
    },
    [selectedAnswer, currentQuestion, activePlayer, activeSession, activePlayerIdx],
  );

  // --- Next question ---
  const nextQuestion = async () => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= questionIds.length) {
      // Finish both sessions
      if (sessions) {
        await Promise.all([
          fetch(`${API_BASE}/sessions/${sessions[0].id}/finish`, { method: "POST" }),
          fetch(`${API_BASE}/sessions/${sessions[1].id}/finish`, { method: "POST" }),
        ]);
      }
      setDuelStep("result");
      return;
    }
    setCurrentIdx(nextIdx);
    setDuelStep("handover");
  };

  // --- Start turn (after handover) ---
  const startTurn = () => {
    setDuelStep("playing");
    loadQuestion(questionIds[currentIdx]);
  };

  // === RENDER ===

  // --- Name entry ---
  if (duelStep === "names") {
    return (
      <div className="quiz-container">
        <div className="quiz-setup">
          <button className="quiz-back-btn" onClick={onBack} style={{ alignSelf: "flex-start" }}>← Zurück</button>
          <h1 className="quiz-setup__title">⚔️ Quizduell 1v1</h1>
          <p className="quiz-setup__subtitle">Zwei Spieler, ein Gerät — wer weiß mehr?</p>

          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label className="field-label">
              Spieler 1
              <input
                className="text-input"
                type="text"
                placeholder="Spieler 1"
                value={player1Name}
                onChange={(e) => setPlayer1Name(e.target.value)}
                maxLength={20}
              />
            </label>
            <label className="field-label">
              Spieler 2
              <input
                className="text-input"
                type="text"
                placeholder="Spieler 2"
                value={player2Name}
                onChange={(e) => setPlayer2Name(e.target.value)}
                maxLength={20}
              />
            </label>
          </div>

          <button
            className="quiz-mode-btn quiz-mode-btn--primary"
            onClick={() => void initGame()}
            disabled={loading}
          >
            {loading ? "Starte..." : "Duell starten"}
          </button>
        </div>
      </div>
    );
  }

  // --- Handover screen ---
  if (duelStep === "handover") {
    return (
      <div className="quiz-container">
        <div className="quiz-setup" style={{ textAlign: "center" }}>
          <p className="quiz-setup__subtitle">Frage {currentIdx + 1} / {questionIds.length}</p>
          <h1 className="quiz-setup__title" style={{ fontSize: "1.6rem" }}>
            📱 Gib das Gerät an
          </h1>
          <div className="duel-handover-name">{activeName}</div>
          <div className="duel-score-preview">
            <span className={activePlayerIdx === 0 ? "duel-score--active" : ""}>
              {players?.[0]?.name ?? "Spieler 1"}: {scores[0]}
            </span>
            <span className="duel-score-divider">—</span>
            <span className={activePlayerIdx === 1 ? "duel-score--active" : ""}>
              {players?.[1]?.name ?? "Spieler 2"}: {scores[1]}
            </span>
          </div>
          <button
            className="quiz-mode-btn quiz-mode-btn--primary"
            onClick={startTurn}
          >
            Bereit — Frage zeigen
          </button>
        </div>
      </div>
    );
  }

  // --- Result screen ---
  if (duelStep === "result") {
    const p1Name = players?.[0]?.name ?? "Spieler 1";
    const p2Name = players?.[1]?.name ?? "Spieler 2";
    const winner = scores[0] > scores[1] ? p1Name : scores[1] > scores[0] ? p2Name : null;

    return (
      <div className="quiz-container">
        <div className="quiz-result">
          <h1 className="quiz-result__title">
            {winner ? `🏆 ${winner} gewinnt!` : "🤝 Unentschieden!"}
          </h1>

          <div className="duel-result-scores">
            <div className={`duel-result-player ${scores[0] >= scores[1] ? "duel-result-player--winner" : ""}`}>
              <span className="duel-result-player__name">{p1Name}</span>
              <span className="duel-result-player__score">{scores[0]}</span>
              <span className="duel-result-player__elo">ELO {Math.round(players?.[0]?.elo_score ?? 1200)}</span>
            </div>
            <div className="duel-result-vs">vs</div>
            <div className={`duel-result-player ${scores[1] >= scores[0] ? "duel-result-player--winner" : ""}`}>
              <span className="duel-result-player__name">{p2Name}</span>
              <span className="duel-result-player__score">{scores[1]}</span>
              <span className="duel-result-player__elo">ELO {Math.round(players?.[1]?.elo_score ?? 1200)}</span>
            </div>
          </div>

          <div className="quiz-result__details">
            {scores[0] + scores[1]} / {questionIds.length} Fragen richtig beantwortet
          </div>

          <button className="quiz-mode-btn quiz-mode-btn--primary" style={{ marginTop: "1rem" }} onClick={onBack}>
            Zurück zum Menü
          </button>
        </div>
      </div>
    );
  }

  // --- Playing (question) ---
  const progress = questionIds.length > 0
    ? ((currentIdx + (attempt ? 1 : 0)) / questionIds.length) * 100
    : 0;

  return (
    <div className="quiz-container">
      <div className="quiz-progress">
        <div className="quiz-progress__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-header">
        <button className="quiz-back-btn" onClick={onBack} title="Zurück">←</button>
        <div className="quiz-meta">
          <span>{currentIdx + 1}/{questionIds.length}</span>
          <span className="duel-turn-badge">🎯 {activeName}</span>
        </div>
        <div className="duel-live-score">
          {scores[0]} : {scores[1]}
        </div>
      </div>

      {currentQuestion && (
        <div className="quiz-question-wrapper" key={slideKey}>
          <div className="quiz-question-card">
            <h2>{currentQuestion.text}</h2>
          </div>

          <div className="quiz-answers">
            {currentQuestion.answers.map((a, i) => {
              const isCorrect = attempt?.correct_answer_id === a.id;
              const isSelected = selectedAnswer === a.id;
              const isWrong = isSelected && !attempt?.correct;

              let stateClass = "";
              if (attempt) {
                if (isCorrect) stateClass = "quiz-answer-btn--correct";
                else if (isWrong) stateClass = "quiz-answer-btn--wrong";
                else stateClass = "quiz-answer-btn--dimmed";
              }

              return (
                <button
                  key={a.id}
                  className={`quiz-answer-btn ${stateClass}`}
                  disabled={!!attempt}
                  onClick={() => submitAnswer(a.id)}
                >
                  <span className="quiz-answer-btn__label">{ANSWER_LABELS[i] || "?"}</span>
                  {a.text}
                </button>
              );
            })}
          </div>

          {attempt && (
            <div className="quiz-feedback">
              <p className={`quiz-feedback__result ${attempt.correct ? "quiz-feedback__result--correct" : "quiz-feedback__result--wrong"}`}>
                {attempt.correct ? "✓ Richtig!" : "✗ Falsch!"}
              </p>

              {attempt.note && (
                <div className="quiz-explanation">
                  <div className="quiz-explanation__title">💡 Hinweis</div>
                  {attempt.note}
                </div>
              )}

              <button className="quiz-next-btn" onClick={nextQuestion}>
                {currentIdx + 1 >= questionIds.length ? "Ergebnis anzeigen" : "Weiter →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

