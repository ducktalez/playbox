/**
 * "Wer wird Elite-Haider" — Millionaire Mode
 *
 * Full WWM-style interface:
 * - Prize ladder (15 levels, €50 → €1 Million)
 * - Safety marks at levels 5 (€500) and 10 (€16,000)
 * - Three jokers: 50:50, Audience Poll, Phone (Drachenlord)
 * - Game Over on wrong answer (falls back to last safety)
 * - Sound effects served from /media/sounds/wwm/
 * - Kandidaten-Auswahlfrage (ordering question) before main game
 *   → correct answer earns an extra life (usable up to €32,000)
 *
 * SOUND NOTE: intro.mp3 is currently NOT used because we jump straight
 * to the Kandidaten-Auswahlfrage (ordering question). The question-low
 * background music starts immediately instead. Whether a dedicated intro
 * screen or intro music should be added needs to be decided later.
 * See also: README.md "Ablage/TODOs".
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import QuestionFeedback, { type PendingFeedback } from "./QuestionFeedback";
import {
  createOfflineQuizSession,
  getCurrentQuestion as getOfflineCurrentQ,
} from "./offlineSession";
import { getOfflineQuizQuestions } from "../../core/offlineManager";

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

// --- Sound System ---
// Two independent audio layers:
//   1. Background music (BG) – one looping track at a time; new BG stops old BG.
//   2. Sound effects (SFX) – play on top of BG without interrupting it.
// Within each layer, only one track plays at a time by default. SFX can
// overlap with BG, but a new SFX of the same "role" stops the previous one
// explicitly (e.g. after-correct interrupts lock-in).
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

// One-shot / short-loop sound effects
const sfx = {
  intro: createAudio("intro.mp3"), // NOTE: currently unused, see file header
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
  afterSelection: createAudio("after-selection.mp3"), // plays after correct candidate is selected (ordering phase)
  afterSafety: createAudio("after-safety.mp3"),
  win: createAudio("win.mp3"),
  win2: createAudio("win-2.mp3"),
  outro: createAudio("outro.mp3"),
};

let currentBg: HTMLAudioElement | null = null;

// Module-level volume state (synced from React state via useEffect)
let _audioVolume = 0.8;
let _audioMuted = false;

/** Apply current volume/mute to every audio element. */
function applyVolumeToAll() {
  const effectiveVol = _audioMuted ? 0 : _audioVolume;
  [...Object.values(bgTracks), ...Object.values(sfx)].forEach((a) => {
    a.volume = effectiveVol;
  });
}

/** Return the background track appropriate for the given level. */
function getBgTrack(level: number): HTMLAudioElement {
  if (level <= 5) return bgTracks.low;
  if (level <= 10) return bgTracks.mid;
  if (level <= 14) return bgTracks.high;
  return bgTracks.million;
}

/** Stop only the background music. SFX keep playing. */
function stopBg() {
  if (currentBg) {
    currentBg.pause();
    currentBg.currentTime = 0;
    currentBg = null;
  }
}

/**
 * Start tier-appropriate background music.
 * If the correct track for `level` is already playing, this is a no-op
 * (keeps the music uninterrupted, important for levels 1-5).
 */
function playBg(level: number) {
  const track = getBgTrack(level);
  if (currentBg === track && !track.paused) return; // already playing the right track
  stopBg();
  track.currentTime = 0;
  track.volume = _audioMuted ? 0 : _audioVolume;
  track.play().catch(() => {});
  currentBg = track;
}

