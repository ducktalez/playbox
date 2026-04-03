/**
 * Quiz Offline Session — play quiz games entirely from cached data.
 *
 * When the backend is unreachable the frontend falls back to questions
 * stored in IndexedDB (synced via the OfflineManager).  No ELO tracking
 * happens — this is a practice / offline mode.
 */

import {
  getOfflineQuizQuestions,
  type OfflineQuizQuestion,
} from "../../core/offlineManager";

export type OfflineQuizSession = {
  questions: OfflineQuizQuestion[];
  currentIndex: number;
  correctCount: number;
  mode: string;
};

/** Shuffle an array in-place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Create an offline quiz session from cached questions. Returns null if no data. */
export async function createOfflineQuizSession(
  mode: "speed" | "millionaire",
  limit?: number,
): Promise<OfflineQuizSession | null> {
  const all = await getOfflineQuizQuestions();
  if (all.length === 0) return null;

  const count = limit ?? (mode === "millionaire" ? 15 : 10);
  const shuffled = shuffle([...all]);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // Sort by elo for millionaire (easy → hard), random for speed
  if (mode === "millionaire") {
    selected.sort((a, b) => a.elo_score - b.elo_score);
  }

  // Trim to 4 answers (1 correct + up to 3 wrong) and shuffle for each question
  for (const q of selected) {
    const correct = q.answers.filter((a) => a.is_correct);
    const wrong = q.answers.filter((a) => !a.is_correct);
    const picked = [
      correct[Math.floor(Math.random() * correct.length)],
      ...shuffle([...wrong]).slice(0, 3),
    ];
    q.answers = shuffle(picked);
  }

  return {
    questions: selected,
    currentIndex: 0,
    correctCount: 0,
    mode,
  };
}

/** Get the current question. */
export function getCurrentQuestion(
  session: OfflineQuizSession,
): OfflineQuizQuestion | null {
  if (session.currentIndex >= session.questions.length) return null;
  return session.questions[session.currentIndex];
}

/** Check an answer and advance the session. Returns result info. */
export function submitOfflineAnswer(
  session: OfflineQuizSession,
  answerId: string,
): {
  correct: boolean;
  correctAnswerId: string;
  note: string | null;
} {
  const question = session.questions[session.currentIndex];
  const correctAnswer = question.answers.find((a) => a.is_correct);
  const selectedAnswer = question.answers.find((a) => a.id === answerId);
  const isCorrect = selectedAnswer?.is_correct ?? false;

  if (isCorrect) {
    session.correctCount++;
  }

  return {
    correct: isCorrect,
    correctAnswerId: correctAnswer?.id ?? "",
    note: question.note,
  };
}

/** Advance to the next question. Returns true if there are more. */
export function advanceOfflineSession(session: OfflineQuizSession): boolean {
  session.currentIndex++;
  return session.currentIndex < session.questions.length;
}

/** Check if offline quiz data is available. */
export async function hasOfflineQuizData(): Promise<boolean> {
  const questions = await getOfflineQuizQuestions();
  return questions.length > 0;
}

