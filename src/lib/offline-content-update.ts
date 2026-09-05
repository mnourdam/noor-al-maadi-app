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
import { fetchContentManifest, isManifestCountComparable, isManifestTimestampCanonical } from "./offline-manifest";
import { formatError, formatIssues } from "./offline-error-format";

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

export interface ManifestDiffDetail {
  /** Collections that certainly trail the server (Stage 1 evidence). */
  updates: string[];
  /**
   * `stories.last_updated` moved with no count change — reaction-polluted,
   * so it is a Stage 2 CANDIDATE, never a banner on its own.
   */
  storiesCandidate: string | null;
  /** Server counts per local key (persisted on apply). */
  counts: Record<string, number>;
  /** Server editorial timestamps per local key (persisted on apply). */
  editorial: Record<string, string | null>;
}

/**
 * Compare a local snapshot against the server manifest.
 *
 * Only collections the local snapshot actually carries are comparable —
 * baseline-owned collections (stories/scenes/media) are not part of the
 * bundled snapshot and must not raise a permanent "update available".
 */
export function diffManifestDetailed(
  local: Pick<OfflineSnapshot, "content_counts" | "generated_at"> | null | undefined,
  manifest: { collection: string; total_count: number; last_updated: string }[] | null,
  nowMs: number = Date.now(),
): ManifestDiffDetail {
  const empty: ManifestDiffDetail = {
    updates: [],
    storiesCandidate: null,
    counts: {},
    editorial: {},
  };
  if (!local?.content_counts || !Array.isArray(manifest)) return empty;
  const generated = Date.parse(local.generated_at ?? "");
  // Corrupt / future-dated local metadata (the legacy inflated
  // snapshot_version case) can never be trusted as "fresh".
  const generatedTrustworthy = Number.isFinite(generated) && generated <= nowMs;
  const out: string[] = [];
  const counts: Record<string, number> = {};
  const editorial: Record<string, string | null> = {};
  let storiesCandidate: string | null = null;

  for (const item of manifest) {
    const key = mapManifestKey(item.collection);
    counts[key] = Number(item.total_count);
    editorial[key] = item.last_updated ?? null;
    if (!(key in local.content_counts)) continue;
    const localCount = local.content_counts[key] ?? 0;
    // Visibility-filtered story subsets are legitimately smaller than the
    // raw server table count — never treat that as a pending update.
    if (isManifestCountComparable(key) && Number(item.total_count) !== localCount) {
      out.push(key);
      continue;
    }
    const serverDate = Date.parse(item.last_updated ?? "");
    const newer =
      !generatedTrustworthy || (Number.isFinite(serverDate) && serverDate > generated);
    if (!isManifestTimestampCanonical(key)) {
      // `stories.updated_at` is bumped by player reactions → candidate only.
      if (newer) storiesCandidate = item.last_updated ?? null;
      continue;
    }
    if (newer) out.push(key);
  }
  return { updates: out, storiesCandidate, counts, editorial };
}

/** Back-compatible Stage 1 view: certain updates only. */
export function diffAgainstManifest(
  local: Pick<OfflineSnapshot, "content_counts" | "generated_at"> | null | undefined,
  manifest: { collection: string; total_count: number; last_updated: string }[] | null,
  nowMs: number = Date.now(),
): string[] {
  return diffManifestDetailed(local, manifest, nowMs).updates;
}

/**
 * Detect (never apply) whether newer canonical content exists.
 * Safe to call on boot, on reconnect and periodically.
 *
 * Stage 1 = cheap manifest (counts + editorial-only timestamps).
 * Stage 2 = canonical Story fingerprint, throttled, only for a stories-only
 * candidate, and always fail-quiet.
 */
