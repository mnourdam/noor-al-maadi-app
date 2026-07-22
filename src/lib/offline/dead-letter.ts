// ============================================================
// Dead-letter store — permanent persistence failures
// ------------------------------------------------------------
// Priority-Zero §3: `invalid_campaign_id`, `campaign_not_found`,
// `invalid_chapter_id`, `chapter_not_in_campaign`, and any other
// unambiguously permanent RPC rejection must NOT be treated as
// success, must NOT retry forever, and must NOT be silently
// discarded.
//
// The item is moved from the retry queue to this durable
// diagnostic store, per-user, keyed by the original outbox id.
// Admin/dev diagnostics reads it via `listDeadLetters()`.
// ============================================================

import type { OutboxItem } from "./outbox";

const LS_KEY = "irth.outbox.dead-letter.v1";
const MAX_ENTRIES = 500;

export interface DeadLetter {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  reason: string;
  createdAt: number;   // ms epoch of the failed attempt
  originalCreatedAt: number;
  attempts: number;
}

function readAll(): DeadLetter[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as DeadLetter[]) : [];
  } catch { return []; }
}

function writeAll(items: DeadLetter[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(-MAX_ENTRIES)));
  } catch { /* quota */ }
}

/** Move an outbox item into the dead-letter store with a normalized reason. */
export function recordDeadLetter(item: OutboxItem, reason: string): void {
  const all = readAll();
  // Replace any existing entry with the same id (idempotent).
  const kept = all.filter(d => d.id !== item.id);
  kept.push({
    id: item.id,
    userId: item.userId,
    kind: item.kind,
    payload: item.payload,
    reason,
    createdAt: Date.now(),
    originalCreatedAt: item.createdAt,
    attempts: item.attempts,
  });
  writeAll(kept);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:dead-letter:changed"));
    }
  } catch { /* ignore */ }
  try {
    console.warn("[persistence] dead-letter", {
      id: item.id, kind: item.kind, reason,
      campaignId: (item.payload as any)?.campaignId ?? null,
      chapterId:  (item.payload as any)?.chapterId ?? null,
    });
  } catch { /* ignore */ }
}

export function listDeadLetters(userId: string | null): DeadLetter[] {
  const all = readAll();
  if (!userId) return [];
  return all.filter(d => d.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function clearDeadLetters(userId: string): void {
  const all = readAll().filter(d => d.userId !== userId);
  writeAll(all);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:dead-letter:changed"));
    }
  } catch { /* ignore */ }
}

/** Reasons that classify a failure as PERMANENT (dead-letter, no retry). */
export const PERMANENT_REASONS = new Set<string>([
  "invalid_campaign_id",
  "invalid_chapter_id",
  "campaign_not_found",
  "chapter_not_in_campaign",
  "invalid_tutorial_id",
  "invalid_version",
  "investigation_not_found",
]);

export function isPermanentReason(reason: string | null | undefined): boolean {
  return !!reason && PERMANENT_REASONS.has(reason);
}
