/**
 * QuestionFeedback — Deferred feedback UI for quiz questions.
 *
 * Collects feedback locally; the parent component is responsible for
 * POSTing the payload when the player advances (e.g. "Nächste Frage").
 *
 * Flow:
 *   idle  → thumbs up (instant pending, toggle off with another tap)
 *   idle  → thumbs down → details (clustered categories + comment) → pending
 *   idle  → report     → details (report categories + comment)    → pending
 *   any   → "← Zurück" resets to idle (discards pending)
 */

import { useState, useEffect, useCallback } from "react";

// --- Types exposed to parent components ---

export type PendingFeedback = {
  feedback_type: "THUMBS_UP" | "THUMBS_DOWN" | "REPORT";
  category: string | null;
  comment: string | null;
};

type FeedbackView = "idle" | "thumbs-down-details" | "report-details";

// --- Category definitions (must match backend THUMBS_DOWN_CATEGORIES / REPORT_CATEGORIES) ---

const PROBLEM_GROUP = [
  { value: "PROBLEM_WITH_QUESTION", label: "Frage" },
  { value: "PROBLEM_WITH_ANSWERS", label: "Antworten" },
];

const DIFFICULTY_GROUP = [
  { value: "TOO_HARD", label: "Zu schwer" },
  { value: "TOO_EASY", label: "Zu leicht" },
];

const EXTRA_GROUP = [
  { value: "NOT_A_GOOD_QUESTION", label: "Keine gute Frage" },
  { value: "DUPLICATE", label: "Duplikat" },
];

const REPORT_GROUP = [
  { value: "QUESTION_INACCURATE", label: "Ungenau" },
  { value: "ANSWER_INCORRECT", label: "Falsch" },
  { value: "OFFENSIVE_CONTENT", label: "Unangemessen" },
  { value: "OTHER", label: "Sonstiges" },
];

// --- Props ---

type Props = {
  /** Called whenever the pending feedback changes (null = cleared). */
  onPendingChange: (payload: PendingFeedback | null) => void;
  /** If true, render icons as a compact vertical strip (for inside explanation box). */
  inline?: boolean;
};

