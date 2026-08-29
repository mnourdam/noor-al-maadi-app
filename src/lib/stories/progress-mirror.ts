// ============================================================
// Stories — AUTHENTICATED progress mirror (V16, read-only cache)
// ------------------------------------------------------------
// Server truth for a signed-in player lives in
// `user_story_progress` / `user_story_completions` and is surfaced by
// `list_stories_v2`. The local-first summary path had no mirror of
// that state, so whenever the RPC timed out (cold Android start,
// airplane mode, lying `navigator.onLine`) every previously read or
// completed story rendered as "جديدة".
//
// CONTRACT
//   * This is a CACHE, not a source of truth. Server always wins.
//   * It is NEVER uploaded, and no reconciliation here produces a
//     server write.
//   * Strictly namespaced by `auth.uid()`:
//       irth.story_progress_mirror.v1.<userId>
//     Guest/sign-out reads never touch an authenticated namespace,
//     and a mirror belonging to another user is never read or
//     deleted on account switch (signing back in reuses it, then the
//     next authoritative response refreshes it).
//   * Monotonic/non-destructive: absence from a payload NEVER erases
//     a row. Completion is never downgraded by an omission.
// ============================================================

export const MIRROR_KEY_PREFIX = "irth.story_progress_mirror.v1.";
export const MIRROR_SCHEMA_VERSION = 1;

export interface MirrorEntry {
  /** Sticky server-observed completion. */
  completed: boolean;
  lastSceneIndex: number | null;
  maxSceneIndexReached: number | null;
  /** `stories.content_version` observed with this state, when known. */
  contentVersion: number | null;
  /** Server timestamp when available (never synthesised). */
  serverUpdatedAt: string | null;
  /** Local bookkeeping only. */
  cachedAt: number;
}

export interface MirrorBlob {
  v: number;
  uid: string;
  updatedAt: number;
  entries: Record<string, MirrorEntry>;
}

function ls(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function mirrorKey(uid: string): string {
  return `${MIRROR_KEY_PREFIX}${uid}`;
}

function emptyBlob(uid: string): MirrorBlob {
  return { v: MIRROR_SCHEMA_VERSION, uid, updatedAt: 0, entries: {} };
}

/** Read the mirror for EXACTLY this uid. Any mismatch yields an empty mirror. */
export function readMirror(uid: string | null | undefined): MirrorBlob {
  const id = String(uid ?? "").trim();
  if (!id) return emptyBlob("");
  const store = ls();
  if (!store) return emptyBlob(id);
  try {
    const raw = store.getItem(mirrorKey(id));
    if (!raw) return emptyBlob(id);
    const parsed = JSON.parse(raw) as MirrorBlob;
    if (!parsed || parsed.v !== MIRROR_SCHEMA_VERSION) return emptyBlob(id);
    // Hard identity guard — a blob stamped for another uid is ignored.
    if (parsed.uid !== id) return emptyBlob(id);
    if (!parsed.entries || typeof parsed.entries !== "object") return emptyBlob(id);
    return parsed;
  } catch { return emptyBlob(id); }
}

function writeMirror(blob: MirrorBlob): void {
  const store = ls();
  if (!store || !blob.uid) return;
  try {
    blob.updatedAt = Date.now();
    store.setItem(mirrorKey(blob.uid), JSON.stringify(blob));
  } catch { /* quota — cache only, safe to lose */ }
}

function baseEntry(prev?: MirrorEntry): MirrorEntry {
  return prev ?? {
    completed: false,
    lastSceneIndex: null,
    maxSceneIndexReached: null,
    contentVersion: null,
    serverUpdatedAt: null,
    cachedAt: 0,
  };
}

function maxOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

export interface AuthoritativeStoryRow {
  id: string;
  completed?: boolean | null;
  content_version?: number | null;
  progress?: { last_scene_index?: number | null; max_scene_index_reached?: number | null } | null;
  updated_at?: string | null;
}

/**
 * Merge an AUTHORITATIVE list response (`list_stories_v2`).
 * Rows present in the payload take the server's value (server wins,
 * including a `completed: false`). Rows absent from the payload are
 * left untouched — an omission is never evidence of "not completed".
 */
export function mergeAuthoritativeRows(
  uid: string | null | undefined,
  rows: readonly AuthoritativeStoryRow[] | null | undefined,
): MirrorBlob {
  const id = String(uid ?? "").trim();
  const blob = readMirror(id);
  if (!id || !Array.isArray(rows) || rows.length === 0) return blob;

  for (const row of rows) {
    if (!row?.id) continue;
    const key = String(row.id);
    const prev = baseEntry(blob.entries[key]);
    blob.entries[key] = {
      completed: typeof row.completed === "boolean" ? row.completed : prev.completed,
      lastSceneIndex: row.progress
        ? row.progress.last_scene_index ?? prev.lastSceneIndex
        : prev.lastSceneIndex,
      maxSceneIndexReached: row.progress
        ? maxOf(prev.maxSceneIndexReached, row.progress.max_scene_index_reached ?? null)
        : prev.maxSceneIndexReached,
      contentVersion: row.content_version ?? prev.contentVersion,
      serverUpdatedAt: row.updated_at ?? prev.serverUpdatedAt,
      cachedAt: Date.now(),
    };
  }
  writeMirror(blob);
  return blob;
}

/** Upsert ONLY the affected story after a successful progress RPC. */
export function upsertProgress(
  uid: string | null | undefined,
  storyId: string,
  progress: { lastSceneIndex?: number | null; maxSceneIndexReached?: number | null },
): MirrorBlob {
  const id = String(uid ?? "").trim();
  const blob = readMirror(id);
  if (!id || !storyId) return blob;
  const prev = baseEntry(blob.entries[storyId]);
  blob.entries[storyId] = {
    ...prev,
    lastSceneIndex: progress.lastSceneIndex ?? prev.lastSceneIndex,
    maxSceneIndexReached: maxOf(prev.maxSceneIndexReached, progress.maxSceneIndexReached ?? null),
    cachedAt: Date.now(),
  };
  writeMirror(blob);
  return blob;
}

/** Upsert ONLY the affected story after a successful completion RPC. */
export function markCompleted(
  uid: string | null | undefined,
  storyId: string,
  meta?: { contentVersion?: number | null; completedAt?: string | null },
): MirrorBlob {
  const id = String(uid ?? "").trim();
  const blob = readMirror(id);
  if (!id || !storyId) return blob;
  const prev = baseEntry(blob.entries[storyId]);
  blob.entries[storyId] = {
    ...prev,
    completed: true,
    contentVersion: meta?.contentVersion ?? prev.contentVersion,
    serverUpdatedAt: meta?.completedAt ?? prev.serverUpdatedAt,
    cachedAt: Date.now(),
  };
  writeMirror(blob);
  return blob;
}

/** Explicit removal — only used by deliberate privacy teardown. */
export function clearMirror(uid: string | null | undefined): void {
  const id = String(uid ?? "").trim();
  const store = ls();
  if (!store || !id) return;
  try { store.removeItem(mirrorKey(id)); } catch { /* ignore */ }
}
