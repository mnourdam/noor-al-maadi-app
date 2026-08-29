#!/usr/bin/env node
// ============================================================
// verify-story-references — packaged Story unlock reference gate (V16)
// ------------------------------------------------------------
// A shipped baseline must never reference an encyclopedia entity that is
// missing from, or disabled in, the packaged snapshot. That combination is
// exactly what produced an unopenable locked Story with a dead CTA on
// Android (the "Alhambra / Nasrid" regression).
//
// Fails the build with a readable report:
//   story id + title, bad ref, and the canonical replacement when known.
// Read-only: never mutates content.
// ============================================================

import { readFileSync, existsSync } from "node:fs";

const BASELINE = "public/baseline-content.json";
const SNAPSHOT = "public/offline-snapshot.json";

const REDIRECT_KEYS = ["canonical_id", "merged_into", "converted_to", "redirect_to"];

function fail(msg) {
  console.error(`[story-refs] ${msg}`);
  process.exit(1);
}

/** Recursively collect entity_discovered refs from any unlock spec shape. */
export function collectEntityRefs(node, out = new Set()) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectEntityRefs(n, out);
    return out;
  }
  if (typeof node !== "object") return out;
  const type = typeof node.type === "string" ? node.type : null;
  if (type === "entity_discovered" && typeof node.ref === "string") out.add(node.ref.trim());
  if (type === "entities_discovered" && Array.isArray(node.refs)) {
    for (const r of node.refs) if (typeof r === "string") out.add(r.trim());
  }
  for (const key of ["expr", "of", "children", "child", "spec", "all", "any", "conditions"]) {
    if (node[key]) collectEntityRefs(node[key], out);
  }
  return out;
}

function redirectOf(row) {
  const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : null;
  if (!meta) return null;
  for (const k of REDIRECT_KEYS) {
    const v = meta[k];
    if (typeof v === "string" && v.trim() && v.trim() !== row.id) return v.trim();
  }
  return null;
}

function main() {
  for (const f of [BASELINE, SNAPSHOT]) {
    if (!existsSync(f)) fail(`${f} is missing — cannot verify packaged Story references`);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

  const stories = baseline?.collections?.stories ?? [];
  const entities = snapshot?.collections?.encyclopedia_entities ?? [];
  if (!Array.isArray(stories) || stories.length === 0) fail("packaged baseline has no stories");
  if (!Array.isArray(entities) || entities.length === 0) fail("packaged snapshot has no encyclopedia entities");

  const byId = new Map(entities.map((e) => [String(e.id), e]));
  const findings = [];

  for (const s of stories) {
    let spec = s?.unlock_spec;
    if (typeof spec === "string") {
      try { spec = JSON.parse(spec); } catch {
        findings.push({ story: s.id, title: s.title, ref: "-", kind: "malformed unlock_spec" });
        continue;
      }
    }
    for (const ref of collectEntityRefs(spec)) {
      if (!ref) {
        findings.push({ story: s.id, title: s.title, ref: "(empty)", kind: "empty reference" });
        continue;
      }
      const row = byId.get(ref);
      if (!row) {
        findings.push({ story: s.id, title: s.title, ref, kind: "missing from packaged snapshot" });
      } else if (row.enabled === false) {
        const canonical = redirectOf(row);
        findings.push({
          story: s.id, title: s.title, ref, kind: "disabled entity",
          canonical: canonical && byId.get(canonical)?.enabled !== false ? canonical : null,
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error(`[story-refs] ${findings.length} invalid Story unlock reference(s):`);
    for (const f of findings) {
      console.error(
        `  • story ${f.story} (${f.title ?? "بدون عنوان"}) → ${f.ref} — ${f.kind}` +
        (f.canonical ? ` — canonical replacement: ${f.canonical}` : ""),
      );
    }
    fail("packaged Story unlock references are invalid — regenerate the baseline/snapshot");
  }

  console.log(`[story-refs] OK — ${stories.length} stories, all entity unlock references canonical and enabled`);
}

if (process.argv[1] && process.argv[1].endsWith("verify-story-references.mjs")) main();
