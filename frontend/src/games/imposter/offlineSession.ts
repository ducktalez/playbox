/**
 * Imposter Offline Fallback — creates local game sessions when backend is unreachable.
 *
 * Uses the cached word list (fetched from GET /api/v1/imposter/words) to run
 * the game entirely on the client when offline.
 */

type WordEntry = {
  id: string;
  text: string;
  category: string;
  source: string;
  uploaded_by: string | null;
  description: string | null;
};

type OfflineSession = {
  id: string;
  player_names: string[];
  word: string;
  word_details: WordEntry;
  imposter_index: number;
  timer_seconds: number;
};

const STORAGE_KEY = "imposter_words_cache";

/** Save word list to localStorage for offline use. */
export function cacheWordList(words: WordEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {
    // Storage full or unavailable — silently skip
  }
}

/** Load cached word list from localStorage. */
export function getCachedWordList(): WordEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WordEntry[];
  } catch {
    // Corrupted data — return empty
  }
  return [];
}

/** Generate a pseudo-random UUID v4 (good enough for offline sessions). */
function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Create a local Imposter session from the cached word list. */
export function createOfflineSession(
  playerNames: string[],
  category: string | null,
  timerSeconds: number,
): OfflineSession | null {
  const allWords = getCachedWordList();
  if (allWords.length === 0) return null;

  const filtered = category
    ? allWords.filter((w) => w.category.toLowerCase() === category.toLowerCase())
    : allWords;
  const pool = filtered.length > 0 ? filtered : allWords;

  const word = pool[Math.floor(Math.random() * pool.length)];
  const imposterIndex = Math.floor(Math.random() * playerNames.length);

  return {
    id: randomUUID(),
    player_names: playerNames,
    word: word.text,
    word_details: word,
    imposter_index: imposterIndex,
    timer_seconds: timerSeconds,
  };
}

/** Compute what a player sees offline — the word or "IMPOSTER". */
export function revealOffline(
  session: OfflineSession,
  playerIndex: number,
): { player_name: string; display: string } {
  const isImposter = playerIndex === session.imposter_index;
  return {
    player_name: session.player_names[playerIndex],
    display: isImposter ? "🕵️ IMPOSTER" : session.word,
  };
}