/** Play a sound effect on top of whatever is currently playing. */
function playSfx(audio: HTMLAudioElement) {
  audio.volume = _audioMuted ? 0 : _audioVolume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/** Stop a specific SFX track (e.g. stop lock-in when after-correct starts). */
function stopSfxTrack(audio: HTMLAudioElement) {
  audio.pause();
  audio.currentTime = 0;
}

/** Stop ALL sfx tracks (cleanup). */
function stopAllSfx() {
  Object.values(sfx).forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
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
  media_url: string | null; media_type: string | null;
  answers: { id: string; text: string }[];
};
type AttemptOut = {
  correct: boolean; correct_answer_id: string; note: string | null;
  player_elo_before: number; player_elo_after: number;
  question_elo_before: number; question_elo_after: number;
};
type AudiencePollEntry = { answer_id: string; percentage: number };
type PhoneHint = { hint_answer_id: string; confidence: number; message: string };
type OrderingQuestionOut = { id: string; text: string; shuffled_answers: string[] };

/** Max level (inclusive) at which the extra life from the ordering question works. */
const EXTRA_LIFE_MAX_LEVEL = 11; // €32,000

/** Time limit for the ordering question (in milliseconds). */
const ORDERING_TIME_LIMIT_MS = 30_000;

/** Live countdown timer for the ordering question. */
function OrderingTimer({
  startTime,
  limitMs,
  onTimeout,
}: {
  startTime: number;
  limitMs: number;
  onTimeout: () => void;
}) {
  const [remaining, setRemaining] = useState(limitMs);
  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, limitMs - (Date.now() - startTime));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onTimeout();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, limitMs, onTimeout]);
  const secs = remaining / 1000;
  const urgent = secs <= 5;
  return (
    <div className={`wwm-ordering__timer${urgent ? " wwm-ordering__timer--urgent" : ""}`}>
      {secs.toFixed(1)}s
    </div>
  );
}

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

  // Volume control
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // --- Ordering question (Kandidaten-Auswahlfrage) ---
  const [orderingPhase, setOrderingPhase] = useState(true);
  const [orderingReady, setOrderingReady] = useState(false); // "Bereit" pressed?
  const [orderingQ, setOrderingQ] = useState<OrderingQuestionOut | null>(null);
  const [orderingSelected, setOrderingSelected] = useState<string[]>([]);
  const [orderingTimerStart, setOrderingTimerStart] = useState<number | null>(null);
  const [orderingTimerMs, setOrderingTimerMs] = useState<number | null>(null);
  const [orderingResult, setOrderingResult] = useState<{ correct: boolean; correct_order: string[] } | null>(null);
  const [orderingChecking, setOrderingChecking] = useState(false);
  const [orderingTimedOut, setOrderingTimedOut] = useState(false);

  // Extra life: earned by solving ordering question correctly
  const [hasExtraLife, setHasExtraLife] = useState(false);
  const [extraLifeUsed, setExtraLifeUsed] = useState(false);
  // Tracks the wrong answer ID after using extra life — shown as red+disabled but still visible
  const [extraLifeWrongId, setExtraLifeWrongId] = useState<string | null>(null);

  // Deferred question feedback
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);
  // Game-over is deferred: player sees feedback flow first, then advances to game-over screen
  const [gameOverPending, setGameOverPending] = useState(false);

  // Offline mode
  const [isOffline, setIsOffline] = useState(false);

  // Reason the game ended due to offline — shown on game-over screen
  const [offlineEndReason, setOfflineEndReason] = useState<string | null>(null);

  // Pre-cached answer truth — maps questionId → full question data including is_correct.
  // Populated at game init from (a) the server's /questions response AND (b) IndexedDB bundle.
  type AnswerTruth = {
    correctId: string;
    answers: Map<string, boolean>;
    note: string | null;
    fullAnswers: { id: string; text: string; is_correct: boolean }[];
    text: string;
    category: string;
    elo_score: number;
    media_url: string | null;
    media_type: string | null;
  };
  const answerTruthRef = useRef<Map<string, AnswerTruth>>(new Map());

  /** Build the answer truth cache from IndexedDB (merges into existing entries). */
  const buildAnswerTruthCache = async () => {
    try {
      const cached = await getOfflineQuizQuestions();
      for (const q of cached) {
        if (answerTruthRef.current.has(q.id)) continue; // game questions take precedence
        const correct = q.answers.find((a) => a.is_correct);
        if (correct) {
          answerTruthRef.current.set(q.id, {
            correctId: correct.id,
            answers: new Map(q.answers.map((a) => [a.id, a.is_correct])),
            note: q.note,
            fullAnswers: q.answers,
            text: q.text,
            category: q.category ?? "",
            elo_score: q.elo_score,
            media_url: q.media_url,
            media_type: q.media_type,
          });
        }
      }
    } catch { /* IndexedDB unavailable — cache stays empty */ }
  };

  /** Add questions from a server response (with is_correct) to the truth cache. */
  const cacheGameQuestions = (items: any[]) => {
    for (const q of items) {
      const correct = q.answers?.find((a: any) => a.is_correct);
      if (correct) {
        answerTruthRef.current.set(q.id, {
          correctId: correct.id,
          answers: new Map(q.answers.map((a: any) => [a.id, a.is_correct])),
          note: q.note ?? null,
          fullAnswers: q.answers,
          text: q.text,
          category: q.category ?? "",
          elo_score: q.elo_score ?? 0,
          media_url: q.media_url ?? null,
          media_type: q.media_type ?? null,
        });
      }
    }
  };

  // Sync React volume state → module-level variables → all audio elements
  useEffect(() => {
    _audioVolume = volume;
    _audioMuted = muted;
    applyVolumeToAll();
  }, [volume, muted]);

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
      stopBg();
      stopAllSfx();
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
        // Fetch ordering question for Kandidaten-Auswahlfrage
        const oqRes = await fetch(`${API_BASE}/ordering-question?language=de`);
        if (oqRes.ok) {
          const oqData: OrderingQuestionOut = await oqRes.json();
          setOrderingQ(oqData);
          setOrderingPhase(true);
          setOrderingReady(false); // Show question first, wait for "Bereit"
          setLoading(false);
          // BG music starts when the player presses "Bereit" (see startOrdering)
          return; // Wait for ordering phase to complete before loading main game
        }
        // If no ordering questions exist, skip to main game
        setOrderingPhase(false);
        await initMainGame();
      } catch {
        // Server unreachable — skip ordering phase and try offline main game
        setOrderingPhase(false);
        await initMainGame();
      }
    };
    init();
    return () => stopBg();
  }, [initTrigger]);

  /** Initialize player, session, and questions for the main game. */
  const initMainGame = async () => {
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

      const qRes = await fetch(`${API_BASE}/questions?order_by_elo=asc&balanced_categories=true&limit=15&language=de&pun_first=true&randomize=true`);
      if (!qRes.ok) throw new Error(`Questions: ${qRes.status}`);
      const qData = await qRes.json();
      const ids = qData.items.map((q: { id: string }) => q.id);
      if (ids.length === 0) { alert("Keine Fragen vorhanden!"); onBack(); return; }

      // Cache the 15 game questions from the server response (includes is_correct).
      // These are the questions we'll actually play — they MUST be in the truth cache
      // so offline evaluation works if the server drops mid-game.
      cacheGameQuestions(qData.items);
      // Augment with IndexedDB offline bundle (for any extra questions)
      await buildAnswerTruthCache();

      setQuestionIds(ids);
      setLoading(false);
      // BG music will be started by loadQuestion — no intro sound
      loadQuestion(ids[0], 1);
    } catch (e) {
      // Backend unreachable — try offline fallback
      await buildAnswerTruthCache(); // populate truth cache from IndexedDB
      const offSess = await createOfflineQuizSession("millionaire", 15);
      if (offSess && offSess.questions.length > 0) {
        setIsOffline(true);
        const ids = offSess.questions.map((q) => q.id);
        setQuestionIds(ids);
        setLoading(false);
        // Load first question from offline cache
        const q = getOfflineCurrentQ(offSess);
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
          playBg(1);
        }
      } else {
        alert(`Fehler: ${e instanceof Error ? e.message : e}\n\nKeine Offline-Daten verfügbar.`);
        onBack();
      }
    }
  };

  // --- Load Question ---
  // Cache-first: all 15 game questions are pre-cached in answerTruthRef at init.
  // The server is NEVER needed for individual question fetches.
  const loadQuestion = async (id: string, level: number) => {
    setSelectedAnswer(null);
    setAttempt(null);
    setFiftyFiftyRemoved(new Set());
    setAudiencePoll(null);
    setPhoneHint(null);
    setPhoneSecondChance(false);
    setExtraLifeWrongId(null);
    setSlideKey((k) => k + 1);

    // 1. Always use the pre-built truth cache (populated from server response at initMainGame)
    const truth = answerTruthRef.current.get(id);
    if (truth) {
      // Build 4-answer display: 1 correct + up to 3 wrong, shuffled
      const correct = truth.fullAnswers.filter((a) => a.is_correct);
      const wrong = truth.fullAnswers.filter((a) => !a.is_correct);
      const picked = [
        correct[Math.floor(Math.random() * correct.length)],
        ...wrong.sort(() => Math.random() - 0.5).slice(0, 3),
      ].sort(() => Math.random() - 0.5);
      setCurrentQuestion({
        id,
        text: truth.text,
        category: truth.category,
        elo_score: truth.elo_score,
        media_url: truth.media_url,
        media_type: truth.media_type,
        answers: picked.map((a) => ({ id: a.id, text: a.text })),
      });
      playBg(level);
      return;
    }

    // 2. Truth cache miss — try IndexedDB as fallback
    try {
      const allQ = await getOfflineQuizQuestions();
      const offQ = allQ.find((q) => q.id === id);
      if (offQ) {
        const correctAns = offQ.answers.find((a) => a.is_correct);
        if (correctAns) {
          // Cache for future submitAnswer lookups
          answerTruthRef.current.set(id, {
            correctId: correctAns.id,
            answers: new Map(offQ.answers.map((a) => [a.id, a.is_correct])),
            note: offQ.note,
            fullAnswers: offQ.answers,
            text: offQ.text,
            category: offQ.category ?? "",
            elo_score: offQ.elo_score,
            media_url: offQ.media_url,
            media_type: offQ.media_type,
          });
          const wrong = offQ.answers.filter((a) => !a.is_correct);
          const picked = [
            correctAns,
            ...wrong.sort(() => Math.random() - 0.5).slice(0, 3),
          ].sort(() => Math.random() - 0.5);
          setCurrentQuestion({
            id,
            text: offQ.text,
            category: offQ.category ?? "",
            elo_score: offQ.elo_score,
            media_url: offQ.media_url,
            media_type: offQ.media_type,
            answers: picked.map((a) => ({ id: a.id, text: a.text })),
          });
          setIsOffline(true);
          playBg(level);
          return;
        }
      }
    } catch { /* IndexedDB unavailable */ }

    // 3. Last resort: try server directly
    try {
      const res = await fetch(`${API_BASE}/questions/${id}?num_answers=4`);
      if (!res.ok) throw new Error(`Question fetch failed: ${res.status}`);
      setCurrentQuestion(await res.json());
      playBg(level);
    } catch {
      // Question not in any cache AND server unreachable — game cannot continue
      setIsOffline(true);
      stopBg();
      setOfflineEndReason(
        "Verbindung zum Server verloren. Für diese Stufe ist keine gecachte Frage verfügbar."
      );
      setGameOver(true);
      playSfx(sfx.outro);
    }
  };

  // --- Ordering question interaction ---
  /** Player pressed "Bereit" — show answers and start countdown. */
  const startOrdering = useCallback(() => {
    setOrderingReady(true);
    setOrderingTimerStart(Date.now());
    // Play BG music when the real challenge starts
    playBg(1);
  }, []);

  /** Timer ran out before all answers were selected. */
  const handleOrderingTimeout = useCallback(() => {
    if (orderingResult || orderingChecking) return; // already resolved
    setOrderingTimedOut(true);
    const elapsed = orderingTimerStart ? Date.now() - orderingTimerStart : ORDERING_TIME_LIMIT_MS;
    setOrderingTimerMs(elapsed);
    // If the player already placed all answers, check them; otherwise treat as wrong
    if (orderingQ && orderingSelected.length === orderingQ.shuffled_answers.length) {
      checkOrdering(orderingSelected, elapsed);
    } else {
      // Not all placed — automatic fail; still fetch correct order for display
      checkOrdering(
        orderingQ
          ? [...orderingSelected, ...orderingQ.shuffled_answers.filter((a) => !orderingSelected.includes(a))]
          : orderingSelected,
        elapsed,
      );
    }
  }, [orderingResult, orderingChecking, orderingTimerStart, orderingQ, orderingSelected]);

  const orderingSelectAnswer = (answer: string) => {
    if (orderingResult || orderingChecking || orderingTimedOut) return;
    if (orderingSelected.includes(answer)) return;

    const newSelected = [...orderingSelected, answer];
    setOrderingSelected(newSelected);

    // Auto-check when all answers have been selected
    if (orderingQ && newSelected.length === orderingQ.shuffled_answers.length) {
      const elapsed = orderingTimerStart ? Date.now() - orderingTimerStart : 0;
      setOrderingTimerMs(elapsed);
      checkOrdering(newSelected, elapsed);
    }
  };

  const orderingReset = () => {
    if (orderingResult || orderingChecking || orderingTimedOut) return;
    setOrderingSelected([]);
    // Timer keeps running — no restart on reset (measures total time from question appearance)
  };

  const checkOrdering = async (submitted: string[], elapsed: number) => {
    if (!orderingQ) return;
    setOrderingChecking(true);
    try {
      const res = await fetch(`${API_BASE}/ordering-question/${orderingQ.id}/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submitted_order: submitted, time_taken_ms: elapsed }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrderingResult(data);
        if (data.correct) {
          setHasExtraLife(true);
          playSfx(getCorrectSfx(1));
          // after-selection jingle: plays after the correct candidate is selected
          setTimeout(() => playSfx(sfx.afterSelection), 1200);
        } else {
          playSfx(getWrongSfx(1));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOrderingChecking(false);
    }
  };

  const finishOrderingPhase = async () => {
    setOrderingPhase(false);
    setLoading(true);
    await initMainGame();
  };

  // --- Submit Answer ---
  const submitAnswer = useCallback(
    async (answerId: string) => {
      if (selectedAnswer || revealing || !currentQuestion) return;
      setSelectedAnswer(answerId);
      setRevealing(true);

      // Levels 1-5: BG music keeps playing; Levels 6+: stop BG for suspense
      if (currentLevel > 5) {
        stopBg();
      }

      playSfx(sfx.lockIn);

      // Offline mode — evaluate locally
      if (isOffline) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        stopSfxTrack(sfx.lockIn);

        // Try pre-cached truth first, then IndexedDB
        const truth = answerTruthRef.current.get(currentQuestion.id);
        let isCorrect: boolean;
        let correctAnswerId: string;
        let note: string | null;

        if (truth) {
          isCorrect = truth.answers.get(answerId) ?? false;
          correctAnswerId = truth.correctId;
          note = truth.note;
        } else {
          const allQ = await getOfflineQuizQuestions();
          const offQ = allQ.find((q) => q.id === currentQuestion.id);
          if (offQ) {
            const correctAns = offQ.answers.find((a) => a.is_correct);
            const selectedAns = offQ.answers.find((a) => a.id === answerId);
            isCorrect = selectedAns?.is_correct ?? false;
            correctAnswerId = correctAns?.id ?? "";
            note = offQ.note;
          } else {
            // Question not in any cache — cannot evaluate
            setRevealing(false);
            setSelectedAnswer(null);
            return;
          }
        }

        const att: AttemptOut = {
          correct: isCorrect,
          correct_answer_id: correctAnswerId,
          note,
          player_elo_before: 1200,
          player_elo_after: 1200,
          question_elo_before: 1200,
          question_elo_after: 1200,
        };

        setAttempt(att);
        setRevealing(false);

        if (isCorrect) {
          if (currentLevel >= 15) {
            stopBg();
            setGameWon(true);
            playSfx(sfx.win);
          } else {
            playSfx(getCorrectSfx(currentLevel));
            if (SAFETY_LEVELS.has(currentLevel)) {
              const safetySfx = currentLevel === 5 ? sfx.safety1 : sfx.safety2;
              setTimeout(() => {
                if (currentLevel === 5) stopBg();
                playSfx(safetySfx);
              }, 1500);
              setCelebratingSafety(currentLevel as 5 | 10);
            }
          }
        } else {
          if (hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL) {
            // Extra life still available
          } else {
            playSfx(getWrongSfx(currentLevel));
            setGameOverPending(true);
          }
        }
        return;
      }

      if (!player || !session) { setRevealing(false); return; }

      try {
        const res = await fetch(`${API_BASE}/questions/${currentQuestion.id}/attempt`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer_id: answerId, player_id: player.id, session_id: session.id,
          }),
        });
        if (!res.ok) { setRevealing(false); return; }
        const att: AttemptOut = await res.json();

        // 1.8-second suspense pause
        await new Promise((resolve) => setTimeout(resolve, 1800));
        stopSfxTrack(sfx.lockIn);

        setAttempt(att);
        setRevealing(false);
        setPlayer((p) => p ? { ...p, elo_score: att.player_elo_after } : p);

        if (att.correct) {
          if (currentLevel >= 15) {
            // Million question: single win sound (no correctMillion + win overlap)
            stopBg();
            setGameWon(true);
            playSfx(sfx.win);
          } else {
            playSfx(getCorrectSfx(currentLevel));
            if (SAFETY_LEVELS.has(currentLevel)) {
              const safetySfx = currentLevel === 5 ? sfx.safety1 : sfx.safety2;
              setTimeout(() => {
                // At €500 mark: stop BG music → silence after safety jingle
                if (currentLevel === 5) stopBg();
                playSfx(safetySfx);
              }, 1500);
              setCelebratingSafety(currentLevel as 5 | 10);
            }
          }
        } else {
          // Phone joker second chance
          if (phoneSecondChance) {
            // Feedback UI shows retry button
          } else if (hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL) {
            // Extra life from ordering question — feedback UI shows retry button
          } else {
            playSfx(getWrongSfx(currentLevel));
            setGameOverPending(true);
          }
        }
      } catch {
        // Server unreachable mid-game — evaluate locally
        await new Promise((resolve) => setTimeout(resolve, 1800));
        stopSfxTrack(sfx.lockIn);

        // Try pre-cached truth first, then IndexedDB
        const truth = answerTruthRef.current.get(currentQuestion.id);
        let isCorrect: boolean;
        let correctAnswerId: string;
        let note: string | null;

        if (truth) {
          isCorrect = truth.answers.get(answerId) ?? false;
          correctAnswerId = truth.correctId;
          note = truth.note;
        } else {
          const allQ = await getOfflineQuizQuestions();
          const offQ = allQ.find((q) => q.id === currentQuestion.id);
          if (offQ) {
            const correctAns = offQ.answers.find((a) => a.is_correct);
            const selectedAns = offQ.answers.find((a) => a.id === answerId);
            isCorrect = selectedAns?.is_correct ?? false;
            correctAnswerId = correctAns?.id ?? "";
            note = offQ.note;
          } else {
            // Question not in any cache — cannot evaluate, skip gracefully
            setRevealing(false);
            setSelectedAnswer(null);
            setIsOffline(true);
            return;
          }
        }

        const att: AttemptOut = {
          correct: isCorrect,
          correct_answer_id: correctAnswerId,
          note,
          player_elo_before: player?.elo_score ?? 1200,
          player_elo_after: player?.elo_score ?? 1200,
          question_elo_before: 1200,
          question_elo_after: 1200,
        };

        setAttempt(att);
        setRevealing(false);
        setIsOffline(true);

        if (isCorrect) {
          if (currentLevel >= 15) {
            stopBg();
            setGameWon(true);
            playSfx(sfx.win);
          } else {
            playSfx(getCorrectSfx(currentLevel));
            if (SAFETY_LEVELS.has(currentLevel)) {
              const safetySfx = currentLevel === 5 ? sfx.safety1 : sfx.safety2;
              setTimeout(() => {
                if (currentLevel === 5) stopBg();
                playSfx(safetySfx);
              }, 1500);
              setCelebratingSafety(currentLevel as 5 | 10);
            }
          }
        } else {
          if (hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL) {
            // Extra life still available
          } else {
            playSfx(getWrongSfx(currentLevel));
            setGameOverPending(true);
          }
        }
      }
    },
    [selectedAnswer, revealing, currentQuestion, player, session, phoneSecondChance, currentLevel, hasExtraLife, extraLifeUsed, isOffline],
  );

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

  // --- Next Question ---
  const nextQuestion = async () => {
    flushFeedback();

    // If game-over was deferred, now transition to the game-over screen
    if (gameOverPending) {
      setGameOverPending(false);
      setGameOver(true);
      if (session) {
        await fetch(`${API_BASE}/sessions/${session.id}/finish`, { method: "POST" });
      }
      playSfx(sfx.outro);
      return;
    }

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
    // after-correct transition sound only plays above €500 (level 6+)
    if (currentLevel >= 6) {
      stopSfxTrack(sfx.lockIn);
      playSfx(sfx.afterCorrect);
    }
    setCurrentIdx(nextIdx);
    loadQuestion(questionIds[nextIdx], nextIdx + 1);
  };

  // --- Retry with phone second chance ---
  const retryWithSecondChance = () => {
    if (selectedAnswer) {
      setFiftyFiftyRemoved((prev) => new Set([...prev, selectedAnswer]));
    }
    setSelectedAnswer(null);
    setAttempt(null);
    setPhoneSecondChance(false);
    playBg(currentLevel);
  };

  // --- Retry with extra life from ordering question ---
  const retryWithExtraLife = () => {
    // Track the wrong answer — it stays visible but marked red+disabled (all 4 answers remain)
    if (selectedAnswer) {
      setExtraLifeWrongId(selectedAnswer);
    }
    setSelectedAnswer(null);
    setAttempt(null);
    setExtraLifeUsed(true);
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

  // --- Ordering Phase (Kandidaten-Auswahlfrage) ---
  if (orderingPhase && orderingQ) {
    return (
      <div className="wwm-container">
        <div className="wwm-header">
          <button className="wwm-back" onClick={onBack} title="Zurück">←</button>
          <span className="wwm-ordering-title">Kandidaten-Auswahlfrage</span>
          <div className="wwm-header-right">
            <div className="wwm-volume">
              <button
                className="wwm-volume__btn"
                onClick={() => setMuted((m) => !m)}
                title={muted ? "Ton einschalten" : "Ton ausschalten"}
              >
                {muted ? "🔇" : volume < 0.3 ? "🔈" : volume < 0.7 ? "🔉" : "🔊"}
              </button>
              <input
                type="range" className="wwm-volume__slider"
                min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (v > 0 && muted) setMuted(false);
                  if (v === 0) setMuted(true);
                }}
              />
            </div>
          </div>
        </div>

        <div className="wwm-ordering">
          <div className="wwm-ordering__question">{orderingQ.text}</div>

          {/* Phase 1: Read the question, then press "Bereit" */}
          {!orderingReady && (
            <div className="wwm-ordering__ready">
              <p className="wwm-ordering__ready-hint">
                Du hast <strong>{ORDERING_TIME_LIMIT_MS / 1000} Sekunden</strong> Zeit, die Antworten in die richtige Reihenfolge zu bringen.
              </p>
              <button className="wwm-btn wwm-btn--primary wwm-ordering__ready-btn" onClick={startOrdering}>
                Bereit!
              </button>
            </div>
          )}

          {/* Phase 2: Answers + countdown */}
          {orderingReady && (
            <>
              <div className="wwm-ordering__body">
                <div className="wwm-ordering__selected">
                  {orderingSelected.map((a, i) => {
                    const isCorrectPos = orderingResult && orderingResult.correct_order[i] === a;
                    return (
                      <div
                        key={`sel-${i}`}
                        className={`wwm-ordering__slot wwm-ordering__slot--filled${orderingResult ? (isCorrectPos ? " wwm-ordering__slot--correct" : " wwm-ordering__slot--wrong") : ""}`}
                      >
                        <span className="wwm-ordering__slot-num">{i + 1}.</span>
                        <span className="wwm-ordering__slot-text">{a}</span>
                      </div>
                    );
                  })}
                  {Array.from(
                    { length: orderingQ.shuffled_answers.length - orderingSelected.length },
                    (_, i) => (
                      <div key={`empty-${i}`} className="wwm-ordering__slot wwm-ordering__slot--empty">
                        <span className="wwm-ordering__slot-num">{orderingSelected.length + i + 1}.</span>
                        <span className="wwm-ordering__slot-text">—</span>
                      </div>
                    ),
                  )}
                </div>
                <div className="wwm-ordering__choices">
                  {!orderingResult && !orderingTimedOut && (
                    <>
                      {orderingQ.shuffled_answers.map((a) => {
                        const isUsed = orderingSelected.includes(a);
                        return (
                          <button
                            key={a}
                            className={`wwm-ordering__choice${isUsed ? " wwm-ordering__choice--used" : ""}`}
                            onClick={() => orderingSelectAnswer(a)}
                            disabled={isUsed || orderingChecking}
                          >
                            {a}
                          </button>
                        );
                      })}
                      <button
                        className="wwm-ordering__reset"
                        onClick={orderingReset}
                        disabled={orderingSelected.length === 0 || orderingChecking}
                        title="Auswahl zurücksetzen"
                      >↺ Reset</button>
                    </>
                  )}
                </div>
              </div>

              {orderingTimerStart && !orderingResult && !orderingTimedOut && (
                <OrderingTimer startTime={orderingTimerStart} limitMs={ORDERING_TIME_LIMIT_MS} onTimeout={handleOrderingTimeout} />
              )}
              {orderingTimerMs !== null && orderingResult && (
                <div className="wwm-ordering__timer">{(orderingTimerMs / 1000).toFixed(1)}s</div>
              )}
              {orderingTimedOut && !orderingResult && (
                <div className="wwm-ordering__timer wwm-ordering__timer--urgent">⏰ Zeit abgelaufen!</div>
              )}
            </>
          )}

          {orderingResult && (
            <div className="wwm-ordering__result">
              {orderingResult.correct ? (
                <>
                  <p className="wwm-ordering__result-text wwm-ordering__result-text--correct">
                    ✓ Richtig! Du erhältst ein Extra-Leben!
                  </p>
                  <p className="wwm-ordering__result-hint">
                    Du darfst bis €32.000 eine Frage falsch beantworten und es nochmal versuchen.
                  </p>
                </>
              ) : (
                <>
                  <p className="wwm-ordering__result-text wwm-ordering__result-text--wrong">
                    ✗ Leider falsch!
                  </p>
                  <div className="wwm-ordering__correct-order">
                    <p>Richtige Reihenfolge:</p>
                    {orderingResult.correct_order.map((a, i) => (
                      <div key={i} className="wwm-ordering__slot wwm-ordering__slot--correct">
                        <span className="wwm-ordering__slot-num">{i + 1}.</span>
                        <span className="wwm-ordering__slot-text">{a}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button className="wwm-btn wwm-btn--primary" onClick={finishOrderingPhase}>
                Weiter zum Spiel →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Game Over / Won ---
  if (gameOver || gameWon) {
    const finalPrize = gameWon ? PRIZE_LADDER[14].prize : getSafetyPrize();

    const replay = () => {
      stopBg();
      stopAllSfx();
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
      setOrderingPhase(true);
      setOrderingReady(false);
      setOrderingQ(null);
      setOrderingSelected([]);
      setOrderingTimerStart(null);
      setOrderingTimerMs(null);
      setOrderingResult(null);
      setOrderingChecking(false);
      setOrderingTimedOut(false);
      setHasExtraLife(false);
      setExtraLifeUsed(false);
      setExtraLifeWrongId(null);
      setPendingFeedback(null);
      setGameOverPending(false);
      setIsOffline(false);
      setOfflineEndReason(null);
      setLoading(true);
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
            <p className="wwm-result__safety">Gesichert bei: {getSafetyPrize()}</p>
          )}
          <p className="wwm-result__elo">
            {isOffline ? "📴 Offline — kein ELO-Tracking" : `ELO: ${Math.round(player?.elo_score || 1200)}`}
          </p>
          {offlineEndReason && (
            <p className="wwm-result__offline-msg" style={{ color: "#facc15", fontSize: "0.85rem", marginTop: "0.5rem" }}>
              📴 {offlineEndReason}
            </p>
          )}
          <div className="wwm-result__actions">
            <button className="wwm-btn wwm-btn--primary" onClick={replay}>
              🔄 Nochmal spielen
            </button>
            <button className="wwm-btn" onClick={onBack}>Zurück zum Menü</button>
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

      {/* Header: Back + Jokers + Prize + Volume */}
      <div className="wwm-header">
        <button className="wwm-back" onClick={onBack} title="Zurück">←</button>
        <div className="wwm-jokers">
          <button
            className={`wwm-joker ${jokerFiftyUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerFiftyUsed || !!attempt || isOffline}
            onClick={useFiftyFifty}
            title={isOffline ? "50:50 — Offline nicht verfügbar" : "50:50"}
          >50:50</button>
          <button
            className={`wwm-joker ${jokerAudienceUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerAudienceUsed || !!attempt || isOffline}
            onClick={useAudience}
            title={isOffline ? "Publikumsjoker — Offline nicht verfügbar" : "Publikumsjoker"}
          >👥</button>
          <button
            className={`wwm-joker ${jokerPhoneUsed ? "wwm-joker--used" : ""}`}
            disabled={jokerPhoneUsed || !!attempt || isOffline}
            onClick={usePhone}
            title={isOffline ? "Telefonjoker — Offline nicht verfügbar" : "Telefonjoker"}
          >📞</button>
          {hasExtraLife && (
            <span
              className={`wwm-joker wwm-joker--extra-life${extraLifeUsed ? " wwm-joker--used" : ""}`}
              title={extraLifeUsed ? "Extra-Leben verbraucht" : "Extra-Leben (bis €32.000)"}
            >🛡️</span>
          )}
          {isOffline && (
            <span className="wwm-joker" style={{ color: "#4ade80", fontSize: "0.7rem", cursor: "default" }} title="Offline-Modus — kein ELO-Tracking">📴</span>
          )}
        </div>
        <div className="wwm-header-right">
          <span className="wwm-level-badge">{PRIZE_LADDER[currentIdx]?.prize}</span>
          <div className="wwm-volume">
            <button
              className="wwm-volume__btn"
              onClick={() => setMuted((m) => !m)}
              title={muted ? "Ton einschalten" : "Ton ausschalten"}
              aria-label={muted ? "Ton einschalten" : "Ton ausschalten"}
            >
              {muted ? "🔇" : volume < 0.3 ? "🔈" : volume < 0.7 ? "🔉" : "🔊"}
            </button>
            <input
              type="range" className="wwm-volume__slider"
              min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (v > 0 && muted) setMuted(false);
                if (v === 0) setMuted(true);
              }}
              aria-label="Lautstärke"
            />
          </div>
        </div>
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
                  <span className="wwm-phone-bubble__conf">Sicherheit: {phoneHint.confidence}%</span>
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
                            <div className="wwm-audience__bar-fill" style={{ width: `${entry.percentage}%` }} />
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
                {currentQuestion.media_url && (
                  <div className="wwm-media">
                    {currentQuestion.media_type === "image" && (
                      <img src={currentQuestion.media_url} alt="Frage-Bild" className="wwm-media__img" />
                    )}
                    {currentQuestion.media_type === "video" && (
                      <video src={currentQuestion.media_url} controls className="wwm-media__video" />
                    )}
                    {currentQuestion.media_type === "document" && (
                      <a href={currentQuestion.media_url} target="_blank" rel="noopener noreferrer" className="wwm-media__link">
                        📄 Dokument anzeigen
                      </a>
                    )}
                  </div>
                )}
                <div className="wwm-question-card__text">{currentQuestion.text}</div>
              </div>

              {/* Answer Buttons */}
              <div className="wwm-answers">
                {visibleAnswers.map((a) => {
                  const globalIdx = currentQuestion.answers.indexOf(a);
                  const isSelected = selectedAnswer === a.id;
                  const isCorrect = attempt?.correct_answer_id === a.id;
                  const isWrong = isSelected && attempt && !attempt.correct;
                  const isExtraLifeWrong = extraLifeWrongId === a.id;

                  // When wrong answer triggers a retry scenario (phone/extra life),
                  // do NOT reveal the correct answer in green
                  const isRetryScenario = attempt && !attempt.correct && (
                    phoneSecondChance ||
                    (hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL)
                  );

                  let stateClass = "";
                  if (isExtraLifeWrong) {
                    // Previously wrong answer from extra life — stays red+disabled
                    stateClass = "wwm-answer--wrong";
                  } else if (attempt) {
                    if (isCorrect && !isRetryScenario) stateClass = "wwm-answer--correct";
                    else if (isWrong) stateClass = "wwm-answer--wrong";
                    else if (isSelected) stateClass = "wwm-answer--selected";
                  } else if (isSelected) {
                    stateClass = revealing ? "wwm-answer--selected wwm-answer--revealing" : "wwm-answer--selected";
                  }

                  return (
                    <button
                      key={a.id}
                      className={`wwm-answer ${stateClass}`}
                      disabled={!!attempt || revealing || isExtraLifeWrong}
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
                  {/* Result text — always shown */}
                  {attempt.correct ? (
                    <p className="wwm-feedback__text wwm-feedback__text--correct">
                      ✓ Richtig! {PRIZE_LADDER[currentIdx]?.prize} gesichert!
                    </p>
                  ) : (
                    <p className="wwm-feedback__text wwm-feedback__text--wrong">
                      {phoneSecondChance
                        ? "✗ Falsch — aber dein Telefonjoker gibt dir eine 2. Chance!"
                        : hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL
                          ? "✗ Falsch — aber dein Extra-Leben rettet dich!"
                          : "✗ Leider falsch!"}
                    </p>
                  )}

                  {/* Explanation note + feedback icons — always shown */}
                  {attempt.note ? (
                    <div className="wwm-explanation">
                      <div className="wwm-explanation__title">💡 Hinweis</div>
                      {attempt.note}
                      <QuestionFeedback
                        onPendingChange={setPendingFeedback}
                        inline
                      />
                    </div>
                  ) : (
                    <QuestionFeedback
                      onPendingChange={setPendingFeedback}
                    />
                  )}

                  {/* Game-over pending: show safety prize info */}
                  {gameOverPending && (
                    <p className="wwm-feedback__safety">
                      Du gehst mit {getSafetyPrize()} nach Hause.
                    </p>
                  )}

                  {/* Action buttons — depends on scenario */}
                  {attempt.correct ? (
                    <button className="wwm-btn wwm-btn--primary" onClick={nextQuestion}>
                      {currentLevel >= 15 ? "🏆 Gewinn einlösen" : "Nächste Frage →"}
                    </button>
                  ) : phoneSecondChance ? (
                    <button className="wwm-btn wwm-btn--primary" onClick={retryWithSecondChance}>
                      Nochmal versuchen
                    </button>
                  ) : hasExtraLife && !extraLifeUsed && currentLevel <= EXTRA_LIFE_MAX_LEVEL ? (
                    <button className="wwm-btn wwm-btn--primary" onClick={retryWithExtraLife}>
                      🛡️ Extra-Leben einsetzen
                    </button>
                  ) : (
                    <button className="wwm-btn wwm-btn--primary" onClick={nextQuestion}>
                      Weiter
                    </button>
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