export default function QuestionFeedback({ onPendingChange, inline }: Props) {
  const [view, setView] = useState<FeedbackView>("idle");
  const [pendingType, setPendingType] = useState<PendingFeedback["feedback_type"] | null>(null);

  // Thumbs-down detail selections
  const [problemWith, setProblemWith] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");

  // Report detail selections
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportComment, setReportComment] = useState("");

  // Build comma-separated category set from thumbs-down selections
  const buildThumbsDownCategory = useCallback((): string | null => {
    const parts: string[] = [];
    if (problemWith) parts.push(problemWith);
    if (difficulty) parts.push(difficulty);
    extras.forEach((e) => parts.push(e));
    return parts.length > 0 ? parts.join(",") : null;
  }, [problemWith, difficulty, extras]);

  // Notify parent when pending state changes
  const emitPending = useCallback(
    (payload: PendingFeedback | null) => {
      onPendingChange(payload);
    },
    [onPendingChange],
  );

  // Reset everything to idle
  const resetAll = useCallback(() => {
    setView("idle");
    setPendingType(null);
    setProblemWith(null);
    setDifficulty(null);
    setExtras(new Set());
    setComment("");
    setReportCategory(null);
    setReportComment("");
    emitPending(null);
  }, [emitPending]);

  // --- Handlers ---

  const handleThumbsUp = () => {
    if (pendingType === "THUMBS_UP") {
      // Toggle off
      resetAll();
      return;
    }
    resetAll();
    setPendingType("THUMBS_UP");
    emitPending({ feedback_type: "THUMBS_UP", category: null, comment: null });
  };

  const handleThumbsDown = () => {
    if (view === "thumbs-down-details") {
      resetAll();
      return;
    }
    // Reset any existing pending and open details
    setPendingType(null);
    setReportCategory(null);
    setReportComment("");
    emitPending(null);
    setView("thumbs-down-details");
  };

  const handleReport = () => {
    if (view === "report-details") {
      resetAll();
      return;
    }
    setPendingType(null);
    setProblemWith(null);
    setDifficulty(null);
    setExtras(new Set());
    setComment("");
    emitPending(null);
    setView("report-details");
  };

  // Thumbs-down: update pending whenever detail selections change
  useEffect(() => {
    if (view !== "thumbs-down-details") return;
    const cat = buildThumbsDownCategory();
    const trimmedComment = comment.trim() || null;
    setPendingType("THUMBS_DOWN");
    emitPending({
      feedback_type: "THUMBS_DOWN",
      category: cat,
      comment: trimmedComment,
    });
  }, [view, problemWith, difficulty, extras, comment, buildThumbsDownCategory, emitPending]);

  // Report: update pending whenever detail selections change
  useEffect(() => {
    if (view !== "report-details") return;
    if (!reportCategory) {
      setPendingType("REPORT");
      emitPending(null); // can't submit report without category
      return;
    }
    setPendingType("REPORT");
    emitPending({
      feedback_type: "REPORT",
      category: reportCategory,
      comment: reportComment.trim() || null,
    });
  }, [view, reportCategory, reportComment, emitPending]);

  const toggleExtra = (value: string) => {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // --- Render: Icon bar (always visible) ---
  const iconBar = (
    <div className={`q-feedback__icons${inline ? " q-feedback__icons--inline" : ""}`}>
      <button
        className={`q-feedback__btn q-feedback__btn--up${pendingType === "THUMBS_UP" ? " q-feedback__btn--active-up" : ""}`}
        onClick={handleThumbsUp}
        title="Gute Frage"
      >
        👍
      </button>
      <button
        className={`q-feedback__btn q-feedback__btn--down${pendingType === "THUMBS_DOWN" ? " q-feedback__btn--active-down" : ""}${view === "thumbs-down-details" ? " q-feedback__btn--open" : ""}`}
        onClick={handleThumbsDown}
        title="Schlechte Frage"
      >
        👎
      </button>
      <button
        className={`q-feedback__btn q-feedback__btn--report${pendingType === "REPORT" ? " q-feedback__btn--active-report" : ""}${view === "report-details" ? " q-feedback__btn--open" : ""}`}
        onClick={handleReport}
        title="Frage melden"
      >
        🚩
      </button>
    </div>
  );

  // --- Render: Segmented pill helper ---
  const segmentedPill = (
    options: { value: string; label: string }[],
    selected: string | null,
    onSelect: (value: string | null) => void,
  ) => (
    <div className="q-pill">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          className={`q-pill__seg${selected === opt.value ? " q-pill__seg--on" : ""}${i === 0 ? " q-pill__seg--first" : ""}${i === options.length - 1 ? " q-pill__seg--last" : ""}`}
          onClick={() => onSelect(selected === opt.value ? null : opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const toggleChips = (
    options: { value: string; label: string }[],
    selected: Set<string>,
    onToggle: (value: string) => void,
  ) => (
    <div className="q-feedback__chips-row">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`q-feedback__mini-chip${selected.has(opt.value) ? " q-feedback__mini-chip--on" : ""}`}
          onClick={() => onToggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // --- Render: Thumbs-down details ---
  if (view === "thumbs-down-details") {
    return (
      <div className="q-feedback q-feedback--details">
        {iconBar}
        <div className="q-feedback__detail-panel">
          <div className="q-feedback__groups">
            <div className="q-feedback__group">
              <span className="q-feedback__group-label">Problem</span>
              {segmentedPill(PROBLEM_GROUP, problemWith, setProblemWith)}
            </div>
            <div className="q-feedback__group">
              <span className="q-feedback__group-label">Schwierigkeit</span>
              {segmentedPill(DIFFICULTY_GROUP, difficulty, setDifficulty)}
            </div>
            <div className="q-feedback__group">
              <span className="q-feedback__group-label">Weitere</span>
              {toggleChips(EXTRA_GROUP, extras, toggleExtra)}
            </div>
          </div>
          <div className="q-feedback__footer">
            <input
              className="q-feedback__comment"
              type="text"
              placeholder="Kommentar (optional)"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button className="q-feedback__back" onClick={resetAll}>← Zurück</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Report details ---
  if (view === "report-details") {
    return (
      <div className="q-feedback q-feedback--details">
        {iconBar}
        <div className="q-feedback__detail-panel">
          <div className="q-feedback__groups">
            <div className="q-feedback__group">
              <span className="q-feedback__group-label">Grund</span>
              {segmentedPill(REPORT_GROUP, reportCategory, setReportCategory)}
            </div>
          </div>
          <div className="q-feedback__footer">
            <input
              className="q-feedback__comment"
              type="text"
              placeholder="Kommentar (optional)"
              maxLength={500}
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
            />
            <button className="q-feedback__back" onClick={resetAll}>← Zurück</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Idle (just icons) ---
  return (
    <div className="q-feedback q-feedback--idle">
      {iconBar}
    </div>
  );
}

