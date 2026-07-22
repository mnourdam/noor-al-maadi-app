#!/usr/bin/env node
// ============================================================
// Offline Snapshot Build Guard (schema v2)
// ------------------------------------------------------------
// Verifies public/offline-snapshot.json before Vite bundles it,
// and verifies android/app/src/main/assets/public/offline-snapshot.json
// after `cap sync` copies it. Post-sync mode additionally cross-
// checks byte size + sha256 against the source so a stale APK
// input tree cannot silently ship.
//
// Snapshot schema (current, v2):
//   {
//     snapshot_version: number,
//     schema_version: 2,
//     generated_at: string,
//     source: string,
//     content_counts: { <key>: number, ... },
//     checksum: <sha256 of collections>,
//     collection_manifest: [ { key, count, checksum } ],
//     collections: {
//       encyclopedia_entities: [...],
//       admin_campaigns: [...],
//       investigations: [...],
//       today_in_history_events: [...],
//       daily_facts: [...],
//       atlas_entities: [...],
//       content_registry: [...],
//     }
//   }
// ============================================================

import { existsSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const MODE = process.argv[2] ?? "pre"; // "pre" | "post"

const SOURCE_PATH = "public/offline-snapshot.json";
const SYNCED_PATH = "android/app/src/main/assets/public/offline-snapshot.json";

const MIN_BYTES = 500_000;
const REQUIRED_SCHEMA_VERSION = 2;

// Approved minimum baselines. Content is only ever added, so counts
// must never regress below these floors. Non-required collections
// (daily_facts, content_registry, today_in_history_events) may be
// present but empty — they are not gating.
const REQUIRED_COLLECTIONS = [
  "encyclopedia_entities",
  "admin_campaigns",
  "investigations",
  "atlas_entities",
  "today_in_history_events",
  "daily_facts",
  "content_registry",
];

const MIN_COUNTS = {
  encyclopedia_entities: 1500,
  admin_campaigns: 60,
  investigations: 200,
  atlas_entities: 700,
};

function fatal(msg) {
  console.error(`\n[offline-snapshot-guard] FAIL: ${msg}\n`);
  process.exit(1);
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function loadAndValidate(rel) {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs)) fatal(`missing ${rel}`);
  const st = statSync(abs);
  if (!st.isFile()) fatal(`${rel} is not a file`);
  if (st.size < MIN_BYTES) {
    fatal(`${rel} is only ${st.size} bytes (min ${MIN_BYTES}) — snapshot empty or truncated`);
  }

  const rawBuf = readFileSync(abs);
  const raw = rawBuf.toString("utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fatal(`${rel} is not valid JSON: ${e?.message ?? e}`);
  }
  if (!parsed || typeof parsed !== "object") fatal(`${rel} does not parse as an object`);

  // Legacy schema (parsed.entities) → hard fail with clear message.
  if (Array.isArray(parsed.entities) && !parsed.collections) {
    fatal(
      `${rel} uses legacy schema (parsed.entities). ` +
        `Expected schema_version ${REQUIRED_SCHEMA_VERSION} with parsed.collections.*`
    );
  }

  if (parsed.schema_version !== REQUIRED_SCHEMA_VERSION) {
    fatal(
      `${rel} schema_version = ${parsed.schema_version}; expected ${REQUIRED_SCHEMA_VERSION}`
    );
  }
  if (typeof parsed.snapshot_version !== "number") {
    fatal(`${rel} missing numeric snapshot_version`);
  }
  if (typeof parsed.checksum !== "string" || parsed.checksum.length < 32) {
    fatal(`${rel} missing/invalid checksum`);
  }
  if (!parsed.collections || typeof parsed.collections !== "object") {
    fatal(`${rel} missing collections object`);
  }

  const counts = {};
  for (const key of REQUIRED_COLLECTIONS) {
    const val = parsed.collections[key];
    if (!Array.isArray(val)) {
      fatal(`${rel} collections.${key} missing or not an array`);
    }
    counts[key] = val.length;
  }

  // Enforce gated minimums.
  for (const [key, min] of Object.entries(MIN_COUNTS)) {
    if (counts[key] < min) {
      fatal(
        `${rel} collections.${key} has ${counts[key]} items (min ${min}) — suspiciously empty/regressed`
      );
    }
  }

  // Cross-check content_counts vs actual array lengths (defense in depth).
  if (parsed.content_counts && typeof parsed.content_counts === "object") {
    for (const key of REQUIRED_COLLECTIONS) {
      const declared = parsed.content_counts[key];
      if (typeof declared === "number" && declared !== counts[key]) {
        fatal(
          `${rel} content_counts.${key} = ${declared} does not match actual length ${counts[key]}`
        );
      }
    }
  }

  const digest = sha256(rawBuf);
  console.log(
    `[offline-snapshot-guard] ok: ${rel} ` +
      `(size=${st.size}, schema=${parsed.schema_version}, ` +
      `snapshot_version=${parsed.snapshot_version}, sha256=${digest.slice(0, 12)}…)`
  );
  console.log(`  counts: ${JSON.stringify(counts)}`);

  return { size: st.size, digest, parsed, counts };
}

if (MODE === "pre") {
  loadAndValidate(SOURCE_PATH);
} else if (MODE === "post") {
  const src = loadAndValidate(SOURCE_PATH);
  const dst = loadAndValidate(SYNCED_PATH);
  if (src.size !== dst.size) {
    fatal(
      `post-sync size mismatch: source=${src.size} synced=${dst.size} — cap sync did not copy the current snapshot`
    );
  }
  if (src.digest !== dst.digest) {
    fatal(
      `post-sync sha256 mismatch:\n  source=${src.digest}\n  synced=${dst.digest}\n` +
        `— APK input tree has a stale offline snapshot`
    );
  }
  if (src.parsed.schema_version !== dst.parsed.schema_version) {
    fatal(`post-sync schema_version mismatch`);
  }
  if (src.parsed.snapshot_version !== dst.parsed.snapshot_version) {
    fatal(
      `post-sync snapshot_version mismatch: source=${src.parsed.snapshot_version} synced=${dst.parsed.snapshot_version}`
    );
  }
  for (const key of REQUIRED_COLLECTIONS) {
    if (src.counts[key] !== dst.counts[key]) {
      fatal(
        `post-sync count mismatch for ${key}: source=${src.counts[key]} synced=${dst.counts[key]}`
      );
    }
  }
  console.log(
    `[offline-snapshot-guard] post-sync verified: source ≡ synced (sha256=${src.digest.slice(0, 12)}…)`
  );
} else {
  fatal(`unknown mode "${MODE}" — expected "pre" or "post"`);
}
