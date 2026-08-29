/**
 * V16 — Story editorial content identity (Stage 2 fingerprint).
 *
 * Why this exists
 * ---------------
 * `stories.updated_at` is bumped by the `social_reactions_sync_counter()`
 * trigger (it writes `reaction_count` on the story row), so the cheap content
 * manifest cannot distinguish "an editor republished a story" from "a player
 * liked a story". Count identity alone is not enough either: editing a title,
 * a scene, an unlock rule or a cover never changes the row count.
 *
 * Stage 2 therefore derives a deterministic SHA-256 fingerprint from the
 * EXISTING public RPC `stories_snapshot_manifest_v2()`, which already returns
 * an editorial projection (no `reaction_count`, no social counters) and
 * carries `checksum_sha256` for every media row — so media identity needs no
 * byte download.
 *
 * Pure functions here; persistence lives in `content-identity-store.ts`.
 */

/** Top-level manifest envelope fields that are runtime-only. */
const VOLATILE_TOP_LEVEL = new Set(["ok", "generated_at", "include_on_demand"]);

/**
 * Row fields excluded from the fingerprint everywhere they appear.
 * Two groups:
 *   - social/runtime counters written by player activity
 *   - bookkeeping timestamps that move without editorial meaning
 */
export const EXCLUDED_ROW_FIELDS = new Set([
  // social / player-generated counters
  "reaction_count",
  "like_count",
  "likes_count",
  "comment_count",
  "comments_count",
  "view_count",
  "views_count",
  "completion_count",
  "favorite_count",
  "play_count",
  // bookkeeping timestamps / auditing
  "updated_at",
  "created_at",
  "verified_at",
  "verified_by",
  "previous_draft",
  "previous_draft_at",
  "last_seen_at",
  "generated_at",
]);

/** Collections that make up the Story editorial identity, in fixed order. */
export const IDENTITY_COLLECTIONS = [
  "stories",
  "story_scenes",
  "story_media",
  "story_collections",
] as const;

type Row = Record<string, unknown>;

function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Canonicalize an arbitrary JSON value:
 *   - object keys sorted lexicographically
 *   - excluded fields dropped at every depth
 *   - `undefined` normalised to `null` (JSON has no undefined)
 *   - arrays keep their (already deterministic) order
 */
export function canonicalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (isPlainObject(value)) {
    const out: Row = {};
    for (const key of Object.keys(value).sort()) {
      if (EXCLUDED_ROW_FIELDS.has(key)) continue;
      out[key] = canonicalizeValue(value[key]);
    }
    return out;
  }
  return value;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Deterministic sort key per collection, built from stable primary keys. */
function sortKey(collection: string, row: Row): string {
  switch (collection) {
    case "story_scenes":
      return [
        str(row["story_id"]),
        String(Number(row["scene_index"] ?? 0)).padStart(6, "0"),
        str(row["id"]),
      ].join("\u0000");
    case "story_media":
      return [str(row["story_id"]), str(row["id"])].join("\u0000");
    default:
      return str(row["id"]);
  }
}

function canonicalRows(collection: string, rows: unknown): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isPlainObject)
    .map((r) => canonicalizeValue(r) as Row)
    .sort((a, b) => {
      const ka = sortKey(collection, a);
      const kb = sortKey(collection, b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

/**
 * Build the canonical editorial payload string for a
 * `stories_snapshot_manifest_v2()` response. Deterministic regardless of the
 * key order or row order the server happens to emit.
 */
export function canonicalStoryPayload(manifest: unknown): string {
  const src = isPlainObject(manifest) ? manifest : {};
  const body: Row = {};
  for (const key of IDENTITY_COLLECTIONS) {
    if (VOLATILE_TOP_LEVEL.has(key)) continue;
    body[key] = canonicalRows(key, src[key]);
  }
  return JSON.stringify({ v: 1, ...body });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of the canonical payload. Returns null when WebCrypto is absent. */
export async function sha256Hex(input: string): Promise<string | null> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) return null;
  try {
    const bytes = new TextEncoder().encode(input);
    return toHex(await subtle.digest("SHA-256", bytes));
  } catch {
    return null;
  }
}

/**
 * Deterministic editorial fingerprint of a story manifest payload.
 * `null` means "could not compute" — callers MUST fail quiet (no banner).
 */
export async function storyEditorialFingerprint(
  manifest: unknown,
): Promise<string | null> {
  return sha256Hex(canonicalStoryPayload(manifest));
}
