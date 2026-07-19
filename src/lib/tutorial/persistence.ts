// ============================================================
// Guided Tutorial — Persistence
// ------------------------------------------------------------
// Device-scoped, version-keyed completion marker. Sign-in /
// sign-out / account switching do NOT replay the tour because the
// key lives in device localStorage, not per-account storage.
//
// A version bump replays the tour once per device; a clear-data /
// uninstall replays it because the key disappears with the storage.
//
// Rules (from product spec):
//   - Natural finish → writes current version
//   - Skip           → writes current version
//   - Force-close    → writes nothing
// ============================================================

const KEY = "irth.tutorial.irth-first-time.completed-version.v1";

/** Stored shape at KEY: a plain integer string (e.g. `"1"`). The
 *  engine compares numerically to the active `TutorialConfig.version`
 *  to detect version bumps. */

export function readCompletedVersion(): number | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function hasCompleted(version: number): boolean {
  const stored = readCompletedVersion();
  return stored != null && stored >= version;
}

export function markCompleted(version: number): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, String(version));
    }
  } catch {
    /* ignore */
  }
}

/** Admin/diagnostic escape hatch. Wired to a UI control in a later
 *  phase; exported now so it exists as part of the persistence
 *  surface. */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}
