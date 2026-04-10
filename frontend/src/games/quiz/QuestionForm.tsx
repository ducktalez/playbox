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
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { quizTranslations } from "./translations";

const translations = mergeTranslations(coreTranslations, quizTranslations);

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
  const { t } = useTranslation(translations);

  // Form state
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [wrongAnswers, setWrongAnswers] = useState(["", "", ""]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);

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

    if (!text.trim()) {
      setErrorMsg(t("form.errorText"));
      return;
    }
    if (!correctAnswer.trim()) {
      setErrorMsg(t("form.errorCorrect"));
      return;
    }
    const filledWrong = wrongAnswers.filter((a) => a.trim());
    if (filledWrong.length < 1) {
      setErrorMsg(t("form.errorWrong"));
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
    if (note.trim()) {
      payload.note = note.trim();
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

      const created = await res.json();

      // Upload media file if selected
      if (mediaFile) {
        const formData = new FormData();
        formData.append("file", mediaFile);
        const mediaRes = await fetch(`${API_BASE}/questions/${created.id}/media`, {
          method: "POST",
          body: formData,
        });
        if (!mediaRes.ok) {
          const mediaErr = await mediaRes.json().catch(() => ({}));
          console.warn("Media upload failed:", mediaErr.detail || mediaRes.status);
        }
      }

      setSuccessMsg(t("form.success"));
      // Reset form
      setText("");
      setNote("");
      setCorrectAnswer("");
      setWrongAnswers(["", "", ""]);
      setTagsInput("");
      setMediaFile(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t("form.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quiz-container">
      <div className="quiz-form">
        <div className="quiz-form__header">
          <button className="quiz-back-btn" onClick={onBack} title={t("back")}>
            ←
          </button>
          <h1 className="quiz-form__title">{t("form.title")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="quiz-form__body">
          {/* Question text */}
          <label className="quiz-form__label">
            {t("form.questionText")}
            <textarea
              className="quiz-form__textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("form.questionPlaceholder")}
              rows={3}
              maxLength={1000}
              required
            />
          </label>

          {/* Correct answer */}
          <label className="quiz-form__label">
            {t("form.correctAnswer")}
            <input
              className="quiz-form__input quiz-form__input--correct"
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder={t("form.correctPlaceholder")}
              maxLength={500}
              required
            />
          </label>

          {/* Wrong answers */}
          <fieldset className="quiz-form__fieldset">
            <legend className="quiz-form__legend">
              {t("form.wrongAnswers")}
            </legend>
            {wrongAnswers.map((wa, i) => (
              <input
                key={i}
                className="quiz-form__input quiz-form__input--wrong"
                type="text"
                value={wa}
                onChange={(e) => updateWrongAnswer(i, e.target.value)}
                placeholder={t("form.wrongPlaceholder", { n: i + 1 })}
                maxLength={500}
              />
            ))}
          </fieldset>

          {/* Note / Hinweis (optional) */}
          <label className="quiz-form__label">
            {t("form.note")}
            <textarea
              className="quiz-form__textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("form.notePlaceholder")}
              rows={2}
              maxLength={2000}
            />
          </label>

          {/* Category */}
          <label className="quiz-form__label">
            {t("form.category")}
            <select
              className="quiz-form__select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t("form.noCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.question_count})
                </option>
              ))}
            </select>
          </label>

          {/* Tags */}
          <label className="quiz-form__label">
            {t("form.tags")}
            <input
              className="quiz-form__input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("form.tagsPlaceholder")}
            />
          </label>

          {/* Media upload (optional) */}
          <label className="quiz-form__label">
            {t("form.media")}
            <input
              className="quiz-form__input"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,application/pdf"
              onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
            />
            {mediaFile && (
              <span style={{ fontSize: "0.85rem", color: "#aaa" }}>
                {mediaFile.name} ({(mediaFile.size / 1024).toFixed(0)} KB)
              </span>
            )}
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
            {submitting ? t("form.saving") : t("form.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
