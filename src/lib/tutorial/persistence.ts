// ============================================================
// Guided Tutorial — Persistence (server-mirrored)
// ------------------------------------------------------------
// Stored shape at KEY (JSON):
//   { "version": 1, "completedAt": 1737302400 }   // unix seconds
//
// Rules (Priority-Zero rewrite):
//   - Guests:       localStorage only.
//   - Authenticated: localStorage + server mirror
//     (public.user_onboarding_state, per user × tutorial_id).
//   - Version bump replays the tour once per (device, account).
//   - Reinstall + login restores completion from the server BEFORE
//     the engine decides to auto-start (see setOnboardingHydrated).
//   - Skipping mirrors as a completed row too — the product spec
//     treats "skip" as completing the current version.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

const KEY = "irth.tutorial.irth-first-time.completed-version.v1";

interface StoredRecord {
  version: number;
  completedAt: number; // unix seconds
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
          completedAt:
            typeof parsed.completedAt === "number" ? parsed.completedAt : 0,
        };
      }
      return null;
    }
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return { version: n, completedAt: 0 };
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
  } catch {
    /* ignore */
  }
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

/** Local + best-effort immediate server mirror. Server write is
 *  awaited only when a network round-trip is worthwhile; failures
 *  never block gameplay. Retry on next hydrate. */
export function markCompleted(version: number): void {
  const record: StoredRecord = { version, completedAt: Math.floor(Date.now() / 1000) };
  writeRaw(record);
  // Fire-and-forget server mirror.
  void mirrorCompletionToServer("irth-first-time", version).catch(() => {
    /* silent — hydrate will retry */
  });
}

/** Admin/diagnostic escape hatch (LOCAL ONLY — does not delete the
 *  server row; sign-in will re-hydrate). */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

// ============================================================
// Server mirror
// ============================================================

async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.user?.id;
  } catch {
    return false;
  }
}

/** Push a local completion to the server. Idempotent server-side
 *  (INSERT ... ON CONFLICT keeps the greatest version). */
export async function mirrorCompletionToServer(
  tutorialId: string,
  version: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!(await isAuthenticated())) return { ok: false, reason: "unauthenticated" };
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
}

/** Read the server's completion record. Returns null when signed-out,
 *  offline, or the row does not exist. */
export async function fetchServerCompletion(
  tutorialId: string,
): Promise<{ version: number; completedAt: number } | null> {
  if (!(await isAuthenticated())) return null;
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

/** Reconcile local ⇄ server. If the server has a higher version, mirror
 *  it locally so the engine skips replay. If the local version is higher,
 *  push it up. Called from the account bootstrap. */
export async function hydrateOnboardingFromServer(
  tutorialId = "irth-first-time",
): Promise<{ local: number | null; server: number | null }> {
  const localRec = readRaw();
  const serverRec = await fetchServerCompletion(tutorialId);
  const localV = localRec?.version ?? null;
  const serverV = serverRec?.version ?? null;

  if (serverV != null && (localV == null || serverV > localV)) {
    writeRaw({
      version: serverV,
      completedAt: serverRec?.completedAt ?? Math.floor(Date.now() / 1000),
    });
  } else if (localV != null && (serverV == null || localV > serverV)) {
    await mirrorCompletionToServer(tutorialId, localV);
  }
  return { local: localV, server: serverV };
}
