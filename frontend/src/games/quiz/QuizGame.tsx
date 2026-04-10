/**
 * Quiz Game — Quizduell-style UI
 *
 * GAME MODES:
 *   1. "Wer wird Elite-Haider" (Millionär) — Solo, 15 questions, no timer
 *   2. "Quizduell (1v1)" — Future multiplayer placeholder
 *   3. "Single Player" — Solo, 10 questions, 20-second timer per question
 *
 * STATE MACHINE: setup → playing → result
 */

import { useState, useEffect, useCallback, useRef } from "react";
import MillionaireGame from "./MillionaireGame";
import DuelGame from "./DuelGame";
import LeaderboardView from "./LeaderboardView";
import PlayerProfile from "./PlayerProfile";
import QuestionForm from "./QuestionForm";
import QuestionFeedback, { type PendingFeedback } from "./QuestionFeedback";
import {
  createOfflineQuizSession,
  getCurrentQuestion,
  submitOfflineAnswer,
  advanceOfflineSession,
  type OfflineQuizSession,
} from "./offlineSession";
import { getOfflineQuizQuestions } from "../../core/offlineManager";
import {
  type TruthCache,
  createTruthCache,
  cacheServerQuestions,
  mergeIndexedDBQuestions,
  truthToDisplayQuestion,
  evaluateFromCache,
} from "./questionTruthCache";
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { quizTranslations } from "./translations";

const quizI18n = mergeTranslations(coreTranslations, quizTranslations);

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type Step = "setup" | "playing" | "result";

type PlayerOut = {
  id: string;
  name: string;
  elo_score: number;
  games_played: number;
  correct_count: number;
};

type SessionOut = {
  id: string;
  mode: string;
  player_id: string;
  score: number;
};

type QuestionOut = {
  id: string;
  text: string;
  category: string;
  elo_score: number;
  media_url: string | null;
  media_type: string | null;
  answers: { id: string; text: string }[];
};

type AttemptOut = {
  correct: boolean;
  correct_answer_id: string;
  note: string | null;
  player_elo_before: number;
  player_elo_after: number;
  question_elo_before: number;
  question_elo_after: number;
};

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;

