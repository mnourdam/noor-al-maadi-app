import { getIdentityEpoch } from "@/lib/identity/owner";
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
import { enqueueWithId } from "@/lib/offline/outbox";
import { saveGameplay, saveUserId, saveAccepted, type SaveOutcome } from "@/lib/offline/gameplay-write";
import { flushOutbox } from "@/lib/offline/flush";
import { recordTrace } from "@/lib/diag-trace";

const KEY = "irth.tutorial.irth-first-time.completed-version.v1";
const DEFAULT_TUTORIAL_ID = "irth-first-time";

interface StoredRecord {
  version: number;
  completedAt: number; // unix seconds
  userId?: string | null;
}

function readRaw(strict = false): StoredRecord | null {
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
      if (strict) throw new Error("invalid-tutorial-record");
      return null;
    }
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return { version: n, completedAt: 0, userId: null };
    if (strict) throw new Error("invalid-tutorial-record");
    return null;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

function writeRaw(rec: StoredRecord): boolean {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, JSON.stringify(rec));
      return true;
    }
  } catch { /* reported to completion caller */ }
  return false;
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
export async function markCompleted(version: number): Promise<SaveOutcome> {
  recordTrace("tutorial", "markCompleted-called", `version=${version}`);
  let uid: string | null;
  let previous: StoredRecord | null;
  try { uid = await saveUserId(true); previous = readRaw(true); }
  catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  const effectiveVersion = previous && ownerMatches(previous, uid) ? Math.max(version, previous.version) : version;
  const record: StoredRecord = { version: effectiveVersion, completedAt: Math.floor(Date.now() / 1000), userId: uid };
  if (!uid) return { acknowledged: false, queued: writeRaw(record), reason: "local" };
  const outcome = await saveGameplay({
    userId: uid, id: `tutorial_completion:${uid}:${DEFAULT_TUTORIAL_ID}:${version}`, kind: "tutorial_completion",
    payload: { tutorialId: DEFAULT_TUTORIAL_ID, version },
    rpc: () => supabase.rpc("record_tutorial_completion" as any, { p_tutorial_id: DEFAULT_TUTORIAL_ID, p_version: version }),
  });
  if (saveAccepted(outcome) && await saveUserId() === uid) writeRaw(record);
  recordTrace("tutorial", outcome.acknowledged ? "record_tutorial_completion-ok" : "record_tutorial_completion-not-ok", outcome.reason ?? (outcome.queued ? "queued" : "not-saved"));
  return outcome;
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
 *
 * Deduped: concurrent calls for the same (uid, tutorialId) share one
 * in-flight promise; terminal results are cached for the session so
 * ordinary rerenders, route changes, and diagnostics-page refreshes
 * do not re-hit the RPC. The cache is invalidated automatically on
 * auth state change via `invalidateOnboardingCache()`.
 */
type ServerCompletion = { version: number; completedAt: number } | null;

interface CacheEntry {
  uid: string;
  tutorialId: string;
  result: ServerCompletion;
  at: number;
}

const inFlight = new Map<string, Promise<ServerCompletion>>();
const cache = new Map<string, CacheEntry>();

function cacheKey(uid: string, tutorialId: string) {
  return `${uid}::${tutorialId}`;
}

export function invalidateOnboardingCache(uid?: string | null): void {
  if (uid == null) {
    cache.clear();
    inFlight.clear();
    return;
  }
  for (const k of Array.from(cache.keys())) if (k.startsWith(`${uid}::`)) cache.delete(k);
  for (const k of Array.from(inFlight.keys())) if (k.startsWith(`${uid}::`)) inFlight.delete(k);
}

export async function fetchServerCompletion(
  tutorialId: string,
  opts: { force?: boolean } = {},
): Promise<ServerCompletion> {
  const uid = await currentUserId();
  if (!uid) {
    recordTrace("tutorial", "get_tutorial_completion-skip", "no-session");
    return null;
  }
  const key = cacheKey(uid, tutorialId);
  if (!opts.force) {
    const hit = cache.get(key);
    if (hit) return hit.result;
    const pending = inFlight.get(key);
    if (pending) {
      // Second caller during in-flight — record and share the promise.
      try {
        const { recordStartupMark } = await import("@/lib/boot/startup-timeline");
        recordStartupMark("onboarding-request-concurrent", tutorialId);
      } catch { /* ignore */ }
      return pending;
    }
  }
  const promise = (async (): Promise<ServerCompletion> => {
    try {
      recordTrace("tutorial", "get_tutorial_completion-start", tutorialId);
      try {
        const { recordStartupMark } = await import("@/lib/boot/startup-timeline");
        recordStartupMark("onboarding-request", tutorialId);
      } catch { /* ignore */ }
      const { data, error } = await supabase.rpc(
        "get_tutorial_completion" as any,
        { p_tutorial_id: tutorialId },
      );
      if (error) {
        recordTrace("tutorial", "get_tutorial_completion-error", error.message);
        throw new Error(error.message);
      }
      const p = (data ?? {}) as {
        ok?: boolean;
        completed?: boolean;
        completed_version?: number;
        completed_at?: string;
      };
      recordTrace(
        "tutorial",
        "get_tutorial_completion-result",
        `ok=${!!p.ok};completed=${!!p.completed};version=${p.completed_version ?? "none"}`,
      );
      let result: ServerCompletion = null;
      if (p.ok && p.completed && typeof p.completed_version === "number") {
        const at = p.completed_at ? Math.floor(new Date(p.completed_at).getTime() / 1000) : 0;
        result = { version: p.completed_version, completedAt: at };
      }
      cache.set(key, { uid, tutorialId, result, at: Date.now() });
      return result;
    } catch (e) {
      recordTrace("tutorial", "get_tutorial_completion-exception", e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
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
  const epoch = getIdentityEpoch();
  const uid = await currentUserId();
  const localRec = readRaw();
  recordTrace(
    "tutorial",
    "hydrateOnboarding-start",
    `authed=${Boolean(uid)};local=${localRec?.version ?? "none"};owner=${localRec?.userId ? "user" : "none"}`,
  );
  const serverRec = await fetchServerCompletion(tutorialId);
  const localV = localRec?.version ?? null;
  const serverV = serverRec?.version ?? null;
  if (getIdentityEpoch() !== epoch || await saveUserId() !== uid) return { local: localV, server: null };

  // Server wins when present. Even when the numeric version is equal, rewrite
  // the local record with the authenticated owner so a fresh APK login cannot
  // race on an ownerless legacy value.
  if (serverV != null) {
    const mergedVersion = localV != null && ownerMatches(localRec, uid)
      ? Math.max(serverV, localV)
      : serverV;
    writeRaw({
      version: mergedVersion,
      completedAt: serverRec?.completedAt ?? Math.floor(Date.now() / 1000),
      userId: uid,
    });
    recordTrace("tutorial", "hydrateOnboarding-server-won", `server=${serverV};local=${localV ?? "none"};written=${mergedVersion}`);
    if (uid && mergedVersion > serverV) {
      const outboxId = `tutorial_completion:${uid}:${tutorialId}:${mergedVersion}`;
      try { await enqueueWithId(uid, outboxId, "tutorial_completion", { tutorialId, version: mergedVersion }); }
      catch { return { local: localV, server: serverV }; }
      void flushOutbox(uid).catch(() => {});
      recordTrace("tutorial", "hydrateOnboarding-local-newer-queued", `local=${mergedVersion};server=${serverV}`);
    }
  } else if (localV != null && ownerMatches(localRec, uid) && (serverV == null || localV > serverV)) {
    // Push local up.
    if (uid) {
      const outboxId = `tutorial_completion:${uid}:${tutorialId}:${localV}`;
      try { await enqueueWithId(uid, outboxId, "tutorial_completion", { tutorialId, version: localV }); }
      catch { return { local: localV, server: serverV }; }
      void flushOutbox(uid).catch(() => {});
    }
    recordTrace("tutorial", "hydrateOnboarding-local-pushed", `local=${localV};server=${serverV ?? "none"}`);
  } else if (uid && localRec && !ownerMatches(localRec, uid) && serverV == null) {
    // Different account, and server has nothing — clear leaked state.
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    recordTrace("tutorial", "hydrateOnboarding-cleared-cross-user", `local=${localV ?? "none"}`);
  }
  recordTrace("tutorial", "hydrateOnboarding-done", `local=${localV ?? "none"};server=${serverV ?? "none"};current=${readRaw()?.version ?? "none"}`);
  return { local: localV, server: serverV };
}