export async function checkForContentUpdate(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return state.available;
  try {
    const [local, manifest] = await Promise.all([loadSnapshot(), fetchContentManifest()]);
    if (!local || !manifest) return state.available;
    const diff = diffManifestDetailed(local, manifest);
    let collections = diff.updates;

    if (collections.length === 0 && diff.storiesCandidate) {
      const { readStoryIdentity, shouldRunStage2 } = await import(
        "./stories/content-identity-store"
      );
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (
        shouldRunStage2({
          identity: readStoryIdentity(),
          candidateTimestamp: diff.storiesCandidate,
          nowMs: Date.now(),
          online,
        })
      ) {
        const { verifyStoryEditorialChange } = await import(
          "./stories/content-identity-check"
        );
        const { result } = await verifyStoryEditorialChange({
          candidateTimestamp: diff.storiesCandidate,
        });
        if (result === "changed") collections = ["stories"];
      }
    }

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
 * Record the applied Story editorial identity after a successful update.
 * Best-effort: a failure here can only cost one extra Stage 2 check later.
 */
export async function persistAppliedStoryIdentity(
  stored: Pick<OfflineSnapshot, "content_counts" | "generated_at">,
): Promise<void> {
  try {
    const manifest = await fetchContentManifest();
    const detail = diffManifestDetailed(stored, manifest);
    const { fetchStoryEditorialFingerprint } = await import(
      "./stories/content-identity-check"
    );
    const { recordAppliedIdentity } = await import("./stories/content-identity-store");
    const fingerprint = await fetchStoryEditorialFingerprint();
    recordAppliedIdentity({
      fingerprint,
      counts: detail.counts,
      editorial: detail.editorial,
      observedStoriesUpdatedAt: detail.editorial["stories"] ?? null,
      nowMs: Date.now(),
    });
  } catch {
    /* identity is an optimisation; never fail an applied update over it */
  }
}

/**
 * Hard ceiling for one user-triggered update. The UI must NEVER be able to
 * stay in `applying: true` forever (the V16 web quota-abort hang).
 */
export const APPLY_TIMEOUT_MS = 120_000;

/** Bumped on every attempt; a timed-out attempt may no longer activate. */
let applyEpoch = 0;

/**
 * User-triggered staged update:
 *   existing snapshot → candidate → validate → persist → activate.
 * Any failure leaves the currently active snapshot in place.
 */
export async function applyContentUpdate(timeoutMs: number = APPLY_TIMEOUT_MS): Promise<boolean> {
  if (state.applying) return false;
  setState({ applying: true, error: null });
  const epoch = ++applyEpoch;
  const isCurrent = () => epoch === applyEpoch;
  const previous = await loadSnapshot();

  const work = async (): Promise<boolean> => {
    const { refreshSnapshotIncremental } = await import("./offline-snapshot");
    const candidate = await refreshSnapshotIncremental();

    const { validateSnapshot } = await import("./offline-snapshot-validate");
    const report = validateSnapshot(candidate);
    if (!report.ok) {
      // `report.issues` holds OBJECTS — joining them produced the
      // `[object Object]` the user saw. Always format them.
      throw new Error(`تعذّر التحقّق من المحتوى الجديد: ${formatIssues(report.issues as any)}`);
    }

    // Persist FIRST — activation only happens once the candidate is durable.
    await saveSnapshot(candidate);
    const stored = await loadSnapshot();
    if (!stored || stored.snapshot_version !== candidate.snapshot_version) {
      throw new Error("candidate did not persist; keeping previous snapshot");
    }

    // A timed-out attempt must never activate a candidate behind the user's
    // back — the durable write is harmless, partial activation is not.
    if (!isCurrent()) return false;

    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(stored);

    // Convergence (D): persist fingerprint + counts + editorial timestamps +
    // the observed reaction-polluted `stories.last_updated` together.
    await persistAppliedStoryIdentity(stored);

    // V17-09: media referenced by the freshly applied content (campaign
    // chapter images included) must become durable NOW, not on the next
    // boot — otherwise the player restarts offline and sees nothing.
    void import("./offline-snapshot-warm-bridge")
      .then((m) => m.warmSnapshotImageCache(stored.collections as Record<string, any[]>))
      .catch(() => { /* warming is best-effort */ });

    return true;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("انتهت مهلة تحديث المحتوى. حاول مرة أخرى لاحقًا.")),
      Math.max(1000, timeoutMs),
    );
  });

  try {
    const ok = await Promise.race([work(), timeout]);
    if (!isCurrent()) return false;
    if (!ok) throw new Error("تعذّر تفعيل المحتوى الجديد.");
    setState({ applying: false, available: false, collections: [], error: null, checkedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn("[content-update] update failed, keeping previous snapshot:", e);
    // Invalidate this attempt so a late background completion cannot activate.
    applyEpoch++;
    // Best-effort re-activation of the previous, still-valid snapshot.
    try {
      if (previous) {
        const { applyLocalSnapshot } = await import("./local-first-store");
        applyLocalSnapshot(previous);
      }
    } catch { /* ignore */ }
    // Retryable: `available` stays true so the banner can be tapped again.
    setState({ applying: false, error: formatError(e) });
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/** Test/diagnostics helper — resets the in-memory controller state. */
export function __resetContentUpdateState(): void {
  applyEpoch++;
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
