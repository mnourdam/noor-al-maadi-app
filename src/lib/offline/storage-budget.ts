/**
 * V16 — Web storage budget policy for disposable image warming.
 *
 * Root cause this guards against (proven on production web):
 *   Cache API image warming grew to ~2.096 GB of a ~2.103 GB origin quota.
 *   The ~18 MB offline-snapshot IndexedDB transaction then aborted with
 *   QuotaExceededError, the content update never persisted, and the
 *   "content update available" banner reappeared forever.
 *
 * Policy: CONTENT PERSISTENCE HAS PRIORITY OVER DISPOSABLE IMAGES.
 *   - Always keep a hard reserve free for snapshot / content writes.
 *   - Never let the origin exceed an absolute web cache budget.
 *   - Degrade safely when `navigator.storage.estimate()` is unavailable.
 *
 * Native (Capacitor Android) gets a conservative fixed ceiling for the
 * DISPOSABLE warmed image cache only (400 MB). Bundled offline assets, the
 * snapshot, auth and progress are never touched by this budget.
 */

/** Absolute ceiling for total origin usage on web while warming images. */
export const WEB_TOTAL_USAGE_BUDGET_BYTES = 700 * 1024 * 1024; // 700 MB

/** Free space that must remain available for snapshot/content writes. */
export const WEB_MIN_HEADROOM_BYTES = 300 * 1024 * 1024; // 300 MB

/** Fraction of the reported quota that must stay free, whichever is larger. */
export const WEB_MIN_HEADROOM_RATIO = 0.2;

/**
 * Absolute ceiling for the disposable warmed image cache on native Android.
 * Self-accounted (WebView `storage.estimate()` is unreliable on Android),
 * counts only bytes this warming pass writes.
 */
export const NATIVE_WARM_CACHE_BUDGET_BYTES = 400 * 1024 * 1024; // 400 MB

/** Re-measure real usage every N warmed images (estimate() is not free). */
const REESTIMATE_EVERY = 20;

/** Assumed bytes per warmed image when the response size is unknown. */
const ASSUMED_IMAGE_BYTES = 180 * 1024;

export function isNativeRuntime(): boolean {
  try {
    const cap = (globalThis as any)?.Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export interface StorageEstimateResult {
  usage: number;
  quota: number;
}

export async function estimateStorage(): Promise<StorageEstimateResult | null> {
  try {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (!nav?.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    const usage = Number(est?.usage);
    const quota = Number(est?.quota);
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/**
 * Maximum total origin usage we allow while warming images.
 * = min(absolute web budget, quota - max(headroom, ratio * quota))
 */
export function usageCeiling(quota: number): number {
  const headroom = Math.max(WEB_MIN_HEADROOM_BYTES, quota * WEB_MIN_HEADROOM_RATIO);
  return Math.max(0, Math.min(WEB_TOTAL_USAGE_BUDGET_BYTES, quota - headroom));
}

export interface WarmingBudget {
  /** True when warming must stop right now. */
  exhausted(): boolean;
  /** Record a warmed image; may trigger a re-measure. Returns `true` to stop. */
  note(bytes?: number): Promise<boolean>;
  /** Diagnostics. */
  describe(): string;
}

/** Fixed, self-accounted allowance used for native runtimes. */
function createFixedBudget(allowance: number, label: string): WarmingBudget {
  let written = 0;
  return {
    exhausted: () => written >= allowance,
    note: async (bytes?: number) => {
      written += Number.isFinite(bytes as number) && (bytes as number) > 0
        ? (bytes as number)
        : ASSUMED_IMAGE_BYTES;
      return written >= allowance;
    },
    describe: () => `${label} ${written}/${allowance} bytes`,
  };
}

/**
 * Create a warming budget for the current runtime.
 *
 * Degradation ladder:
 *   native                         → fixed 400 MB warmed-image allowance
 *   estimate() available           → stop when usage >= usageCeiling(quota)
 *   estimate() unavailable on web  → conservative fixed byte allowance
 */
export async function createWarmingBudget(): Promise<WarmingBudget> {
  if (isNativeRuntime()) {
    return createFixedBudget(NATIVE_WARM_CACHE_BUDGET_BYTES, "native warm cache");
  }

  const est = await estimateStorage();

  if (!est) {
    // No measurement possible (Safari private mode, old WebViews).
    // Allow a small, conservative, self-accounted allowance only.
    return createFixedBudget(150 * 1024 * 1024, "blind allowance");
  }

  const ceiling = usageCeiling(est.quota);
  const baseline = est.usage;
  let written = 0;
  let usage = est.usage;
  let sinceEstimate = 0;
  let stopped = usage >= ceiling;

  if (stopped) {
    console.warn(
      `[storage-budget] skipping image warming: usage ${usage} >= ceiling ${ceiling} (quota ${est.quota})`,
    );
  }

  return {
    exhausted: () => stopped,
    note: async (bytes?: number) => {
      if (stopped) return true;
      written += Number.isFinite(bytes as number) && (bytes as number) > 0
        ? (bytes as number)
        : ASSUMED_IMAGE_BYTES;
      usage = baseline + written;
      sinceEstimate++;
      if (usage >= ceiling) {
        stopped = true;
        return true;
      }
      if (sinceEstimate >= REESTIMATE_EVERY) {
        sinceEstimate = 0;
        const fresh = await estimateStorage();
        if (fresh) {
          // `estimate()` is padded/lagging in some engines — never let a
          // measurement erase bytes we know we just wrote.
          usage = Math.max(fresh.usage, baseline + written);
          if (usage >= usageCeiling(fresh.quota)) stopped = true;
        }
      }
      return stopped;
    },
    describe: () => `usage ${usage}/${ceiling} (quota ${est.quota})`,
  };
}
