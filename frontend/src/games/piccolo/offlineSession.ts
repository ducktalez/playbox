/**
 * Piccolo Offline Fallback — local game sessions when backend is unreachable.
 */

type ChallengeTemplate = {
  text: string;
  category: string;
  intensity: string;
  target_count: number;
};

export type OfflineSession = {
  id: string;
  player_names: string[];
  intensity: string;
  total_challenges: number;
  challenges: ChallengeTemplate[];
  index: number;
};

type ChallengeResult = {
  text: string;
  category: string;
  intensity: string;
  targets: string[];
};

const STORAGE_KEY = "piccolo_challenges_cache";
const INTENSITY_INCLUDES: Record<string, string[]> = {
  mild: ["mild"],
  medium: ["mild", "medium"],
  spicy: ["mild", "medium", "spicy"],
};

export function cacheChallenges(challenges: ChallengeTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(challenges));
  } catch {
    // Storage full — skip
  }
}

export function getCachedChallenges(): ChallengeTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ChallengeTemplate[];
  } catch {
    // Corrupted
  }
  return [];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function balanceByCategory(challenges: ChallengeTemplate[]): ChallengeTemplate[] {
  const buckets: Record<string, ChallengeTemplate[]> = {};
  for (const c of challenges) {
    (buckets[c.category] ??= []).push(c);
  }
  for (const b of Object.values(buckets)) shuffle(b);
  const order = shuffle(Object.keys(buckets));
  const result: ChallengeTemplate[] = [];
  let more = true;
  while (more) {
    more = false;
    for (const cat of order) {
      if (buckets[cat].length) {
        result.push(buckets[cat].pop()!);
        more = true;
      }
    }
  }
  return result;
}

function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createOfflineSession(
  playerNames: string[],
  intensity: string,
  categories: string[] | null,
): OfflineSession | null {
  const all = getCachedChallenges();
  if (!all.length) return null;

  const allowed = INTENSITY_INCLUDES[intensity] ?? ["mild", "medium"];
  let filtered = all.filter((c) => allowed.includes(c.intensity));
  if (categories?.length) {
    filtered = filtered.filter((c) => categories.includes(c.category));
  }
  if (!filtered.length) return null;

  return {
    id: randomUUID(),
    player_names: playerNames,
    intensity,
    total_challenges: filtered.length,
    challenges: balanceByCategory(filtered),
    index: 0,
  };
}

export function nextOfflineChallenge(session: OfflineSession): ChallengeResult | null {
  if (!session.challenges.length) return null;

  const idx = session.index % session.challenges.length;
  session.index = idx + 1;
  const t = session.challenges[idx];
  const players = session.player_names;
  const targets: string[] = [];
  let text = t.text;

  if (t.target_count >= 1) {
    const p1 = players[Math.floor(Math.random() * players.length)];
    text = text.replace("{player}", p1);
    targets.push(p1);
  }
  if (t.target_count >= 2) {
    const rest = players.filter((p) => p !== targets[0]);
    const pool = rest.length ? rest : players;
    const p2 = pool[Math.floor(Math.random() * pool.length)];
    text = text.replace("{player2}", p2);
    targets.push(p2);
  }

  return { text, category: t.category, intensity: t.intensity, targets };
}

