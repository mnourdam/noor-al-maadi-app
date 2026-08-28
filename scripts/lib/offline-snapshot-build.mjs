// ============================================================
// Pure build helpers for the offline snapshot generator.
// No network / no filesystem here so the logic is unit-testable.
// ============================================================
import { createHash } from "node:crypto";

export const SNAPSHOT_SCHEMA_VERSION = 2;

/**
 * Collection definitions. These MUST mirror the runtime filters in
 * `src/lib/offline-snapshot.ts` (COLLECTIONS) so the bundled snapshot and
 * a runtime full-fetch converge on exactly the same row set.
 */
export function buildCollectionDefs(atlasColumns) {
  return [
    {
      key: "encyclopedia_entities",
      table: "encyclopedia_entities",
      columns:
        "id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body,aliases,timeline_order,timeline_year,timeline_start_year,image_url,image_path,image_credit,image_source",
      filter: (q) => q.eq("enabled", true),
      required: true,
      manifestKey: "encyclopedia_entities",
    },
    { key: "admin_campaigns", table: "campaigns_public", required: true, manifestKey: "admin_campaigns" },
    {
      key: "investigations",
      table: "investigations_public",
      filter: (q) => q.eq("enabled", true),
      required: false,
      manifestKey: "investigations",
    },
    {
      key: "today_in_history_events",
      table: "today_in_history_events",
      filter: (q) => q.eq("enabled", true),
      required: false,
    },
    { key: "daily_facts", table: "daily_facts", filter: (q) => q.eq("enabled", true), required: false },
    {
      key: "atlas_entities",
      table: "atlas_entities",
      columns: atlasColumns,
      filter: (q) => q.eq("status", "published").eq("aps_verified", true),
      required: false,
      manifestKey: "atlas_entities",
    },
    { key: "content_registry", table: "content_registry", required: false },
  ];
}

/** Minimum sane counts — a candidate below these never replaces the committed file. */
export const MIN_COUNTS = {
  encyclopedia_entities: 1500,
  admin_campaigns: 60,
  investigations: 200,
  atlas_entities: 700,
};

export const REQUIRED_COLLECTION_KEYS = [
  "encyclopedia_entities",
  "admin_campaigns",
  "investigations",
  "today_in_history_events",
  "daily_facts",
  "atlas_entities",
  "content_registry",
];

/** Columns stripped from public campaign rows (parity with runtime pruning). */
const CAMPAIGN_PRIVATE_KEYS = ["draft_data", "last_editor_email", "updated_by"];

export function pruneRow(key, row) {
  if (!row || typeof row !== "object") return row;
  if (key === "admin_campaigns") {
    const clone = {};
    for (const k of Object.keys(row)) {
      if (CAMPAIGN_PRIVATE_KEYS.includes(k)) continue;
      clone[k] = row[k];
    }
    return clone;
  }
  return row;
}

export function canonicalJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Assert that a fully paginated fetch matched the authoritative count.
 * Throws (aborting generation) on any mismatch.
 */
export function assertExactCount(key, fetched, expected) {
  if (typeof expected !== "number" || !Number.isFinite(expected)) {
    throw new Error(`[snapshot-gen] ${key}: authoritative count unavailable — refusing to generate`);
  }
  if (fetched !== expected) {
    throw new Error(
      `[snapshot-gen] ${key}: fetched ${fetched} rows but authoritative count is ${expected} — aborting`,
    );
  }
  return true;
}

/** Build the snapshot document from already-fetched collections. */
export function buildSnapshot(collections, { now = Date.now(), source = "live" } = {}) {
  const content_counts = {};
  const collection_manifest = [];
  const ordered = {};
  for (const key of REQUIRED_COLLECTION_KEYS) {
    const rows = collections[key] ?? [];
    ordered[key] = rows;
    content_counts[key] = rows.length;
    collection_manifest.push({ key, count: rows.length, checksum: sha256Hex(canonicalJSON(rows)) });
  }
  return {
    snapshot_version: now,
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: new Date(now).toISOString(),
    source,
    content_counts,
    checksum: sha256Hex(canonicalJSON(ordered)),
    collection_manifest,
    collections: ordered,
  };
}

/**
 * Full integrity validation of a candidate snapshot. The generator refuses
 * to replace `public/offline-snapshot.json` unless this returns ok.
 */
export function validateCandidate(snap, { now = Date.now() } = {}) {
  const issues = [];
  if (!snap || typeof snap !== "object") return { ok: false, issues: ["candidate is not an object"] };
  if (snap.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    issues.push(`schema_version ${snap.schema_version} !== ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (typeof snap.snapshot_version !== "number") issues.push("snapshot_version is not a number");
  const generated = Date.parse(snap.generated_at ?? "");
  if (!Number.isFinite(generated)) issues.push("generated_at is not a valid date");
  else if (generated > now + 60_000) issues.push("generated_at is in the future");
  if (!snap.collections || typeof snap.collections !== "object") {
    issues.push("collections missing");
    return { ok: false, issues };
  }
  for (const key of REQUIRED_COLLECTION_KEYS) {
    const rows = snap.collections[key];
    if (!Array.isArray(rows)) {
      issues.push(`collections.${key} missing`);
      continue;
    }
    if (snap.content_counts?.[key] !== rows.length) {
      issues.push(`content_counts.${key}=${snap.content_counts?.[key]} != ${rows.length}`);
    }
    const min = MIN_COUNTS[key];
    if (typeof min === "number" && rows.length < min) {
      issues.push(`collections.${key} has ${rows.length} rows (min ${min})`);
    }
  }
  const entry = (snap.collection_manifest ?? []).find((m) => m.key === "encyclopedia_entities");
  if (!entry) issues.push("collection_manifest missing encyclopedia_entities");
  if (typeof snap.checksum !== "string" || snap.checksum.length < 32) issues.push("checksum missing");
  return { ok: issues.length === 0, issues };
}

/**
 * Compare a candidate/committed snapshot against the server content manifest.
 * Returns the list of collections whose local state trails the server.
 */
export function compareWithManifest(snap, manifest) {
  const stale = [];
  if (!Array.isArray(manifest) || !snap?.content_counts) return stale;
  const generated = Date.parse(snap.generated_at ?? "");
  for (const item of manifest) {
    const key =
      item.collection === "campaigns_public"
        ? "admin_campaigns"
        : item.collection === "investigations_public"
          ? "investigations"
          : item.collection;
    // Collections that the bundled snapshot intentionally does not carry
    // (stories are baseline-owned) are not comparable.
    if (!(key in snap.content_counts)) continue;
    const localCount = snap.content_counts[key];
    if (Number(item.total_count) !== localCount) {
      stale.push(`${key}: local ${localCount} vs server ${item.total_count}`);
      continue;
    }
    const serverDate = Date.parse(item.last_updated ?? "");
    if (Number.isFinite(serverDate) && Number.isFinite(generated) && serverDate > generated) {
      stale.push(`${key}: server updated ${item.last_updated} after snapshot ${snap.generated_at}`);
    }
  }
  return stale;
}
