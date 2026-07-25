// ============================================================
// Museum runtime visibility rule.
// ------------------------------------------------------------
// An artifact (encyclopedia_entities row, entity_type='artifact')
// is visible in the player-facing museum if ANY of:
//
//   1. admin-imported   — has provenance markers in metadata
//   2. campaign-referenced — referenced from any admin_campaigns
//      core/supporting/reward unlock list
//   3. museum_enabled   — metadata.museum_enabled === true
//                         (or metadata.museum.museum_enabled === true)
//
// Otherwise it is treated as legacy/demo and hidden at runtime.
// No rows are deleted or archived — visibility filtering only.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { ensureLocalSnapshotLoaded, localPublishedCampaigns } from "@/lib/local-first-store";

export type ArtifactClassification = {
  adminImported: boolean;
  hasCampaignRef: boolean;
  museumEnabled: boolean;
  isLegacy: boolean;
  visible: boolean;
};

export function isAdminImported(metadata: any): boolean {
  const m = metadata ?? {};
  return Boolean(
    m.pack_id || m.source || m.atlas_id || m.imported_at ||
    m.import_batch || m.provenance,
  );
}

export function isMuseumEnabled(metadata: any): boolean {
  const m = metadata ?? {};
  return m.museum_enabled === true || m?.museum?.museum_enabled === true;
}

export function classifyArtifact(
  metadata: any,
  hasCampaignRef: boolean,
): ArtifactClassification {
  const adminImported = isAdminImported(metadata);
  const museumEnabled = isMuseumEnabled(metadata);
  const visible = adminImported || hasCampaignRef || museumEnabled;
  return {
    adminImported,
    hasCampaignRef,
    museumEnabled,
    isLegacy: !visible,
    visible,
  };
}

// ── Campaign artifact references ───────────────────────────────
// Returns a Set of artifact slugs that are referenced from any
// admin_campaigns row (core_entities, supporting_entities, or
// chapter reward unlocks/artifacts). Read-only.
export async function fetchCampaignArtifactRefSet(): Promise<Set<string>> {
  const refs = new Set<string>();
  try {
    await ensureLocalSnapshotLoaded();
    const local = localPublishedCampaigns() as Array<{ data: any }>;
    if (local.length > 0) {
      for (const row of local) collectArtifactRefs(row?.data, refs);
      return refs;
    }
  } catch { /* fall through to live fallback */ }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return refs;
  const PAGE = 1000;
  let from = 0;
  // Loop pagination — campaigns are few but be safe.
  while (true) {
    const res: any = await supabase
      .from("campaigns_public" as any)
      .select("data")
      .range(from, from + PAGE - 1);
    const { data, error } = res;
    if (error || !data) break;
    for (const row of selectCampaignRows(data as Array<{ data: any }>)) {
      collectArtifactRefs(row?.data, refs);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return refs;
}

function addRef(slug: string | undefined | null, out: Set<string>) {
  if (!slug) return;
  out.add(String(slug).toLowerCase());
}

function scanRefList(list: any, out: Set<string>) {
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    const s = String(raw ?? "");
    const [type, ...rest] = s.split(":");
    if (type === "artifact") addRef(rest.join(":"), out);
  }
}

function collectArtifactRefs(d: any, out: Set<string>) {
  if (!d) return;
  const meta = d.metadata ?? {};
  scanRefList(meta.core_entities, out);
  scanRefList(meta.supporting_entities, out);
  const chapters = Array.isArray(d.chapters) ? d.chapters : [];
  for (const ch of chapters) {
    scanRefList(ch?.rewards?.unlocks, out);
    const artifacts = ch?.rewards?.artifacts;
    if (Array.isArray(artifacts)) {
      for (const a of artifacts) {
        const slug = typeof a === "string" ? a : a?.slug ?? a?.id;
        addRef(slug, out);
      }
    }
  }
}
