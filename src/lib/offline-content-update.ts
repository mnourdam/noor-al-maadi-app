/**
 * App-wide offline content update controller (V16).
 *
 * Contract:
 *   - Canonical content is NEVER silently replaced after release.
 *   - Boot/background may only DETECT that the server manifest is newer.
 *   - The player explicitly taps "تحديث" → a candidate snapshot is built,
 *     validated completely, persisted, and only then activated.
 *   - If any step fails the previously active snapshot stays untouched.
 *
 * Player progress, outbox, auth, streaks and campaign progress live in
 * separate stores and are never read or written here.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { loadSnapshot, saveSnapshot, type OfflineSnapshot } from "./offline-storage";
import { fetchContentManifest } from "./offline-manifest";

export interface ContentUpdateState {
  /** Server manifest reports content the local snapshot does not have. */
  available: boolean;
  /** A user-triggered update is currently running. */
  applying: boolean;
  /** Last failure message, if the previous attempt failed. */
  error: string | null;
  /** Collections that trail the server. */
  collections: string[];
  /** Timestamp of the last successful manifest check. */
  checkedAt: number | null;
}

let state: ContentUpdateState = {
  available: false,
  applying: false,
  error: null,
  collections: [],
  checkedAt: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<ContentUpdateState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function getContentUpdateState(): ContentUpdateState {
  return state;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function mapManifestKey(collection: string): string {
  if (collection === "campaigns_public") return "admin_campaigns";
  if (collection === "investigations_public") return "investigations";
  return collection;
}

/**
 * Compare a local snapshot against the server manifest.
 *
 * Only collections the local snapshot actually carries are comparable —
 * baseline-owned collections (stories/scenes/media) are not part of the
 * bundled snapshot and must not raise a permanent "update available".
 */
export function diffAgainstManifest(
  local: Pick<OfflineSnapshot, "content_counts" | "generated_at"> | null | undefined,
  manifest: { collection: string; total_count: number; last_updated: string }[] | null,
  nowMs: number = Date.now(),
): string[] {
  if (!local?.content_counts || !Array.isArray(manifest)) return [];
  const generated = Date.parse(local.generated_at ?? "");
  // Corrupt / future-dated local metadata (the legacy inflated
  // snapshot_version case) can never be trusted as "fresh".
  const generatedTrustworthy = Number.isFinite(generated) && generated <= nowMs;
  const out: string[] = [];
  for (const item of manifest) {
    const key = mapManifestKey(item.collection);
    if (!(key in local.content_counts)) continue;
    const localCount = local.content_counts[key] ?? 0;
    if (Number(item.total_count) !== localCount) {
      out.push(key);
      continue;
    }
    const serverDate = Date.parse(item.last_updated ?? "");
    if (!generatedTrustworthy || (Number.isFinite(serverDate) && serverDate > generated)) {
      out.push(key);
    }
  }
  return out;
}

/**
 * Detect (never apply) whether newer canonical content exists.
 * Safe to call on boot, on reconnect and periodically.
 */
export async function checkForContentUpdate(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return state.available;
  try {
    const [local, manifest] = await Promise.all([loadSnapshot(), fetchContentManifest()]);
    if (!local || !manifest) return state.available;
    const collections = diffAgainstManifest(local, manifest);
    setState({
      available: collections.length > 0,
      collections,
      checkedAt: Date.now(),
    });
    return collections.length > 0;
  } catch {
    return state.available;
  }
}

/**
 * User-triggered staged update:
 *   existing snapshot → candidate → validate → persist → activate.
 * Any failure leaves the currently active snapshot in place.
 */
export async function applyContentUpdate(): Promise<boolean> {
  if (state.applying) return false;
  setState({ applying: true, error: null });
  const previous = await loadSnapshot();
  try {
    const { refreshSnapshotIncremental } = await import("./offline-snapshot");
    const candidate = await refreshSnapshotIncremental();

    const { validateSnapshot } = await import("./offline-snapshot-validate");
    const report = validateSnapshot(candidate);
    if (!report.ok) {
      throw new Error(`candidate rejected: ${report.issues.join(", ")}`);
    }

    // Persist FIRST — activation only happens once the candidate is durable.
    await saveSnapshot(candidate);
    const stored = await loadSnapshot();
    if (!stored || stored.snapshot_version !== candidate.snapshot_version) {
      throw new Error("candidate did not persist; keeping previous snapshot");
    }

    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(stored);

    setState({ applying: false, available: false, collections: [], error: null, checkedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn("[content-update] update failed, keeping previous snapshot:", e);
    // Best-effort re-activation of the previous, still-valid snapshot.
    try {
      if (previous) {
        const { applyLocalSnapshot } = await import("./local-first-store");
        applyLocalSnapshot(previous);
      }
    } catch { /* ignore */ }
    setState({ applying: false, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Test/diagnostics helper — resets the in-memory controller state. */
export function __resetContentUpdateState(): void {
  state = { available: false, applying: false, error: null, collections: [], checkedAt: null };
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 45 * 1000;

/** Subscribe a component to the app-wide update state (read-only). */
export function useContentUpdate(): ContentUpdateState & { apply: () => Promise<void>; dismiss: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getContentUpdateState, getContentUpdateState);

  useEffect(() => {
    const first = window.setTimeout(() => { void checkForContentUpdate(); }, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => { void checkForContentUpdate(); }, CHECK_INTERVAL_MS);
    const onOnline = () => { void checkForContentUpdate(); };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const apply = useCallback(async () => { await applyContentUpdate(); }, []);
  const dismiss = useCallback(() => setState({ available: false }), []);

  return { ...snapshot, apply, dismiss };
}
