// ============================================================
// Cinematic Opening — Persistence
// ------------------------------------------------------------
// Stores completion state keyed by opening version, so a future
// version bump (supplied by config, never fabricated here) can
// replay the opening for users who already saw the previous one.
// ============================================================

const KEY = "irth.cinematic-opening.completed-version.v1";

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
    }
  } catch { /* ignore */ }
}

export function hasCompleted(version: string): boolean {
  return readCompletedVersion() === version;
}

/** Test / admin escape hatch — clears completion so the opening replays. */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
