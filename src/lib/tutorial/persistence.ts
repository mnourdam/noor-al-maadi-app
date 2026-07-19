// ============================================================
// Guided Tutorial — Persistence
// ------------------------------------------------------------
// Device-scoped, version-keyed completion marker.
//
// Stored shape at KEY (JSON):
//   { "version": 1, "completedAt": 1737302400 }   // unix seconds
//
// Completion logic compares only `version`. `completedAt` is stored
// for future extensibility (analytics, admin diagnostics) and is
// never required by the engine.
//
// Rules (from product spec):
//   - Natural finish → writes current version
//   - Skip           → writes current version
//   - Force-close    → writes nothing
//
// Sign-in / sign-out / account switching do NOT replay the tour
// because the key lives in device localStorage. A version bump
// replays it once per device; clear-data/uninstall replays it.
// ============================================================

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
    // Object shape (preferred).
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
    // Backwards-compat: earlier scaffold wrote a bare integer string.
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return { version: n, completedAt: 0 };
    return null;
  } catch {
    return null;
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

export function markCompleted(version: number): void {
  try {
    if (typeof window !== "undefined") {
      const record: StoredRecord = {
        version,
        completedAt: Math.floor(Date.now() / 1000),
      };
      window.localStorage.setItem(KEY, JSON.stringify(record));
    }
  } catch {
    /* ignore */
  }
}

/** Admin/diagnostic escape hatch. */
export function resetCompletion(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}
