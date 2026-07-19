// ============================================================
// Cinematic Opening — Persistence
// ------------------------------------------------------------
// Stores completion state keyed by opening version, plus a
// first-ever-launch marker used by the unified first-launch
// state machine to neutralize the branded splash on the very
// first run.
// ============================================================

const KEY = "irth.cinematic-opening.completed-version.v1";
const FIRST_LAUNCH_KEY = "irth.firstLaunch.completed.v1";
const PERM_ASKED_KEY = "irth.notification.permission.asked.v1";

export function readCompletedVersion(): string | null {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markCompleted(version: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, version);
      window.localStorage.setItem(FIRST_LAUNCH_KEY, "1");
    }
  } catch { /* ignore */ }
}

export function hasCompleted(version: string): boolean {
  return readCompletedVersion() === version;
}

/** True when the device has NEVER completed the opening — the flow
 *  responsible for the branded splash must return null on this run
 *  so the cinematic opening owns the entire first-launch canvas. */
export function isFirstEverLaunch(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FIRST_LAUNCH_KEY) !== "1";
  } catch {
    return false;
  }
}

/** Records that we have already prompted (or attempted to prompt)
 *  for notification permission during the first-launch flow so we
 *  never prompt twice. */
export function markNotificationPermissionAsked(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PERM_ASKED_KEY, "1");
    }
  } catch { /* ignore */ }
}

export function hasAskedNotificationPermission(): boolean {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(PERM_ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Test / admin escape hatch — clears completion so the opening replays. */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(FIRST_LAUNCH_KEY);
      window.localStorage.removeItem(PERM_ASKED_KEY);
    }
  } catch { /* ignore */ }
}
