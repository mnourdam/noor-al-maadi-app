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

import {
  localScope,
  withStorageLock,
  GuestStorageError,
  storageReason,
  type LocalScope,
  type GuestStorageReason,
} from "@/lib/guest/storage";

function readFile(scope: LocalScope): BufferFile {
  const raw = scope.read();
  if (raw === null) return { boundUid: null, entries: {} };
  let value: BufferFile;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GuestStorageError("corrupt");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !(value.boundUid === null || (typeof value.boundUid === "string" && value.boundUid.length)) ||
    !value.entries ||
    typeof value.entries !== "object" ||
    Array.isArray(value.entries)
  )
    throw new GuestStorageError("corrupt");
  for (const [address, e] of Object.entries(value.entries)) {
    if (
      !e ||
      typeof e !== "object" ||
      typeof e.campaignId !== "string" ||
      !e.campaignId.length ||
      typeof e.chapterId !== "string" ||
      !e.chapterId.length ||
      address !== key(e.campaignId, e.chapterId) ||
      !["locked", "unlocked", "completed"].includes(e.status) ||
      typeof e.bufferedAt !== "string" ||
      !Number.isFinite(Date.parse(e.bufferedAt)) ||
      (e.completed !== undefined && typeof e.completed !== "boolean") ||
      [e.score, e.xpEarned, e.coinsEarned].some(
        (n) => n !== undefined && (typeof n !== "number" || !Number.isFinite(n)),
      )
    )
      throw new GuestStorageError("corrupt");
  }
  return value;
}
/** Unknown storage throws, never returns a trusted empty buffer. */
export function readGuestBuffer(): BufferFile {
  return readFile(localScope(GUEST_BUFFER_KEY, false));
}
function key(campaignId: string, chapterId: string) {
  return `${campaignId}::${chapterId}`;
}
export type BufferSaveResult =
  | { saved: true }
  | { saved: false; reason: GuestStorageReason | "identity_conflict" };
export async function bufferChapterProgress(
  p: Omit<BufferedChapterProgress, "bufferedAt">,
): Promise<BufferSaveResult> {
  p = { ...p };
  const cid = String(p.campaignId ?? "").trim(),
    chid = String(p.chapterId ?? "").trim();
  if (
    !cid ||
    !chid ||
    !["locked", "unlocked", "completed"].includes(p.status) ||
    [p.score, p.xpEarned, p.coinsEarned].some((n) => n !== undefined && !Number.isFinite(n))
  )
    return { saved: false, reason: "invalid_input" };
  try {
    const scope = localScope(GUEST_BUFFER_KEY);
    return await withStorageLock(scope, () => {
      const file = readFile(scope),
        address = key(cid, chid),
        prev = file.entries[address];
      if (file.boundUid) return { saved: false, reason: "identity_conflict" } as const;
      const completed = !!prev?.completed || !!p.completed || p.status === "completed";
      file.entries[address] = {
        ...prev,
        campaignId: cid,
        chapterId: chid,
        status: completed ? "completed" : p.status,
        score: Math.max(prev?.score ?? 0, p.score ?? 0) || undefined,
        xpEarned: Math.max(prev?.xpEarned ?? 0, p.xpEarned ?? 0) || undefined,
        coinsEarned: Math.max(prev?.coinsEarned ?? 0, p.coinsEarned ?? 0) || undefined,
        completed,
        bufferedAt: new Date().toISOString(),
      };
      scope.write(JSON.stringify(file));
      return { saved: true } as const;
    });
  } catch (error) {
    return { saved: false, reason: storageReason(error) };
  }
}
/** Explicit caller action only; corrupt/unreadable data is never cleared. */
export async function clearGuestBuffer(): Promise<BufferSaveResult> {
  try {
    const scope = localScope(GUEST_BUFFER_KEY, false);
    await withStorageLock(scope, () => {
      readFile(scope);
      scope.remove();
    });
    return { saved: true };
  } catch (error) {
    return { saved: false, reason: storageReason(error) };
  }
}
export interface PromotionResult {
  /** Only acknowledged entries whose local removal was also saved. */
  promoted: number;
  /** null means storage could not be inspected reliably. */
  remaining: number | null;
  reason?: GuestStorageReason | "no_uid" | "identity_conflict" | "empty" | "entry_changed";
}
export async function promoteGuestProgress(
  uid: string | null | undefined,
  send: (
    p: Omit<BufferedChapterProgress, "bufferedAt">,
  ) => Promise<{ acknowledged: boolean; reason?: string }>,
): Promise<PromotionResult> {
  if (!uid) return { promoted: 0, remaining: null, reason: "no_uid" };
  let promoted = 0;
  try {
    // Preserve existing partition ownership. Do NOT search/import another owner's guest partition.
    const scope = localScope(GUEST_BUFFER_KEY, false);
    if (scope.owner !== `user:${uid}`)
      return { promoted: 0, remaining: null, reason: "identity_conflict" };
    return await withStorageLock(
      scope,
      async () => {
        const bound = await withStorageLock(scope, () => {
          const file = readFile(scope);
          if (file.boundUid && file.boundUid !== uid) return null;
          if (file.boundUid !== uid) scope.write(JSON.stringify({ ...file, boundUid: uid }));
          return { ...file, boundUid: uid };
        });
        scope.check();
        if (!bound)
          return { promoted, remaining: null, reason: "identity_conflict" } as PromotionResult;
        const pending = Object.values(bound.entries);
        if (!pending.length) return { promoted, remaining: 0, reason: "empty" } as PromotionResult;
        for (const entry of pending) {
          scope.check();
          let acknowledged = false;
          try {
            const { bufferedAt: _time, ...payload } = entry;
            acknowledged = (await send(payload)).acknowledged === true;
          } catch {
            /* retain the entry */
          }
          scope.check();
          if (!acknowledged) continue;
          const cleaned = await withStorageLock(scope, () => {
            const current = readFile(scope),
              address = key(entry.campaignId, entry.chapterId);
            if (current.boundUid !== uid) throw new GuestStorageError("identity_changed");
            if (JSON.stringify(current.entries[address]) !== JSON.stringify(entry)) return false;
            delete current.entries[address];
            scope.write(JSON.stringify(current));
            return true;
          });
          if (!cleaned)
            return {
              promoted,
              remaining: Object.keys(readFile(scope).entries).length,
              reason: "entry_changed",
            } as PromotionResult;
          promoted++;
        }
        return { promoted, remaining: Object.keys(readFile(scope).entries).length };
      },
      "promotion",
    );
  } catch (error) {
    return { promoted, remaining: null, reason: storageReason(error) };
  }
}
export async function promoteGuestProgressForCurrentUser(
  uid: string | null | undefined,
): Promise<PromotionResult> {
  try {
    const scope = localScope(GUEST_BUFFER_KEY, false);
    if (!uid || scope.owner !== `user:${uid}`)
      return { promoted: 0, remaining: null, reason: uid ? "identity_conflict" : "no_uid" };
    const { recordChapterProgress } = await import("@/lib/offline/record");
    scope.check();
    return await promoteGuestProgress(uid, (p) => {
      scope.check();
      return recordChapterProgress(p);
    });
  } catch (error) {
    return { promoted: 0, remaining: null, reason: storageReason(error) };
  }
}