export default function QuizGame() {
  const { t } = useTranslation(quizI18n);

  const [step, setStep] = useState<Step>("setup");
  const [millionaireActive, setMillionaireActive] = useState(false);
  const [duelActive, setDuelActive] = useState(false);
  const [leaderboardActive, setLeaderboardActive] = useState(false);
  const [profileActive, setProfileActive] = useState(false);
  const [questionFormActive, setQuestionFormActive] = useState(false);
  const [player, setPlayer] = useState<PlayerOut | null>(null);
  const [session, setSession] = useState<SessionOut | null>(null);
  const [duelMode, setDuelMode] = useState<
    "millionaire" | "duel" | "duel-speed"
  >("millionaire");

  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionOut | null>(
    null,
  );
  const [attempt, setAttempt] = useState<AttemptOut | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [startElo, setStartElo] = useState(1200);

  // Tag filter for speed mode
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; question_count: number }[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");

  // Slide animation key — changes per question to re-trigger animation
  const [slideKey, setSlideKey] = useState(0);

  // Timer state for speed mode
  const [timeRemaining, setTimeRemaining] = useState(20);
  const [timerActive, setTimerActive] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Deferred question feedback
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);

  // Offline mode
  const [isOffline, setIsOffline] = useState(false);
  const [offlineSession, setOfflineSession] = useState<OfflineQuizSession | null>(null);

  // Pre-cached answer truth for cache-first question loading and offline evaluation
  const truthCacheRef = useRef<TruthCache>(createTruthCache());

  const isSpeedMode = duelMode === "duel-speed";

  /** Fire-and-forget: POST pending feedback for the current question, then clear it. */
  const flushFeedback = useCallback(() => {
    if (!pendingFeedback || !currentQuestion) return;
    const body: Record<string, unknown> = { feedback_type: pendingFeedback.feedback_type };
    if (pendingFeedback.category) body.category = pendingFeedback.category;
    if (pendingFeedback.comment) body.comment = pendingFeedback.comment;
    if (player) body.player_id = player.id;
    if (session) body.session_id = session.id;
    fetch(`${API_BASE}/questions/${currentQuestion.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setPendingFeedback(null);
  }, [pendingFeedback, currentQuestion, player, session]);

  // --- Load available tags ---
  useEffect(() => {
    let ignore = false;
    fetch(`${API_BASE}/tags`)
      .then((r) => r.json())
      .then((data) => { if (!ignore) setAvailableTags(data); })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  // --- Timer countdown ---
  useEffect(() => {
    if (!timerActive || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, timeRemaining]);

  // --- Auto-submit on timeout ---
  useEffect(() => {
    if (timeRemaining > 0 || !isSpeedMode || !currentQuestion || selectedAnswer || attempt) return;

    // Time ran out — mark as timed out (no red highlight) and submit a dummy wrong answer
    setTimedOut(true);
    const wrongId = currentQuestion.answers[0]?.id || "";
    submitAnswer(wrongId, true);
  }, [timeRemaining]);

  // --- Start game ---
  const startGame = async (
    selectedMode: "millionaire" | "duel" | "duel-speed",
  ) => {
    // Millionaire has its own dedicated component
    if (selectedMode === "millionaire") {
      setMillionaireActive(true);
      return;
    }

    // Duel 1v1 has its own dedicated component
    if (selectedMode === "duel") {
      setDuelActive(true);
      return;
    }

    setDuelMode(selectedMode);
    const modeForBackend = selectedMode === "duel-speed" ? "speed" : selectedMode;

    try {
      const pRes = await fetch(`${API_BASE}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Gast" }),
      });
      if (!pRes.ok)
        throw new Error(`Player creation failed: ${pRes.status}`);
      const pData: PlayerOut = await pRes.json();
      setPlayer(pData);
      setStartElo(pData.elo_score);

      const sRes = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeForBackend, player_id: pData.id }),
      });
      if (!sRes.ok)
        throw new Error(`Session creation failed: ${sRes.status}`);
      const sData: SessionOut = await sRes.json();
      setSession(sData);

      const limit = 10; // speed mode always 10 questions
      const tagParam = selectedTag ? `&tag=${encodeURIComponent(selectedTag)}` : "";
      const qRes = await fetch(
        `${API_BASE}/questions?balanced_categories=true&limit=${limit}${tagParam}`,
      );
      if (!qRes.ok)
        throw new Error(`Question fetch failed: ${qRes.status}`);
      const qData = await qRes.json();
      const ids = qData.items.map((q: { id: string }) => q.id);

      if (ids.length === 0) {
        alert(t("result.noQuestions"));
        return;
      }

      // Pre-cache all game questions (includes is_correct) for cache-first loading
      cacheServerQuestions(truthCacheRef.current, qData.items);
      await mergeIndexedDBQuestions(truthCacheRef.current);

      setQuestionIds(ids);
      setCurrentIdx(0);
      setCorrectCount(0);
      setStep("playing");
      loadQuestion(ids[0], selectedMode === "duel-speed");
    } catch (e) {
      // Backend unreachable — try offline fallback for speed mode
      if (selectedMode === "duel-speed") {
        const offSess = await createOfflineQuizSession("speed");
        if (offSess && offSess.questions.length > 0) {
          setOfflineSession(offSess);
          setIsOffline(true);
          setDuelMode("duel-speed");
          const q = getCurrentQuestion(offSess);
          if (q) {
            setCurrentQuestion({
              id: q.id,
              text: q.text,
              category: q.category ?? "",
              elo_score: q.elo_score,
              media_url: q.media_url,
              media_type: q.media_type,
              answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
            });
            setQuestionIds(offSess.questions.map((oq) => oq.id));
            setCurrentIdx(0);
            setCorrectCount(0);
            setStep("playing");
            setTimeRemaining(20);
            setTimerActive(true);
            setSlideKey((k) => k + 1);
          }
          return;
        }
      }
      console.error("Error in startGame:", e);
      alert(t("result.startError", { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  // --- Load a question (cache-first) ---
  const loadQuestion = async (id: string, startTimer: boolean = isSpeedMode) => {
    setSelectedAnswer(null);
    setAttempt(null);
    setTimedOut(false);
    setSlideKey((k) => k + 1);

    // 1. Try truth cache first (populated at startGame from server response)
    const truth = truthCacheRef.current.get(id);
    if (truth) {
      setCurrentQuestion(truthToDisplayQuestion(truth, id));
      if (startTimer) {
        setTimeRemaining(20);
        setTimerActive(true);
      }
      return;
    }

    // 2. Try IndexedDB fallback
    try {
      const allQ = await getOfflineQuizQuestions();
      const offQ = allQ.find((q) => q.id === id);
      if (offQ) {
        cacheServerQuestions(truthCacheRef.current, [offQ]);
        setCurrentQuestion(truthToDisplayQuestion(truthCacheRef.current.get(id)!, id));
        setIsOffline(true);
        if (startTimer) {
          setTimeRemaining(20);
          setTimerActive(true);
        }
        return;
      }
    } catch { /* IndexedDB unavailable */ }

    // 3. Last resort: fetch from server
    try {
      const res = await fetch(`${API_BASE}/questions/${id}?num_answers=4`);
      if (!res.ok) throw new Error(`Question fetch failed: ${res.status}`);
      setCurrentQuestion(await res.json());
      if (startTimer) {
        setTimeRemaining(20);
        setTimerActive(true);
      }
    } catch {
      // Server unreachable and not in cache — create offline session from scratch
      const offSess = await createOfflineQuizSession(
        isSpeedMode ? "speed" : "millionaire",
        questionIds.length - currentIdx,
      );
      if (offSess && offSess.questions.length > 0) {
        setOfflineSession(offSess);
        setIsOffline(true);
        const q = getCurrentQuestion(offSess);
        if (q) {
          setCurrentQuestion({
            id: q.id,
            text: q.text,
            category: q.category ?? "",
            elo_score: q.elo_score,
            media_url: q.media_url,
            media_type: q.media_type,
            answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
          });
          setQuestionIds(offSess.questions.map((oq) => oq.id));
          setCurrentIdx(0);
        }
        if (startTimer) {
          setTimeRemaining(20);
          setTimerActive(true);
        }
      }
    }
  };

  // --- Submit answer ---
  const submitAnswer = useCallback(
    async (answerId: string, isTimeout: boolean = false) => {
      if (selectedAnswer || !currentQuestion) return;
      setSelectedAnswer(answerId);
      setTimerActive(false);

      // Offline mode — evaluate locally
      if (isOffline && offlineSession) {
        const result = submitOfflineAnswer(offlineSession, answerId);
        setAttempt({
          correct: result.correct,
          correct_answer_id: result.correctAnswerId,
          note: result.note,
          player_elo_before: 1200,
          player_elo_after: 1200,
          question_elo_before: 1200,
          question_elo_after: 1200,
        });
        if (result.correct) setCorrectCount((c) => c + 1);
        return;
      }

      if (!player || !session) return;

      try {
        const res = await fetch(
          `${API_BASE}/questions/${currentQuestion.id}/attempt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              answer_id: answerId,
              player_id: player.id,
              session_id: session.id,
              time_taken_ms: isTimeout
                ? 20000
                : Math.max(0, 20000 - timeRemaining * 1000),
            }),
          },
        );
        if (res.ok) {
          const att: AttemptOut = await res.json();
          setAttempt(att);
          if (att.correct) setCorrectCount((c) => c + 1);
          setPlayer((prev) =>
            prev ? { ...prev, elo_score: att.player_elo_after } : prev,
          );
        }
      } catch {
        // Server unreachable mid-game — evaluate from truth cache
        const result = evaluateFromCache(truthCacheRef.current, currentQuestion.id, answerId);
        if (result) {
          setAttempt({
            correct: result.correct,
            correct_answer_id: result.correctAnswerId,
            note: result.note,
            player_elo_before: player.elo_score,
            player_elo_after: player.elo_score,
            question_elo_before: 1200,
            question_elo_after: 1200,
          });
          if (result.correct) setCorrectCount((c) => c + 1);
          setIsOffline(true);
        } else {
          console.error("Submit failed and question not in truth cache");
        }
      }
    },
    [selectedAnswer, currentQuestion, player, session, timeRemaining, isOffline, offlineSession],
  );

  // --- Next question ---
  const nextQuestion = async () => {
    flushFeedback();

    // Offline mode — advance locally
    if (isOffline && offlineSession) {
      const hasMore = advanceOfflineSession(offlineSession);
      if (!hasMore) {
        setStep("result");
        return;
      }
      const nextIdx = offlineSession.currentIndex;
      setCurrentIdx(nextIdx);
      const q = getCurrentQuestion(offlineSession);
      if (q) {
        setCurrentQuestion({
          id: q.id,
          text: q.text,
          category: q.category ?? "",
          elo_score: q.elo_score,
          media_url: q.media_url,
          media_type: q.media_type,
          answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
        });
        setSelectedAnswer(null);
        setAttempt(null);
        setTimedOut(false);
        setSlideKey((k) => k + 1);
        if (isSpeedMode) {
          setTimeRemaining(20);
          setTimerActive(true);
        }
      }
      return;
    }

    const nextIdx = currentIdx + 1;
    if (nextIdx >= questionIds.length) {
      if (session) {
        await fetch(`${API_BASE}/sessions/${session.id}/finish`, {
          method: "POST",
        });
      }
      setStep("result");
    } else {
      setCurrentIdx(nextIdx);
      loadQuestion(questionIds[nextIdx]);
    }
  };

  // --- Reset ---
  const reset = () => {
    setStep("setup");
    setMillionaireActive(false);
    setDuelActive(false);
    setLeaderboardActive(false);
    setQuestionFormActive(false);
    setPlayer(null);
    setSession(null);
    setQuestionIds([]);
    setCurrentQuestion(null);
    setAttempt(null);
    setSelectedAnswer(null);
    setCorrectCount(0);
    setTimerActive(false);
    setTimedOut(false);
    setIsOffline(false);
    setOfflineSession(null);
  };

  // ========== RENDER ==========

  // --- MILLIONAIRE (dedicated component) ---
  if (millionaireActive) {
    return <MillionaireGame onBack={reset} />;
  }

  // --- DUEL 1v1 (dedicated component) ---
  if (duelActive) {
    return <DuelGame onBack={reset} />;
  }

  // --- LEADERBOARD ---
  if (leaderboardActive) {
    return <LeaderboardView onBack={reset} />;
  }

  // --- PLAYER PROFILE ---
  if (profileActive && player) {
    return <PlayerProfile playerId={player.id} onBack={() => setProfileActive(false)} />;
  }

  // --- QUESTION FORM ---
  if (questionFormActive) {
    return <QuestionForm onBack={reset} />;
  }

  // --- SETUP ---
  if (step === "setup") {
    return (
      <div className="quiz-container">
        <div className="quiz-setup">
          <div>
            <h1 className="quiz-setup__title">{t("setup.title")}</h1>
            <p className="quiz-setup__subtitle">{t("setup.subtitle")}</p>
          </div>
          <button
            className="quiz-mode-btn quiz-mode-btn--primary"
            onClick={() => startGame("millionaire")}
          >
            {t("setup.millionaire")}
          </button>
          <button
            className="quiz-mode-btn"
            onClick={() => startGame("duel")}
          >
            {t("setup.duel")}
          </button>
          <button
            className="quiz-mode-btn"
            onClick={() => startGame("duel-speed")}
          >
            {t("setup.speed")}
          </button>

          {availableTags.length > 0 && (
            <div className="quiz-tag-filter">
              <p className="quiz-tag-filter__label">{t("setup.tagFilter")}</p>
              <div className="choice-chips" style={{ justifyContent: "center" }}>
                {selectedTag && (
                  <button
                    className="choice-chip choice-chip--selected"
                    onClick={() => setSelectedTag("")}
                  >
                    {t("setup.tagAll")}
                  </button>
                )}
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`choice-chip${selectedTag === tag.name ? " choice-chip--selected" : ""}`}
                    onClick={() => setSelectedTag(selectedTag === tag.name ? "" : tag.name)}
                  >
                    {tag.name} ({tag.question_count})
                  </button>
                ))}
              </div>
            </div>
          )}

          <hr style={{ width: "100%", border: "1px solid #333", margin: "0.5rem 0" }} />
          <button
            className="quiz-mode-btn"
            onClick={() => setLeaderboardActive(true)}
          >
            {t("setup.leaderboard")}
          </button>
          {player && (
            <button
              className="quiz-mode-btn"
              onClick={() => setProfileActive(true)}
            >
              {t("setup.profile")}
            </button>
          )}
          <button
            className="quiz-mode-btn"
            onClick={() => setQuestionFormActive(true)}
          >
            {t("setup.newQuestion")}
          </button>
        </div>
      </div>
    );
  }

  // --- RESULT ---
  if (step === "result") {
    const eloDelta = Math.round((player?.elo_score || 1200) - startElo);
    const eloSign = eloDelta >= 0 ? "+" : "";
    return (
      <div className="quiz-container">
        <div className="quiz-result">
          <h1 className="quiz-result__title">{t("result.title")}</h1>
          <div className="quiz-result__score">
            {correctCount} / {questionIds.length}
          </div>
          <p className="quiz-result__details">
            {t("result.correctAnswers")}
          </p>
          {isOffline ? (
            <p className="quiz-result__details" style={{ color: "#4ade80", fontSize: "0.85rem" }}>
              {t("offlineNoElo")}
            </p>
          ) : (
            <p className="quiz-result__details">
              ELO: {Math.round(startElo)} &rarr; {Math.round(player?.elo_score || 1200)}{" "}
              ({eloSign}{eloDelta})
            </p>
          )}
          <button
            className="quiz-mode-btn quiz-mode-btn--primary"
            style={{ marginTop: "1rem" }}
            onClick={reset}
          >
            {t("playAgain")}
          </button>
          {!isOffline && (
            <button
              className="quiz-mode-btn"
              onClick={() => { setStep("setup"); setLeaderboardActive(true); }}
            >
              {t("setup.leaderboard")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- PLAYING ---
  const progress =
    questionIds.length > 0
      ? ((currentIdx + (attempt ? 1 : 0)) / questionIds.length) * 100
      : 0;

  return (
    <div className="quiz-container">
      {/* Progress bar */}
      <div className="quiz-progress">
        <div className="quiz-progress__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-header">
        <button className="quiz-back-btn" onClick={reset} title={t("back")}>
          ←
        </button>
        <div className="quiz-meta">
          <span>{currentIdx + 1}/{questionIds.length}</span>
          {isOffline ? (
            <span style={{ color: "#4ade80", fontSize: "0.75rem" }}>{t("playing.offline")}</span>
          ) : (
            <span>ELO {Math.round(player?.elo_score || 1200)}</span>
          )}
        </div>
        {isSpeedMode && (
          <span className={`quiz-timer ${timeRemaining <= 5 ? "quiz-timer--warn" : "quiz-timer--normal"}`}>
            ⏱ {timeRemaining}s
          </span>
        )}
      </div>

      {currentQuestion && (
        <div className="quiz-question-wrapper" key={slideKey}>
          <div className="quiz-question-card">
            {currentQuestion.media_url && (
              <div className="quiz-media">
                {currentQuestion.media_type === "image" && (
                  <img src={currentQuestion.media_url} alt={t("playing.imgAlt")} className="quiz-media__img" />
                )}
                {currentQuestion.media_type === "video" && (
                  <video src={currentQuestion.media_url} controls className="quiz-media__video" />
                )}
                {currentQuestion.media_type === "document" && (
                  <a href={currentQuestion.media_url} target="_blank" rel="noopener noreferrer" className="quiz-media__link">
                    {t("playing.docLink")}
                  </a>
                )}
              </div>
            )}
            <h2>{currentQuestion.text}</h2>
          </div>

          {/* Answer buttons */}
          <div className="quiz-answers">
            {currentQuestion.answers.map((a, i) => {
              const isCorrect = attempt?.correct_answer_id === a.id;
              const isSelected = selectedAnswer === a.id;
              // On timeout: never mark any answer red — only show correct in green
              const isWrong = isSelected && !attempt?.correct && !timedOut;

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
                  <span className="quiz-answer-btn__label">
                    {ANSWER_LABELS[i] || "?"}
                  </span>
                  {a.text}
                </button>
              );
            })}
          </div>

          {/* Feedback after answer */}
          {attempt && (
            <div className="quiz-feedback">
              <p
                className={`quiz-feedback__result ${attempt.correct ? "quiz-feedback__result--correct" : "quiz-feedback__result--wrong"}`}
              >
                {timedOut ? t("playing.timedOut") : attempt.correct ? t("playing.correct") : t("playing.wrong")}
              </p>
              <p className="quiz-feedback__elo">
                ELO: {Math.round(attempt.player_elo_before)} →{" "}
                {Math.round(attempt.player_elo_after)}
              </p>

              {attempt.note && (
                <div className="quiz-explanation">
                  <div className="quiz-explanation__title">{t("playing.hint")}</div>
                  {attempt.note}
                  <QuestionFeedback onPendingChange={setPendingFeedback} inline />
                </div>
              )}

              {!attempt.note && (
                <QuestionFeedback onPendingChange={setPendingFeedback} />
              )}

              <button className="quiz-next-btn" onClick={nextQuestion}>
                {currentIdx + 1 >= questionIds.length ? t("playing.showResult") : t("playing.nextQuestion")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
