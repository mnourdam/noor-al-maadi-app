/**
 * The committed offline artifact is `public/offline-snapshot.json.gz`.
 * The expanded JSON is a build product (gitignored) that the build pipeline
 * inflates via `scripts/ensure-offline-snapshot.mjs`. Tests that inspect the
 * shipped content inflate it on demand through this helper.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const JSON_PATH = "public/offline-snapshot.json";
const GZ_PATH = "public/offline-snapshot.json.gz";

/** Raw text of the bundled snapshot, inflating the gz artifact if needed. */
export function readBundledSnapshotText(): string {
  if (existsSync(JSON_PATH)) return readFileSync(JSON_PATH, "utf-8");
  const text = gunzipSync(readFileSync(GZ_PATH)).toString("utf-8");
  writeFileSync(JSON_PATH, text);
  return text;
}

/** Parsed bundled snapshot. */
export function readBundledSnapshot(): any {
  return JSON.parse(readBundledSnapshotText());
}
