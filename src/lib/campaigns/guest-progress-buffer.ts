// ============================================================
// Guest / pre-auth campaign progress buffer (V16)
// ------------------------------------------------------------
// `recordChapterProgress()` used to return `unauthenticated` and drop
// the write when no Supabase session existed (guest play, or gameplay
// that finished before auth hydration completed). That silently lost
// progress across an app restart.
//
// This module is a durable, local-only buffer:
//   * writes are sticky/monotonic (completed never regresses)
//   * the buffer is bound to at most ONE identity: once promoted to a
//     user it can never be attached to a different account
//   * promotion re-uses the canonical verified path
//     (`recordChapterProgress` → `record_campaign_progress_v2`), so no
//     unverified completion can be created from buffered data
//   * a failed promotion (offline / RPC error) KEEPS the entry queued
// ============================================================

export const GUEST_BUFFER_KEY = "irth.campaign_progress_buffer.v1";

export interface BufferedChapterProgress {
  campaignId: string;
  chapterId: string;
  status: "locked" | "unlocked" | "completed";
  score?: number;
  xpEarned?: number;
  coinsEarned?: number;
  completed?: boolean;
  bufferedAt: string;
}

interface BufferFile {
  /** Identity this buffer has been (or is being) promoted to. */
  boundUid: string | null;
  entries: Record<string, BufferedChapterProgress>;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emptyFile(): BufferFile {
  return { boundUid: null, entries: {} };
}

export function readGuestBuffer(): BufferFile {
  if (!isBrowser()) return emptyFile();
  try {
    const raw = window.localStorage.getItem(GUEST_BUFFER_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as Partial<BufferFile>;
    if (!parsed || typeof parsed !== "object") return emptyFile();
    return {
      boundUid: typeof parsed.boundUid === "string" ? parsed.boundUid : null,
      entries: (parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {}) as BufferFile["entries"],
    };
  } catch {
    return emptyFile();
  }
}

function writeGuestBuffer(file: BufferFile): void {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(GUEST_BUFFER_KEY, JSON.stringify(file)); } catch { /* quota */ }
}

function key(campaignId: string, chapterId: string): string {
  return `${campaignId}::${chapterId}`;
}

/** Sticky/monotonic merge — a completed entry is never downgraded. */
export function bufferChapterProgress(p: Omit<BufferedChapterProgress, "bufferedAt">): void {
  const cid = String(p.campaignId ?? "").trim();
  const chid = String(p.chapterId ?? "").trim();
  if (!cid || !chid) return;
  const file = readGuestBuffer();
  const k = key(cid, chid);
  const prev = file.entries[k];
  const completed = Boolean(prev?.completed) || Boolean(p.completed) || p.status === "completed";
  file.entries[k] = {
    campaignId: cid,
    chapterId: chid,
    status: completed ? "completed" : (prev?.status === "completed" ? "completed" : p.status),
    score: Math.max(prev?.score ?? 0, p.score ?? 0) || undefined,
    xpEarned: Math.max(prev?.xpEarned ?? 0, p.xpEarned ?? 0) || undefined,
    coinsEarned: Math.max(prev?.coinsEarned ?? 0, p.coinsEarned ?? 0) || undefined,
    completed,
    bufferedAt: new Date().toISOString(),
  };
  writeGuestBuffer(file);
}

export function clearGuestBuffer(): void {
  if (!isBrowser()) return;
  try { window.localStorage.removeItem(GUEST_BUFFER_KEY); } catch { /* noop */ }
}

export interface PromotionResult {
  promoted: number;
  remaining: number;
  reason?: "no_uid" | "identity_conflict" | "empty";
}

/**
 * Promote buffered progress to the signed-in account through the canonical
 * verified path. Ambiguous identity (buffer already bound to a different
 * uid) fails safely: nothing is sent and the buffer is left untouched.
 */
export async function promoteGuestProgress(
  uid: string | null | undefined,
  send: (p: Omit<BufferedChapterProgress, "bufferedAt">) => Promise<{ acknowledged: boolean; reason?: string }>,
): Promise<PromotionResult> {
  const file = readGuestBuffer();
  const pending = Object.values(file.entries);
  if (!uid) return { promoted: 0, remaining: pending.length, reason: "no_uid" };
  if (file.boundUid && file.boundUid !== uid) {
    return { promoted: 0, remaining: pending.length, reason: "identity_conflict" };
  }
  if (!pending.length) {
    if (file.boundUid !== uid) writeGuestBuffer({ boundUid: uid, entries: {} });
    return { promoted: 0, remaining: 0, reason: "empty" };
  }

  // Bind BEFORE sending so a crash mid-flush cannot re-target another account.
  writeGuestBuffer({ boundUid: uid, entries: file.entries });

  let promoted = 0;
  for (const entry of pending) {
    let ok = false;
    try {
      const res = await send({
        campaignId: entry.campaignId,
        chapterId: entry.chapterId,
        status: entry.status,
        score: entry.score,
        xpEarned: entry.xpEarned,
        coinsEarned: entry.coinsEarned,
        completed: entry.completed,
      });
      ok = Boolean(res?.acknowledged);
    } catch { ok = false; }
    if (ok) {
      const cur = readGuestBuffer();
      delete cur.entries[key(entry.campaignId, entry.chapterId)];
      writeGuestBuffer({ boundUid: uid, entries: cur.entries });
      promoted += 1;
    }
  }
  const remaining = Object.keys(readGuestBuffer().entries).length;
  return { promoted, remaining };
}

/** Convenience wrapper used by app startup / auth listeners. */
export async function promoteGuestProgressForCurrentUser(uid: string | null | undefined): Promise<PromotionResult> {
  const { recordChapterProgress } = await import("@/lib/offline/record");
  return promoteGuestProgress(uid, (p) => recordChapterProgress(p));
}
