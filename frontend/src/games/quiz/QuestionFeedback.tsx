/**
 * QuestionFeedback — Reusable feedback UI for quiz questions.
 *
 * Shown on the answer explanation screen in all game modes.
 * Flow: idle → selected (thumbs up/down/report) → category (follow-up chips) → submitted
 */

import { useState } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type FeedbackType = "THUMBS_UP" | "THUMBS_DOWN" | "REPORT";
type FeedbackState = "idle" | "category" | "submitted";

const THUMBS_DOWN_CATEGORIES: { value: string; label: string }[] = [
  { value: "PROBLEM_WITH_QUESTION", label: "Problem mit Frage" },
  { value: "PROBLEM_WITH_ANSWERS", label: "Problem mit Antworten" },
  { value: "TOO_HARD", label: "Zu schwer" },
  { value: "TOO_EASY", label: "Zu leicht" },
  { value: "NOT_A_GOOD_QUESTION", label: "Keine gute Frage" },
  { value: "DUPLICATE", label: "Duplikat" },
];

const REPORT_CATEGORIES: { value: string; label: string }[] = [
  { value: "QUESTION_INACCURATE", label: "Frage ungenau" },
  { value: "ANSWER_INCORRECT", label: "Antwort falsch" },
  { value: "OFFENSIVE_CONTENT", label: "Unangemessener Inhalt" },
  { value: "OTHER", label: "Sonstiges" },
];

const THUMBS_UP_CATEGORIES: { value: string; label: string }[] = [
  { value: "GREAT_QUESTION", label: "Tolle Frage!" },
  { value: "LEARNED_SOMETHING", label: "Was gelernt!" },
];

type Props = {
  questionId: string;
  playerId?: string | null;
  sessionId?: string | null;
};

export default function QuestionFeedback({ questionId, playerId, sessionId }: Props) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState("");

  const submitFeedback = async (type: FeedbackType, category?: string) => {
    try {
      const body: Record<string, unknown> = { feedback_type: type };
      if (category) body.category = category;
      if (playerId) body.player_id = playerId;
      if (sessionId) body.session_id = sessionId;

      await fetch(`${API_BASE}/questions/${questionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setState("submitted");
      setSubmittedMessage(
        type === "THUMBS_UP" ? "👍 Danke!" :
        type === "THUMBS_DOWN" ? "👎 Feedback gesendet" :
        "🚩 Gemeldet"
      );
    } catch {
      setState("submitted");
      setSubmittedMessage("Fehler beim Senden");
    }
  };

  const handleThumbsUp = () => {
    setSelectedType("THUMBS_UP");
    setState("category");
  };

  const handleThumbsDown = () => {
    setSelectedType("THUMBS_DOWN");
    setState("category");
  };

  const handleReport = () => {
    setSelectedType("REPORT");
    setState("category");
  };

  const handleCategorySelect = (category: string) => {
    if (selectedType) {
      submitFeedback(selectedType, category);
    }
  };

  const handleSkipCategory = () => {
    if (selectedType === "THUMBS_UP") {
      submitFeedback("THUMBS_UP");
    }
  };

  const getCategories = (): { value: string; label: string }[] => {
    if (selectedType === "THUMBS_DOWN") return THUMBS_DOWN_CATEGORIES;
    if (selectedType === "REPORT") return REPORT_CATEGORIES;
    if (selectedType === "THUMBS_UP") return THUMBS_UP_CATEGORIES;
    return [];
  };

  if (state === "submitted") {
    return (
      <div className="q-feedback q-feedback--submitted">
        <span className="q-feedback__done">{submittedMessage}</span>
      </div>
    );
  }

  if (state === "category") {
    const categories = getCategories();
    return (
      <div className="q-feedback q-feedback--category">
        <p className="q-feedback__prompt">
          {selectedType === "THUMBS_UP" && "Was hat dir gefallen?"}
          {selectedType === "THUMBS_DOWN" && "Was war das Problem?"}
          {selectedType === "REPORT" && "Was möchtest du melden?"}
        </p>
        <div className="q-feedback__chips">
          {categories.map((c) => (
            <button
              key={c.value}
              className="q-feedback__chip"
              onClick={() => handleCategorySelect(c.value)}
            >
              {c.label}
            </button>
          ))}
          {selectedType === "THUMBS_UP" && (
            <button
              className="q-feedback__chip q-feedback__chip--skip"
              onClick={handleSkipCategory}
            >
              Überspringen
            </button>
          )}
          <button
            className="q-feedback__chip q-feedback__chip--back"
            onClick={() => { setState("idle"); setSelectedType(null); }}
          >
            ← Zurück
          </button>
        </div>
      </div>
    );
  }

  // idle state
  return (
    <div className="q-feedback q-feedback--idle">
      <div className="q-feedback__actions">
        <button
          className="q-feedback__btn q-feedback__btn--up"
          onClick={handleThumbsUp}
          title="Gute Frage"
        >
          👍
        </button>
        <button
          className="q-feedback__btn q-feedback__btn--down"
          onClick={handleThumbsDown}
          title="Schlechte Frage"
        >
          👎
        </button>
        <button
          className="q-feedback__btn q-feedback__btn--report"
          onClick={handleReport}
          title="Frage melden"
        >
          🚩
        </button>
      </div>
    </div>
  );
}

