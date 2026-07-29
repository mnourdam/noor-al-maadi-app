// ============================================================
// Memory Engine — Attempt history + daily counter + grant ledger
// ------------------------------------------------------------
// Partitioned per owner automatically by `src/lib/identity/partition`.
// Nothing here writes to campaign / profile / hearts state.
// ============================================================

import type { ItemHistoryEntry } from "./spacing";

const HISTORY_KEY = "irth.memory.history.v1";
const DAILY_CAP = 3;

interface HistoryFile {
  version: 1;
  items: Record<string, ItemHistoryEntry>;
  daily: Record<string, number>;             // "YYYY-MM-DD" → count
  grantedAttemptIds: string[];               // rolling, last 500 kept
}

function empty(): HistoryFile {
  return { version: 1, items: {}, daily: {}, grantedAttemptIds: [] };
}

function read(): HistoryFile {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as HistoryFile;
    if (!parsed || parsed.version !== 1) return empty();
    return {
      version: 1,
      items: parsed.items ?? {},
      daily: parsed.daily ?? {},
      grantedAttemptIds: parsed.grantedAttemptIds ?? [],
    };
  } catch {
    return empty();
  }
}

function write(file: HistoryFile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(file));
  } catch { /* ignore */ }
}

export function getEntry(itemId: string): ItemHistoryEntry | null {
  const f = read();
  return f.items[itemId] ?? null;
}

export function allEntries(): Record<string, ItemHistoryEntry> {
  return read().items;
}

export function upsertEntry(entry: ItemHistoryEntry): void {
  const f = read();
  f.items[entry.itemId] = entry;
  write(f);
}

function todayKey(now: number): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailyCount(now: number): number {
  const f = read();
  return f.daily[todayKey(now)] ?? 0;
}

export function bumpDaily(now: number): void {
  const f = read();
  const k = todayKey(now);
  f.daily[k] = (f.daily[k] ?? 0) + 1;
  // Prune old daily keys (>60 days).
  const cutoff = now - 60 * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(f.daily)) {
    const t = new Date(key).getTime();
    if (Number.isFinite(t) && t < cutoff) delete f.daily[key];
  }
  write(f);
}

export function hasGranted(attemptId: string): boolean {
  return read().grantedAttemptIds.includes(attemptId);
}

export function markGranted(attemptId: string): void {
  const f = read();
  if (f.grantedAttemptIds.includes(attemptId)) return;
  f.grantedAttemptIds.push(attemptId);
  if (f.grantedAttemptIds.length > 500) {
    f.grantedAttemptIds.splice(0, f.grantedAttemptIds.length - 500);
  }
  write(f);
}

export function dailyCap(): number {
  return DAILY_CAP;
}

export const MEMORY_HISTORY_KEY = HISTORY_KEY;
