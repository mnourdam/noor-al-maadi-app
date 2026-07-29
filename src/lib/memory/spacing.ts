// ============================================================
// Memory Engine — Spaced repetition curve
// ------------------------------------------------------------
// Deliberately simple. SM-2 with fixed intervals — matches the
// player-facing promise ("2, 4, 7, 14, 30, 60, 120 أيام").
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_DAYS = [2, 4, 7, 14, 30, 60, 120] as const;

export interface ItemHistoryEntry {
  itemId: string;
  correctStreak: number;
  lastAttemptCorrect: boolean | null;
  lastAttemptAt: number | null;
  nextDueAt: number | null;
  seen: number;
}

export function nextAfterCorrect(entry: ItemHistoryEntry, now: number): ItemHistoryEntry {
  const streak = Math.min(entry.correctStreak + 1, INTERVAL_DAYS.length);
  const days = INTERVAL_DAYS[Math.max(0, streak - 1)];
  return {
    ...entry,
    correctStreak: streak,
    lastAttemptCorrect: true,
    lastAttemptAt: now,
    nextDueAt: now + days * DAY_MS,
    seen: entry.seen + 1,
  };
}

export function nextAfterWrong(entry: ItemHistoryEntry, now: number): ItemHistoryEntry {
  return {
    ...entry,
    correctStreak: 0,
    lastAttemptCorrect: false,
    lastAttemptAt: now,
    nextDueAt: now + 2 * DAY_MS,
    seen: entry.seen + 1,
  };
}

export function isDue(entry: ItemHistoryEntry | null, now: number): boolean {
  if (!entry || entry.nextDueAt == null) return true;
  return entry.nextDueAt <= now;
}
