/**
 * Question Submission Form
 *
 * Allows users to add new quiz questions with:
 * - Question text + optional explanation
 * - One correct answer + 1-3 wrong answers
 * - Category selection (from existing categories)
 * - Comma-separated tags
 */

import { useState, useEffect } from "react";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/quiz`
    : "/api/v1/quiz";

type CategoryOut = {
  id: string;
  name: string;
  description: string;
  question_count: number;
};

export default function QuestionForm({ onBack }: { onBack: () => void }) {
  // Form state
  const [text, setText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [wrongAnswers, setWrongAnswers] = useState(["", "", ""]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");

  // UI state
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetch(`${API_BASE}/categories`)
      .then((res) => res.json())
      .then((data) => setCategories(data))
      .catch(() => {});
  }, []);

  const updateWrongAnswer = (index: number, value: string) => {
    setWrongAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    // Validation
    if (!text.trim()) {
      setErrorMsg("Bitte Fragetext eingeben.");
      return;
    }
    if (!correctAnswer.trim()) {
      setErrorMsg("Bitte die richtige Antwort eingeben.");
      return;
    }
    const filledWrong = wrongAnswers.filter((a) => a.trim());
    if (filledWrong.length < 1) {
      setErrorMsg("Mindestens eine falsche Antwort eingeben.");
      return;
    }

    const answers = [
      { text: correctAnswer.trim(), is_correct: true },
      ...filledWrong.map((a) => ({ text: a.trim(), is_correct: false })),
    ];

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload: Record<string, unknown> = {
      text: text.trim(),
      answers,
      tags,
    };
    if (explanation.trim()) {
      payload.explanation = explanation.trim();
    }
    if (categoryId) {
      payload.category_id = categoryId;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Fehler: ${res.status}`);
      }

      setSuccessMsg("✓ Frage erfolgreich hinzugefügt!");
      // Reset form
      setText("");
      setExplanation("");
      setCorrectAnswer("");
      setWrongAnswers(["", "", ""]);
      setTagsInput("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quiz-container">
      <div className="quiz-form">
        <div className="quiz-form__header">
          <button className="quiz-back-btn" onClick={onBack} title="Zurück">
            ←
          </button>
          <h1 className="quiz-form__title">Neue Frage erstellen</h1>
        </div>

        <form onSubmit={handleSubmit} className="quiz-form__body">
          {/* Question text */}
          <label className="quiz-form__label">
            Fragetext *
            <textarea
              className="quiz-form__textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="z.B. Wie heißt der Drachenlord mit bürgerlichem Namen?"
              rows={3}
              maxLength={1000}
              required
            />
          </label>

          {/* Correct answer */}
          <label className="quiz-form__label">
            Richtige Antwort *
            <input
              className="quiz-form__input quiz-form__input--correct"
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="z.B. Rainer Winkler"
              maxLength={500}
              required
            />
          </label>

          {/* Wrong answers */}
          <fieldset className="quiz-form__fieldset">
            <legend className="quiz-form__legend">
              Falsche Antworten (min. 1, max. 3)
            </legend>
            {wrongAnswers.map((wa, i) => (
              <input
                key={i}
                className="quiz-form__input quiz-form__input--wrong"
                type="text"
                value={wa}
                onChange={(e) => updateWrongAnswer(i, e.target.value)}
                placeholder={`Falsche Antwort ${i + 1}`}
                maxLength={500}
              />
            ))}
          </fieldset>

          {/* Explanation (optional) */}
          <label className="quiz-form__label">
            Erklärung (optional)
            <textarea
              className="quiz-form__textarea"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Wird nach Beantwortung angezeigt"
              rows={2}
              maxLength={2000}
            />
          </label>

          {/* Category */}
          <label className="quiz-form__label">
            Kategorie
            <select
              className="quiz-form__select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— Keine Kategorie —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.question_count})
                </option>
              ))}
            </select>
          </label>

          {/* Tags */}
          <label className="quiz-form__label">
            Tags (kommagetrennt)
            <input
              className="quiz-form__input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="z.B. drachenlord, basics, identity"
            />
          </label>

          {/* Messages */}
          {errorMsg && <p className="quiz-form__error">{errorMsg}</p>}
          {successMsg && <p className="quiz-form__success">{successMsg}</p>}

          {/* Submit */}
          <button
            className="quiz-mode-btn quiz-mode-btn--primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Wird gespeichert..." : "Frage absenden"}
          </button>
        </form>
      </div>
    </div>
  );
}

