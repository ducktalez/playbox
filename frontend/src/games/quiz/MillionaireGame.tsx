/**
 * "Wer wird Elite-Haider" — Millionaire Mode
 *
 * Full WWM-style interface:
 * - Prize ladder (15 levels, €50 → €1 Million)
 * - Safety marks at levels 5 (€500) and 10 (€16,000)
 * - Three jokers: 50:50, Audience Poll, Phone (Drachenlord)
 * - Game Over on wrong answer (falls back to last safety)
 * - Sound effects served from /media/sounds/wwm/
 */

import { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

// --- Prize Ladder ---
const PRIZE_LADDER = [
  { level: 1, prize: "€50" },
  { level: 2, prize: "€100" },
  { level: 3, prize: "€200" },
  { level: 4, prize: "€300" },
  { level: 5, prize: "€500" },
  { level: 6, prize: "€1.000" },
  { level: 7, prize: "€2.000" },
  { level: 8, prize: "€4.000" },
  { level: 9, prize: "€8.000" },
  { level: 10, prize: "€16.000" },
  { level: 11, prize: "€32.000" },
  { level: 12, prize: "€64.000" },
  { level: 13, prize: "€125.000" },
  { level: 14, prize: "€500.000" },
  { level: 15, prize: "€1 MILLION" },
];
const SAFETY_LEVELS = new Set([5, 10]);

// --- Sound System (real WWM MP3 files) ---
const SOUND_BASE = "/media/sounds/wwm";

function createAudio(file: string, loop = false): HTMLAudioElement {
  const audio = new Audio(`${SOUND_BASE}/${file}`);
  audio.loop = loop;
  audio.preload = "auto";
  return audio;
}

// Background music tracks (looped per tier)
const bgTracks = {
  low: createAudio("question-low.mp3", true),
  mid: createAudio("question-mid.mp3", true),
  high: createAudio("question-high.mp3", true),
  million: createAudio("question-million.mp3", true),
};

// One-shot sound effects
const sfx = {
  intro: createAudio("intro.mp3"),
  lockIn: createAudio("lock-in.mp3"),
  correctLow: createAudio("correct-low.mp3"),
  correctMid: createAudio("correct-mid.mp3"),
  correctHigh: createAudio("correct-high.mp3"),
  correctMillion: createAudio("correct-million.mp3"),
  wrongLow: createAudio("wrong-low.mp3"),
  wrongMid: createAudio("wrong-mid.mp3"),
  wrongHigh: createAudio("wrong-high.mp3"),
  wrongMillion: createAudio("wrong-million.mp3"),
  fiftyFifty: createAudio("fifty-fifty.mp3"),
  audience: createAudio("audience-joker.mp3"),
  phone: createAudio("phone-joker.mp3"),
  safety1: createAudio("safety-1.mp3"),
  safety2: createAudio("safety-2.mp3"),
  afterCorrect: createAudio("after-correct.mp3"),
  afterSelection: createAudio("after-selection.mp3"),
  afterSafety: createAudio("after-safety.mp3"),
  win: createAudio("win.mp3"),
  win2: createAudio("win-2.mp3"),
  outro: createAudio("outro.mp3"),
};

let currentBg: HTMLAudioElement | null = null;

/** Stop the currently playing background music. */
function stopSound() {
  if (currentBg) {
    currentBg.pause();
    currentBg.currentTime = 0;
    currentBg = null;
  }
}

/** Start tier-appropriate background music. */
function playBg(level: number) {
  stopSound();
  let track: HTMLAudioElement;
  if (level <= 5) track = bgTracks.low;
  else if (level <= 10) track = bgTracks.mid;
  else if (level <= 14) track = bgTracks.high;
  else track = bgTracks.million;
  track.currentTime = 0;
  track.play().catch(() => {});
  currentBg = track;
}

/** Play a one-shot sound effect. */
function playSfx(audio: HTMLAudioElement) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function getCorrectSfx(level: number): HTMLAudioElement {
  if (level <= 5) return sfx.correctLow;
  if (level <= 10) return sfx.correctMid;
  if (level <= 14) return sfx.correctHigh;
  return sfx.correctMillion;
}

function getWrongSfx(level: number): HTMLAudioElement {
  if (level <= 5) return sfx.wrongLow;
  if (level <= 10) return sfx.wrongMid;
  if (level <= 14) return sfx.wrongHigh;
  return sfx.wrongMillion;
}

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;

// --- Confetti Particles (pure CSS, no dependencies) ---
const CONFETTI_COLORS = ["#f5a623", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#facc15", "#06b6d4"];

function ConfettiParticles({ count = 35 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 1.8 + Math.random() * 1.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 7 + Math.random() * 9,
        isRect: Math.random() > 0.5,
        rotate: Math.random() * 360,
      })),
    [count],
  );

  return (
    <div className="wwm-confetti" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="wwm-confetti__particle"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: p.isRect ? `${p.size * 0.45}px` : `${p.size}px`,
            background: p.color,
            borderRadius: p.isRect ? "2px" : "50%",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// --- Types ---
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
type AudiencePollEntry = { answer_id: string; percentage: number };
type PhoneHint = { hint_answer_id: string; confidence: number; message: string };

export default function MillionaireGame({ onBack }: { onBack: () => void }) {
  // Game state
  const [player, setPlayer] = useState<PlayerOut | null>(null);
  const [session, setSession] = useState<SessionOut | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionOut | null>(null);
  const [attempt, setAttempt] = useState<AttemptOut | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slideKey, setSlideKey] = useState(0);
  const [initTrigger, setInitTrigger] = useState(0);

  // Joker state
  const [jokerFiftyUsed, setJokerFiftyUsed] = useState(false);
  const [jokerAudienceUsed, setJokerAudienceUsed] = useState(false);
  const [jokerPhoneUsed, setJokerPhoneUsed] = useState(false);
  const [fiftyFiftyRemoved, setFiftyFiftyRemoved] = useState<Set<string>>(new Set());
  const [audiencePoll, setAudiencePoll] = useState<AudiencePollEntry[] | null>(null);
  const [phoneHint, setPhoneHint] = useState<PhoneHint | null>(null);
  const [phoneSecondChance, setPhoneSecondChance] = useState(false);

  // Reveal delay state — mimics WWM suspense pause
  const [revealing, setRevealing] = useState(false);

  // Safety / Win celebration overlay
  const [celebratingSafety, setCelebratingSafety] = useState<5 | 10 | null>(null);

  // Auto-dismiss safety celebration after 2.5 s
  useEffect(() => {
    if (!celebratingSafety) return;
    const t = setTimeout(() => setCelebratingSafety(null), 2500);
    return () => clearTimeout(t);
  }, [celebratingSafety]);

  // --- Current level (1-indexed) ---
  const currentLevel = currentIdx + 1;

  // Stop all sounds on unmount
  useEffect(() => {
    return () => {
      stopSound();
      Object.values(sfx).forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
    };
  }, []);

  const getSafetyPrize = () => {
    if (currentLevel > 10) return PRIZE_LADDER[9].prize;
    if (currentLevel > 5) return PRIZE_LADDER[4].prize;
    return "€0";
  };

  // --- Start Game ---
  useEffect(() => {
    const init = async () => {
      try {
        const pRes = await fetch(`${API_BASE}/players`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Gast" }),
        });
        if (!pRes.ok) throw new Error(`Player: ${pRes.status}`);
        const pData = await pRes.json();
        setPlayer(pData);

        const sRes = await fetch(`${API_BASE}/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "millionaire", player_id: pData.id }),
        });
        if (!sRes.ok) throw new Error(`Session: ${sRes.status}`);
        setSession(await sRes.json());

        const qRes = await fetch(`${API_BASE}/questions?order_by_elo=asc&limit=15`);
        if (!qRes.ok) throw new Error(`Questions: ${qRes.status}`);
        const qData = await qRes.json();
        const ids = qData.items.map((q: { id: string }) => q.id);
        if (ids.length === 0) { alert("Keine Fragen vorhanden!"); onBack(); return; }

        setQuestionIds(ids);
        setLoading(false);
        playSfx(sfx.intro);
        loadQuestion(ids[0], 1);
      } catch (e) {
        alert(`Fehler: ${e instanceof Error ? e.message : e}`);
        onBack();
      }
    };
    init();
    return () => stopSound();
  }, [initTrigger]);

  // --- Load Question ---
  const loadQuestion = async (id: string, level: number) => {
    setSelectedAnswer(null);
    setAttempt(null);
    setFiftyFiftyRemoved(new Set());
    setAudiencePoll(null);
    setPhoneHint(null);
    setPhoneSecondChance(false);
    setSlideKey((k) => k + 1);

    const res = await fetch(`${API_BASE}/questions/${id}?num_answers=4`);
    if (res.ok) {
      setCurrentQuestion(await res.json());
      playBg(level);
    }
  };

  // --- Submit Answer ---
  const submitAnswer = useCallback(
    async (answerId: string) => {
      if (selectedAnswer || revealing || !currentQuestion || !player || !session) return;
      setSelectedAnswer(answerId);
      setRevealing(true);
      stopSound();

      // Play lock-in sting immediately
      playSfx(sfx.lockIn);
      // Play the after-selection tension loop while waiting
      playSfx(sfx.afterSelection);

      try {
        const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/attempt`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer_id: answerId, player_id: player.id, session_id: session.id,
          }),
        });
        if (!res.ok) { setRevealing(false); return; }
        const att: AttemptOut = await res.json();

        // 1.8-second suspense pause before revealing the result
        await new Promise((resolve) => setTimeout(resolve, 1800));
        sfx.afterSelection.pause();
        sfx.afterSelection.currentTime = 0;

        setAttempt(att);
        setRevealing(false);
        setPlayer((p) => p ? { ...p, elo_score: att.player_elo_after } : p);

        if (att.correct) {
          playSfx(getCorrectSfx(currentLevel));
          if (currentLevel >= 15) {
            setGameWon(true);
            setTimeout(() => playSfx(sfx.win), 1500);
          } else if (SAFETY_LEVELS.has(currentLevel)) {
            const safetySfx = currentLevel === 5 ? sfx.safety1 : sfx.safety2;
            setTimeout(() => playSfx(safetySfx), 1500);
            setCelebratingSafety(currentLevel as 5 | 10);
          }
        } else {
          // Phone joker second chance: allow one retry on wrong answer
          if (phoneSecondChance) {
            // Keep phoneSecondChance true so the feedback UI shows
            // the retry button; retryWithSecondChance() resets everything.
          } else {
            playSfx(getWrongSfx(currentLevel));
            setGameOver(true);
          }
        }
      } catch (e) { console.error(e); setRevealing(false); }
    },
    [selectedAnswer, revealing, currentQuestion, player, session, phoneSecondChance, currentLevel],
  );

  // --- Next Question ---
  const nextQuestion = async () => {
    if (gameOver || gameWon) {
      if (session) {
        await fetch(`${API_BASE}/sessions/${session.id}/finish`, { method: "POST" });
      }
      if (gameWon) playSfx(sfx.win2);
      else playSfx(sfx.outro);
      return;
    }
    const nextIdx = currentIdx + 1;
    if (nextIdx >= questionIds.length) {
      setGameWon(true);
      playSfx(sfx.win);
      return;
    }
    playSfx(sfx.afterCorrect);
    setCurrentIdx(nextIdx);
    stopSound();
    loadQuestion(questionIds[nextIdx], nextIdx + 1);
  };

  // --- Use wrong answer with phone second chance ---
  const retryWithSecondChance = () => {
    // Remove the wrong answer from the visible options, then let user pick again
    if (selectedAnswer) {
      setFiftyFiftyRemoved((prev) => new Set([...prev, selectedAnswer]));
    }
    setSelectedAnswer(null);
    setAttempt(null);
    setPhoneSecondChance(false);
    // Restart background music for the current level
    playBg(currentLevel);
  };

  // --- Joker: 50:50 ---
  const useFiftyFifty = async () => {
    if (jokerFiftyUsed || !currentQuestion || attempt) return;
    setJokerFiftyUsed(true);
    playSfx(sfx.fiftyFifty);
    const ids = currentQuestion.answers.map((a) => a.id);
    const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/fifty-fifty`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayed_answer_ids: ids }),
    });
    if (res.ok) {
      const data = await res.json();
      setFiftyFiftyRemoved(new Set(data.remove));
    }
  };

  // --- Joker: Audience ---
  const useAudience = async () => {
    if (jokerAudienceUsed || !currentQuestion || attempt) return;
    setJokerAudienceUsed(true);
    const ids = currentQuestion.answers.map((a) => a.id);
    const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/audience-poll`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayed_answer_ids: ids }),
    });
    if (res.ok) {
      setAudiencePoll((await res.json()).results);
    }
  };

  // --- Joker: Phone ---
  const usePhone = async () => {
    if (jokerPhoneUsed || !currentQuestion || attempt) return;
    setJokerPhoneUsed(true);
    setPhoneSecondChance(true);
    playSfx(sfx.phone);
    const ids = currentQuestion.answers.map((a) => a.id);
    const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/phone-joker`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayed_answer_ids: ids }),
    });
    if (res.ok) {
      setPhoneHint(await res.json());
    }
  };

  // --- Loading ---
  if (loading) {
    return (
      <div className="wwm-container">
        <div className="wwm-loading">Lade Fragen...</div>
      </div>
    );
  }

  // --- Game Over / Won ---
  if (gameOver || gameWon) {
    const finalPrize = gameWon
      ? PRIZE_LADDER[14].prize
      : getSafetyPrize();

    const replay = () => {
      // Stop all sounds and reset state for a fresh game
      stopSound();
      Object.values(sfx).forEach((a) => { a.pause(); a.currentTime = 0; });
      setPlayer(null);
      setSession(null);
      setQuestionIds([]);
      setCurrentIdx(0);
      setCurrentQuestion(null);
      setAttempt(null);
      setSelectedAnswer(null);
      setGameOver(false);
      setGameWon(false);
      setJokerFiftyUsed(false);
      setJokerAudienceUsed(false);
      setJokerPhoneUsed(false);
      setFiftyFiftyRemoved(new Set());
      setAudiencePoll(null);
      setPhoneHint(null);
      setPhoneSecondChance(false);
      setRevealing(false);
      setCelebratingSafety(null);
      setLoading(true);
      // Re-trigger init by bumping initTrigger — useEffect on initTrigger handles re-init
      setInitTrigger((t) => t + 1);
    };

    return (
      <div className="wwm-container">
        {gameWon && <ConfettiParticles count={60} />}
        <div className="wwm-result">
          <h1 className="wwm-result__title">
            {gameWon ? "🏆 ELITE-HAIDER!" : "Leider verloren!"}
          </h1>
          <div className={`wwm-result__prize${gameWon ? " wwm-result__prize--win" : ""}`}>
            {finalPrize}
          </div>
          {!gameWon && (
            <p className="wwm-result__safety">
              Gesichert bei: {getSafetyPrize()}
            </p>
          )}
          <p className="wwm-result__elo">
            ELO: {Math.round(player?.elo_score || 1200)}
          </p>
          <div className="wwm-result__actions">
            <button className="wwm-btn wwm-btn--primary" onClick={replay}>
              🔄 Nochmal spielen
            </button>
            <button className="wwm-btn" onClick={onBack}>
              Zurück zum Menü
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Playing ---
  const visibleAnswers = currentQuestion?.answers.filter(
    (a) => !fiftyFiftyRemoved.has(a.id)
  ) || [];

  return (
    <div className="wwm-container">
      {/* Safety mark celebration overlay */}
      {celebratingSafety && (
        <div className="wwm-safety-overlay" aria-live="assertive">
          <ConfettiParticles count={30} />
          <div className="wwm-safety-overlay__content">
            <div className="wwm-safety-overlay__icon">🛡️</div>
            <div className="wwm-safety-overlay__amount">
              {celebratingSafety === 5 ? "€500" : "€16.000"}
            </div>
            <div className="wwm-safety-overlay__label">GESICHERT!</div>
          </div>
        </div>
      )}

      {/* Header: Back + Jokers */}
      <div className="wwm-header">
        <button className="wwm-back" onClick={onBack} title="Zurück">←</button>
        <div className="wwm-jokers">
          <button
            className={`wwm-joker ${jokerFiftyUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerFiftyUsed || !!attempt}
            onClick={useFiftyFifty}
            title="50:50"
          >50:50</button>
          <button
            className={`wwm-joker ${jokerAudienceUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerAudienceUsed || !!attempt}
            onClick={useAudience}
            title="Publikumsjoker"
          >👥</button>
          <button
            className={`wwm-joker ${jokerPhoneUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerPhoneUsed || !!attempt}
            onClick={usePhone}
            title="Telefonjoker"
          >📞</button>
        </div>
        <span className="wwm-level-badge">{PRIZE_LADDER[currentIdx]?.prize}</span>
      </div>

      <div className="wwm-body">
        {/* Prize Ladder */}
        <div className="wwm-ladder">
          {[...PRIZE_LADDER].reverse().map((step) => {
            const isCurrent = step.level === currentLevel;
            const isCleared = step.level < currentLevel;
            const isSafety = SAFETY_LEVELS.has(step.level);
            return (
              <div
                key={step.level}
                className={`wwm-ladder__step${isCurrent ? " wwm-ladder__step--current" : ""}${isCleared ? " wwm-ladder__step--cleared" : ""}${isSafety ? " wwm-ladder__step--safety" : ""}`}
              >
                <span className="wwm-ladder__num">{step.level}</span>
                <span className="wwm-ladder__prize">{step.prize}</span>
              </div>
            );
          })}
        </div>

        {/* Question + Answers */}
        <div className="wwm-game">
          {currentQuestion && (
            <div className="wwm-question-area" key={slideKey}>
              {/* Phone Hint */}
              {phoneHint && !attempt && (
                <div className="wwm-phone-bubble">
                  <span className="wwm-phone-bubble__icon">📞</span>
                  <p className="wwm-phone-bubble__msg">"{phoneHint.message}"</p>
                  <span className="wwm-phone-bubble__conf">
                    Sicherheit: {phoneHint.confidence}%
                  </span>
                </div>
              )}

              {/* Audience Poll */}
              {audiencePoll && !attempt && (
                <div className="wwm-audience">
                  <div className="wwm-audience__title">👥 Publikum</div>
                  <div className="wwm-audience__bars">
                    {audiencePoll.map((entry, i) => {
                      const ans = currentQuestion.answers.find((a) => a.id === entry.answer_id);
                      if (!ans || fiftyFiftyRemoved.has(ans.id)) return null;
                      return (
                        <div key={entry.answer_id} className="wwm-audience__bar-row">
                          <span className="wwm-audience__label">{ANSWER_LABELS[i]}</span>
                          <div className="wwm-audience__bar">
                            <div
                              className="wwm-audience__bar-fill"
                              style={{ width: `${entry.percentage}%` }}
                            />
                          </div>
                          <span className="wwm-audience__pct">{entry.percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Question Card */}
              <div className="wwm-question-card">
                <div className="wwm-question-card__text">{currentQuestion.text}</div>
              </div>

              {/* Answer Buttons (2x2) */}
              <div className="wwm-answers">
                {visibleAnswers.map((a, i) => {
                  const globalIdx = currentQuestion.answers.indexOf(a);
                  const isSelected = selectedAnswer === a.id;
                  const isCorrect = attempt?.correct_answer_id === a.id;
                  const isWrong = isSelected && attempt && !attempt.correct;

                  let stateClass = "";
                  if (attempt) {
                    if (isCorrect) stateClass = "wwm-answer--correct";
                    else if (isWrong) stateClass = "wwm-answer--wrong";
                    else if (isSelected) stateClass = "wwm-answer--selected";
                  } else if (isSelected) {
                    stateClass = revealing ? "wwm-answer--selected wwm-answer--revealing" : "wwm-answer--selected";
                  }

                  return (
                    <button
                      key={a.id}
                      className={`wwm-answer ${stateClass}`}
                      disabled={!!attempt || revealing}
                      onClick={() => submitAnswer(a.id)}
                    >
                      <span className="wwm-answer__label">{ANSWER_LABELS[globalIdx]}</span>
                      <span className="wwm-answer__text">{a.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Feedback */}
              {attempt && (
                <div className="wwm-feedback">
                  {attempt.correct ? (
                    <>
                      <p className="wwm-feedback__text wwm-feedback__text--correct">
                        ✓ Richtig! {PRIZE_LADDER[currentIdx]?.prize} gesichert!
                      </p>
                      {attempt.note && (
                        <div className="wwm-explanation">
                          <div className="wwm-explanation__title">💡 Hinweis</div>
                          {attempt.note}
                        </div>
                      )}
                      <button className="wwm-btn wwm-btn--primary" onClick={nextQuestion}>
                        {currentLevel >= 15 ? "🏆 Gewinn einlösen" : "Nächste Frage →"}
                      </button>
                    </>
                  ) : phoneSecondChance ? (
                    <>
                      <p className="wwm-feedback__text wwm-feedback__text--wrong">
                        ✗ Falsch — aber dein Telefonjoker gibt dir eine 2. Chance!
                      </p>
                      <button className="wwm-btn wwm-btn--primary" onClick={retryWithSecondChance}>
                        Nochmal versuchen
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="wwm-feedback__text wwm-feedback__text--wrong">
                        ✗ Leider falsch!
                      </p>
                      {attempt.note && (
                        <div className="wwm-explanation">
                          <div className="wwm-explanation__title">💡 Hinweis</div>
                          {attempt.note}
                        </div>
                      )}
                      <p className="wwm-feedback__safety">
                        Du gehst mit {getSafetyPrize()} nach Hause.
                      </p>
                      <button className="wwm-btn wwm-btn--primary" onClick={onBack}>
                        Zurück zum Menü
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

