// ============================================================
// One-time migration for legacy/orphan unlocked registry IDs.
// ------------------------------------------------------------
// A handful of campaigns historically wrote unlock ids that no
// longer resolve to any encyclopedia entity (either typo or
// pre-canonical slug). We rewrite those ids in place inside
// `irth_campaign_progress` so the museum can resolve them and
// the "عنصر مفتوح بلا صفحة موسوعية" warning disappears without
// losing any legitimate unlock.
//
// Mapping verified against encyclopedia_entities:
//   jabal-al-nour      → jabal-al-nour          (landmark, already canonical)
//   dar-al-arqam       → dar-al-arqam           (landmark, already canonical)
//   abu-ubaidah-ibn    → abu-ubaidah-ibn-al-jarrah   (figure)
//   khalid-ibn-al-walid → khalid                (figure)
//
// The first two are kept as a passthrough so future variants that
// arrive with a type prefix (e.g. "landmark:jabal-al-nour") are
// still normalized to the bare canonical slug.
// ============================================================

import { PROGRESS_KEY } from "./importedCampaignProgress";

const MIGRATION_KEY = "irth.orphanUnlocks.migrated.v1";

const REMAP: Record<string, string> = {
  "jabal-al-nour": "jabal-al-nour",
  "dar-al-arqam": "dar-al-arqam",
  "abu-ubaidah-ibn": "abu-ubaidah-ibn-al-jarrah",
  "abu-ubaidah-ibn-": "abu-ubaidah-ibn-al-jarrah",
  "khalid-ibn-al-walid": "khalid",
};

function canonicalize(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return trimmed;
  // Strip an optional `type:` prefix so the slug can be matched directly.
  const [, ...rest] = trimmed.includes(":") ? trimmed.split(":") : ["", trimmed];
  const slug = (rest.join(":") || trimmed).toLowerCase();
  return REMAP[slug] ?? trimmed;
}

export function migrateOrphanUnlocks(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(MIGRATION_KEY) === "1") return;
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      window.localStorage.setItem(MIGRATION_KEY, "1");
      return;
    }
    const map = JSON.parse(raw) as Record<string, { unlockedRegistryIds?: string[] }>;
    let changed = false;
    for (const cid of Object.keys(map ?? {})) {
      const ids = map[cid]?.unlockedRegistryIds;
      if (!Array.isArray(ids) || ids.length === 0) continue;
      const next: string[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const mapped = canonicalize(id);
        if (mapped !== id) changed = true;
        if (!seen.has(mapped)) { seen.add(mapped); next.push(mapped); }
      }
      if (changed) map[cid].unlockedRegistryIds = next;
    }
    if (changed) window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    window.localStorage.setItem(MIGRATION_KEY, "1");
  } catch { /* ignore */ }
}
