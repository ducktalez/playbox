/**
 * Offline Manager — central IndexedDB cache for all game data.
 *
 * Syncs offline bundles from the backend on app start (when online) and
 * provides typed accessors for each game module.  Games fall back to
 * cached data when the server is unreachable.
 */

import { openDB, type IDBPDatabase } from "idb";

// ── Types ────────────────────────────────────────────────────────────

export type OfflineWord = {
  id: string;
  text: string;
  category: string;
  source: string;
  uploaded_by: string | null;
  description: string | null;
};

export type OfflineChallenge = {
  text: string;
  category: string;
  intensity: string;
  target_count: number;
};

export type OfflineQuizAnswer = {
  id: string;
  text: string;
  is_correct: boolean;
};

export type OfflineQuizQuestion = {
  id: string;
  text: string;
  note: string | null;
  category: string | null;
  tags: string[];
  elo_score: number;
  difficulty: string | null;
  is_pun: boolean;
  media_url: string | null;
  media_type: string | null;
  answers: OfflineQuizAnswer[];
};

type OfflineMeta = {
  key: string;
  synced_at: string;    // ISO timestamp of last successful sync
  item_count: number;
};


// ── Database ─────────────────────────────────────────────────────────

const DB_NAME = "playbox_offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("imposter_words")) {
          db.createObjectStore("imposter_words", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("imposter_categories")) {
          db.createObjectStore("imposter_categories", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("piccolo_challenges")) {
          db.createObjectStore("piccolo_challenges", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("piccolo_categories")) {
          db.createObjectStore("piccolo_categories", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("quiz_questions")) {
          db.createObjectStore("quiz_questions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("quiz_categories")) {
          db.createObjectStore("quiz_categories", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("quiz_tags")) {
          db.createObjectStore("quiz_tags", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("offline_meta")) {
          db.createObjectStore("offline_meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function clearAndPut<T>(storeName: string, items: T[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName, "readwrite");
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return (await db.getAll(storeName)) as T[];
}

async function setMeta(key: string, itemCount: number): Promise<void> {
  const db = await getDb();
  const entry: OfflineMeta = { key, synced_at: new Date().toISOString(), item_count: itemCount };
  await db.put("offline_meta", entry);
}

async function getMeta(key: string): Promise<OfflineMeta | undefined> {
  const db = await getDb();
  return (await db.get("offline_meta", key)) as OfflineMeta | undefined;
}

// ── Sync Functions ───────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function syncImposter(): Promise<void> {
  try {
    const bundle = await fetchJson<{ words: OfflineWord[]; categories: string[] }>(
      "/api/v1/imposter/offline-bundle",
    );
    await clearAndPut("imposter_words", bundle.words);
    await clearAndPut("imposter_categories", bundle.categories.map((c, i) => ({ id: i, name: c })));
    await setMeta("imposter", bundle.words.length);

    // Also keep localStorage cache in sync for existing offlineSession.ts
    try {
      localStorage.setItem("imposter_words_cache", JSON.stringify(bundle.words));
    } catch { /* full */ }
  } catch {
    // Offline — existing cache stays valid
  }
}

export async function syncPiccolo(): Promise<void> {
  try {
    const bundle = await fetchJson<{ challenges: OfflineChallenge[]; categories: string[] }>(
      "/api/v1/piccolo/offline-bundle",
    );
    await clearAndPut("piccolo_challenges", bundle.challenges.map((c, i) => ({ ...c, _id: i })));
    await clearAndPut("piccolo_categories", bundle.categories.map((c, i) => ({ id: i, name: c })));
    await setMeta("piccolo", bundle.challenges.length);

    // Also keep localStorage cache in sync for existing offlineSession.ts
    try {
      localStorage.setItem("piccolo_challenges_cache", JSON.stringify(bundle.challenges));
    } catch { /* full */ }
  } catch {
    // Offline — existing cache stays valid
  }
}

export async function syncQuiz(): Promise<void> {
  try {
    const bundle = await fetchJson<{
      questions: OfflineQuizQuestion[];
      categories: { id: string; name: string }[];
      tags: { id: string; name: string }[];
      total: number;
    }>("/api/v1/quiz/offline-bundle");
    await clearAndPut("quiz_questions", bundle.questions);
    await clearAndPut("quiz_categories", bundle.categories);
    await clearAndPut("quiz_tags", bundle.tags);
    await setMeta("quiz", bundle.questions.length);
  } catch {
    // Offline — existing cache stays valid
  }
}

/** Sync all game bundles. Call on app start when online. */
export async function syncAllOfflineData(): Promise<void> {
  await Promise.allSettled([syncImposter(), syncPiccolo(), syncQuiz()]);
}

// ── Read Functions ───────────────────────────────────────────────────

export async function getOfflineImposterWords(): Promise<OfflineWord[]> {
  return getAll<OfflineWord>("imposter_words");
}

export async function getOfflineImposterCategories(): Promise<string[]> {
  const items = await getAll<{ id: number; name: string }>("imposter_categories");
  return items.map((c) => c.name);
}

export async function getOfflinePiccoloChallenges(): Promise<OfflineChallenge[]> {
  return getAll<OfflineChallenge>("piccolo_challenges");
}

export async function getOfflinePiccoloCategories(): Promise<string[]> {
  const items = await getAll<{ id: number; name: string }>("piccolo_categories");
  return items.map((c) => c.name);
}

export async function getOfflineQuizQuestions(): Promise<OfflineQuizQuestion[]> {
  return getAll<OfflineQuizQuestion>("quiz_questions");
}

export async function getOfflineQuizCategories(): Promise<{ id: string; name: string }[]> {
  return getAll<{ id: string; name: string }>("quiz_categories");
}

export async function getOfflineQuizTags(): Promise<{ id: string; name: string }[]> {
  return getAll<{ id: string; name: string }>("quiz_tags");
}

// ── Status ───────────────────────────────────────────────────────────

export type OfflineStatus = {
  game: string;
  available: boolean;
  itemCount: number;
  syncedAt: string | null;
};

export async function getOfflineStatus(): Promise<OfflineStatus[]> {
  const games = ["imposter", "piccolo", "quiz"];
  const statuses: OfflineStatus[] = [];
  for (const game of games) {
    const meta = await getMeta(game);
    statuses.push({
      game,
      available: !!meta && meta.item_count > 0,
      itemCount: meta?.item_count ?? 0,
      syncedAt: meta?.synced_at ?? null,
    });
  }
  return statuses;
}

