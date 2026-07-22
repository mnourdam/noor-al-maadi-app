// ============================================================
// Guided Tutorial — Persistence (durable server mirror)
// ------------------------------------------------------------
// Local storage still holds the "completed version" so the engine
// works offline and for guests, but every authenticated completion
// is ALSO enqueued in the offline outbox with a stable idempotency
// id AND fired at the server RPC immediately when online. The
// queued copy is only removed on server acknowledgement.
//
// Namespacing: local completion carries the owning `userId` (or
// `null` for guests). Reads by a different user return "not
// completed" — Account A can never see B's local completion.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { enqueueWithId, remove as outboxRemove } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";

const KEY = "irth.tutorial.irth-first-time.completed-version.v1";
const DEFAULT_TUTORIAL_ID = "irth-first-time";

interface StoredRecord {
  version: number;
  completedAt: number; // unix seconds
  userId?: string | null;
}

function readRaw(): StoredRecord | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (raw == null) return null;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as Partial<StoredRecord>;
      if (typeof parsed?.version === "number" && Number.isFinite(parsed.version)) {
        return {
          version: parsed.version,
          completedAt: typeof parsed.completedAt === "number" ? parsed.completedAt : 0,
          userId: typeof parsed.userId === "string" ? parsed.userId : null,
        };
      }
      return null;
    }
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return { version: n, completedAt: 0, userId: null };
    return null;
  } catch {
    return null;
  }
}

function writeRaw(rec: StoredRecord): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, JSON.stringify(rec));
    }
  } catch { /* ignore */ }
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

function ownerMatches(rec: StoredRecord | null, uid: string | null): boolean {
  if (!rec) return false;
  // Legacy records (before per-user namespacing) have no owner. Trust them
  // for the current session but they will be overwritten on hydrate.
  if (rec.userId === undefined || rec.userId === null) return true;
  return rec.userId === uid;
}

export function readCompletedVersion(): number | null {
  return readRaw()?.version ?? null;
}

export function readCompletionRecord(): StoredRecord | null {
  return readRaw();
}

export function hasCompleted(version: number): boolean {
  const rec = readRaw();
  return rec != null && rec.version >= version;
}

/**
 * Priority-Zero durable write contract for tutorial completion.
 * Guests: local-only (idempotent). Authenticated: local + queued outbox
 * op + immediate awaited server RPC. Queued op dropped only on ack.
 */
export function markCompleted(version: number): void {
  // Local write first so a crash/exit before server ack preserves the fact.
  void (async () => {
    const uid = await currentUserId();
    const record: StoredRecord = {
      version,
      completedAt: Math.floor(Date.now() / 1000),
      userId: uid,
    };
    writeRaw(record);
    if (!uid) return;

    const outboxId = `tutorial_completion:${uid}:${DEFAULT_TUTORIAL_ID}:${version}`;
    await enqueueWithId(uid, outboxId, "tutorial_completion", {
      tutorialId: DEFAULT_TUTORIAL_ID,
      version,
    });

    if (typeof navigator === "undefined" || navigator.onLine) {
      try {
        const { data, error } = await supabase.rpc(
          "record_tutorial_completion" as any,
          { p_tutorial_id: DEFAULT_TUTORIAL_ID, p_version: version },
        );
        if (!error) {
          const payload = (data ?? {}) as { ok?: boolean };
          if (payload.ok) {
            try { await outboxRemove(outboxId); } catch { /* leave queued */ }
            return;
          }
        }
      } catch { /* fall through */ }
    }
    void flushOutbox(uid);
  })();
}

/** Admin/diagnostic escape hatch (LOCAL ONLY). */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

/**
 * Read the server's completion record. Returns null when signed-out,
 * offline, or the row does not exist.
 */
export async function fetchServerCompletion(
  tutorialId: string,
): Promise<{ version: number; completedAt: number } | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.rpc(
      "get_tutorial_completion" as any,
      { p_tutorial_id: tutorialId },
    );
    if (error) return null;
    const p = (data ?? {}) as {
      ok?: boolean;
      completed?: boolean;
      completed_version?: number;
      completed_at?: string;
    };
    if (!p.ok || !p.completed || typeof p.completed_version !== "number") return null;
    const at = p.completed_at ? Math.floor(new Date(p.completed_at).getTime() / 1000) : 0;
    return { version: p.completed_version, completedAt: at };
  } catch {
    return null;
  }
}

/** Legacy alias — kept so imports elsewhere continue to compile. */
export const mirrorCompletionToServer = async (
  tutorialId: string,
  version: number,
): Promise<{ ok: boolean; reason?: string }> => {
  const uid = await currentUserId();
  if (!uid) return { ok: false, reason: "unauthenticated" };
  try {
    const { data, error } = await supabase.rpc(
      "record_tutorial_completion" as any,
      { p_tutorial_id: tutorialId, p_version: version },
    );
    if (error) return { ok: false, reason: error.message };
    const payload = (data ?? {}) as { ok?: boolean; reason?: string };
    if (!payload.ok) return { ok: false, reason: payload.reason ?? "rpc-not-ok" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "exception" };
  }
};

/**
 * Reconcile local ⇄ server. Server is authoritative when it has a row.
 * If the local record is owned by a *different* user (namespacing), or
 * the server has nothing and local has no owner match, local is cleared
 * so Account B never inherits Account A's completion on the same device.
 * Called from the account bootstrap; also drains any queued tutorial ops.
 */
export async function hydrateOnboardingFromServer(
  tutorialId = DEFAULT_TUTORIAL_ID,
): Promise<{ local: number | null; server: number | null }> {
  const uid = await currentUserId();
  const localRec = readRaw();
  const serverRec = await fetchServerCompletion(tutorialId);
  const localV = localRec?.version ?? null;
  const serverV = serverRec?.version ?? null;

  // Server wins when present.
  if (serverV != null && (localV == null || serverV > localV || !ownerMatches(localRec, uid))) {
    writeRaw({
      version: serverV,
      completedAt: serverRec?.completedAt ?? Math.floor(Date.now() / 1000),
      userId: uid,
    });
  } else if (localV != null && ownerMatches(localRec, uid) && (serverV == null || localV > serverV)) {
    // Push local up.
    if (uid) {
      const outboxId = `tutorial_completion:${uid}:${tutorialId}:${localV}`;
      await enqueueWithId(uid, outboxId, "tutorial_completion", {
        tutorialId, version: localV,
      });
      void flushOutbox(uid);
    }
  } else if (uid && localRec && !ownerMatches(localRec, uid) && serverV == null) {
    // Different account, and server has nothing — clear leaked state.
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
    } catch { /* ignore */ }
  }
  return { local: localV, server: serverV };
}
