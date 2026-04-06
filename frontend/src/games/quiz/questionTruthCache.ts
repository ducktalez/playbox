/**
 * Question Truth Cache — pre-caches question data (including is_correct)
 * so that questions can be loaded and answers evaluated without server calls.
 *
 * Used by all quiz game modes (Millionaire, Speed, Duel).
 * The cache is populated at game init from the server's /questions response
 * (which includes is_correct) and optionally augmented from IndexedDB.
 */

import { getOfflineQuizQuestions } from "../../core/offlineManager";

// ── Types ────────────────────────────────────────────────────────────

export type AnswerTruth = {
  correctId: string;
  answers: Map<string, boolean>; // answerId → is_correct
  note: string | null;
  fullAnswers: { id: string; text: string; is_correct: boolean }[];
  text: string;
  category: string;
  elo_score: number;
  media_url: string | null;
  media_type: string | null;
};

export type TruthCache = Map<string, AnswerTruth>;

// ── Cache Operations ─────────────────────────────────────────────────

/** Create a new empty truth cache. */
export function createTruthCache(): TruthCache {
  return new Map();
}

/** Add questions from a server /questions list response (items include is_correct). */
export function cacheServerQuestions(cache: TruthCache, items: any[]): void {
  for (const q of items) {
    const correct = q.answers?.find((a: any) => a.is_correct);
    if (correct) {
      cache.set(q.id, {
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
}

/** Merge IndexedDB offline bundle questions into the cache (won't overwrite existing). */
export async function mergeIndexedDBQuestions(cache: TruthCache): Promise<void> {
  try {
    const cached = await getOfflineQuizQuestions();
    for (const q of cached) {
      if (cache.has(q.id)) continue; // server questions take precedence
      const correct = q.answers.find((a) => a.is_correct);
      if (correct) {
        cache.set(q.id, {
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
  } catch { /* IndexedDB unavailable — cache stays as is */ }
}

// ── Display Helpers ──────────────────────────────────────────────────

/** Pick 4 display answers from truth (1 correct + up to 3 wrong, shuffled). */
export function pickDisplayAnswers(truth: AnswerTruth): { id: string; text: string }[] {
  const correct = truth.fullAnswers.filter((a) => a.is_correct);
  const wrong = truth.fullAnswers.filter((a) => !a.is_correct);
  const picked = [
    correct[Math.floor(Math.random() * correct.length)],
    ...wrong.sort(() => Math.random() - 0.5).slice(0, 3),
  ].sort(() => Math.random() - 0.5);
  return picked.map((a) => ({ id: a.id, text: a.text }));
}

/** Build a display-ready question object from truth data. */
export function truthToDisplayQuestion(truth: AnswerTruth, id: string): {
  id: string;
  text: string;
  category: string;
  elo_score: number;
  media_url: string | null;
  media_type: string | null;
  answers: { id: string; text: string }[];
} {
  return {
    id,
    text: truth.text,
    category: truth.category,
    elo_score: truth.elo_score,
    media_url: truth.media_url,
    media_type: truth.media_type,
    answers: pickDisplayAnswers(truth),
  };
}

// ── Evaluation ───────────────────────────────────────────────────────

/** Evaluate an answer from the truth cache. Returns null if question not found. */
export function evaluateFromCache(
  cache: TruthCache,
  questionId: string,
  answerId: string,
): { correct: boolean; correctAnswerId: string; note: string | null } | null {
  const truth = cache.get(questionId);
  if (!truth) return null;
  return {
    correct: truth.answers.get(answerId) ?? false,
    correctAnswerId: truth.correctId,
    note: truth.note,
  };
}

