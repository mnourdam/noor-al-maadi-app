/**
 * Guaranteed clean-boot contract.
 *
 * The production blocker this closes: a fatal route error persisted a
 * navigation/overlay state that was restored on the next launch, so the app
 * came back into the very same fatal screen — force-close included. The only
 * escape was clearing all app storage, which destroyed player data.
 *
 * Contract:
 *  1. Before the fatal screen renders we arm a one-launch crash marker.
 *  2. On the next launch we CONSUME the marker, clear ONLY transient
 *     navigation/error/overlay state, and boot at `/`.
 *  3. Home mounting successfully clears the failure counter.
 *  4. Two consecutive failed boots disable auto-healing and hand over to the
 *     static (React-free) recovery layer in `android-web/index.html`.
 *
 * Player data (account, progress, campaigns, museum, stories, settings,
 * offline snapshot) is NEVER touched.
 */

import {
  CRASH_BOOT_FAILURES_KEY,
  CRASH_PENDING_KEY,
  CRASH_REPORTS_KEY,
} from "./crash-report";

/** Flag read by the static boot layer to render React-free recovery. */
export const STATIC_RECOVERY_KEY = "irth.crash.staticRecovery";

/**
 * localStorage keys that are safe to drop — navigation, error, overlay and
 * boot bookkeeping only. Anything not matched here is preserved.
 */
const TRANSIENT_LOCAL_PATTERNS: RegExp[] = [
  /^irth\.crash\./,
  /^irth\.nav\./,
  /^irth\.route\./,
  /^irth\.overlay\./,
  /^irth\.boot/,
  /^tsr-scroll-restoration/i,
  /^tanstack\.router\./i,
  /^irth:navigation:/,
];

/** sessionStorage is transient by definition, but we stay explicit. */
const TRANSIENT_SESSION_PATTERNS: RegExp[] = [
  /^irth\./,
  /^n-root-recovered$/,
  /^tsr-scroll-restoration/i,
  /^tanstack\.router\./i,
];

/** Never removed by any recovery action, even if a pattern above matched. */
const PRESERVE_EXACT = new Set<string>([
  "irth.offline.snapshot",
  "irth.offline.snapshot.v2",
  // Diagnostics must survive the very boot that consumes the crash marker —
  // otherwise the report we need is destroyed by its own recovery.
  CRASH_REPORTS_KEY,
]);

/** Loop-breaker bookkeeping: preserved on automatic boots, cleared on an
 *  explicit user-initiated navigation reset. */
const LOOP_BREAKER_KEYS = [CRASH_BOOT_FAILURES_KEY, STATIC_RECOVERY_KEY];

function clearMatching(store: Storage, patterns: RegExp[], extraPreserve: string[] = []): string[] {
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (PRESERVE_EXACT.has(k) || extraPreserve.includes(k)) continue;
      if (!patterns.some((re) => re.test(k))) continue;
      try { store.removeItem(k); removed.push(k); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return removed;
}

/**
 * Clear ONLY router restoration state, crash/recovery markers, transient
 * navigation cache and overlay/lock ownership. Returns the removed keys so
 * the UI can show exactly what was reset.
 */
export function resetNavigationState(opts: { preserveLoopBreaker?: boolean } = {}): string[] {
  const keep = opts.preserveLoopBreaker ? LOOP_BREAKER_KEYS : [];
  const removed: string[] = [];
  try { removed.push(...clearMatching(localStorage, TRANSIENT_LOCAL_PATTERNS, keep).map((k) => `L:${k}`)); } catch { /* ignore */ }
  try { removed.push(...clearMatching(sessionStorage, TRANSIENT_SESSION_PATTERNS, keep).map((k) => `S:${k}`)); } catch { /* ignore */ }
  // Drop any router history state that could re-enter the failed route.
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
  return removed;
}

function readFailureCount(): number {
  try {
    const n = Number(localStorage.getItem(CRASH_BOOT_FAILURES_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeFailureCount(n: number) {
  try {
    if (n <= 0) localStorage.removeItem(CRASH_BOOT_FAILURES_KEY);
    else localStorage.setItem(CRASH_BOOT_FAILURES_KEY, String(n));
  } catch { /* ignore */ }
}

export type SafeBootResult = {
  /** A crash marker from the previous session was consumed. */
  recovered: boolean;
  /** Consecutive failed boots including this one. */
  failures: number;
  /** Route we refused to restore. */
  skippedRoute: string;
  /** Keys removed by the reset. */
  cleared: string[];
};

/**
 * Run BEFORE the router mounts. Idempotent and never throws.
 */
export function runSafeBootContract(): SafeBootResult {
  const result: SafeBootResult = { recovered: false, failures: 0, skippedRoute: "", cleared: [] };
  let pendingRaw: string | null = null;
  try { pendingRaw = localStorage.getItem(CRASH_PENDING_KEY); } catch { /* ignore */ }
  if (!pendingRaw) {
    // Healthy launch path: nothing to consume. The failure counter is only
    // cleared once Home actually mounts (see markBootHealthy).
    result.failures = readFailureCount();
    return result;
  }

  result.recovered = true;
  try {
    const parsed = JSON.parse(pendingRaw) as { route?: string };
    result.skippedRoute = String(parsed?.route ?? "");
  } catch { /* ignore */ }

  // Consume the marker FIRST — a throw below must never re-arm the loop.
  try { localStorage.removeItem(CRASH_PENDING_KEY); } catch { /* ignore */ }

  const failures = readFailureCount() + 1;
  result.failures = failures;
  writeFailureCount(failures);

  result.cleared = resetNavigationState({ preserveLoopBreaker: true });

  if (failures >= 2) {
    // Loop breaker: stop auto-healing and let the static layer take over on
    // the NEXT launch. This launch still gets one clean root boot attempt.
    try { localStorage.setItem(STATIC_RECOVERY_KEY, "1"); } catch { /* ignore */ }
  }

  // Never restore the failed nested route.
  try {
    if (location.pathname !== "/" || location.search || location.hash) {
      history.replaceState(null, "", "/");
    }
  } catch { /* ignore */ }

  return result;
}

/** Called once Home has actually rendered — the app is provably healthy. */
export function markBootHealthy() {
  writeFailureCount(0);
  try { localStorage.removeItem(CRASH_PENDING_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(STATIC_RECOVERY_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem("irth.boot-root-recovered"); } catch { /* ignore */ }
}

/**
 * Hard escape to Home. Deliberately bypasses the React router and the
 * existing history stack — both may be exactly what is broken.
 */
export function hardEscapeToHome(opts: { resetNavigation?: boolean } = {}) {
  try { localStorage.removeItem(CRASH_PENDING_KEY); } catch { /* ignore */ }
  if (opts.resetNavigation) resetNavigationState();
  try {
    const target = `${location.origin}/`;
    // Replace, never push: the failed entry must not stay reachable via Back.
    try { history.replaceState(null, "", "/"); } catch { /* ignore */ }
    location.replace(target);
  } catch {
    try { location.reload(); } catch { /* ignore */ }
  }
}
