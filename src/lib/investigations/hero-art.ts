// ============================================================
// Investigation hero art — a painted plate for every case file
// ------------------------------------------------------------
// Investigations have no artwork column of their own, and painting
// 233 bespoke plates is not a shippable pipeline. Instead each case
// borrows a painting from the frozen, already-bundled Campaign Key Art
// library, chosen from the SAME world the investigation belongs to, so
// the plate is period-correct rather than decorative noise.
//
// Selection is a pure hash of the slug, so a case shows the same
// painting on every device, every load, forever — and the whole thing
// resolves from bundled local assets, no network.
// ============================================================

import { useEffect, useState } from "react";
import {
  OFFLINE_CAMPAIGN_ART_IDS,
  localCampaignArtPath,
} from "@/lib/campaign-art/offline-pack";

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick(pool: string[], key: string): string | null {
  if (pool.length === 0) return null;
  const sorted = pool.slice().sort();
  return sorted[hash(key) % sorted.length];
}

/**
 * Resolve the bundled hero plate for an investigation. Synchronous and
 * snapshot-free: pass the world's campaign ids when they are already
 * known, omit them to fall back to the full library.
 */
export function investigationHeroArtPath(
  slug: string | null | undefined,
  worldCampaignIds?: Iterable<string> | null,
): string | null {
  const key = String(slug ?? "").trim();
  if (!key) return null;

  const all = [...OFFLINE_CAMPAIGN_ART_IDS];
  const scoped = worldCampaignIds
    ? [...worldCampaignIds].filter((id) => OFFLINE_CAMPAIGN_ART_IDS.has(id))
    : [];

  const chosen = pick(scoped.length > 0 ? scoped : all, key);
  return localCampaignArtPath(chosen, "hero");
}

/**
 * Hook form — waits for the offline world index so the plate can be
 * scoped to the case's own era, then settles. Returns null until a
 * path is known so the hero renders its gradient-only state rather
 * than flashing an unrelated painting.
 */
export function useInvestigationHeroArt(slug: string | null | undefined): string | null {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const key = String(slug ?? "").trim();
    if (!key) { setPath(null); return; }

    (async () => {
      let scoped: Set<string> | null = null;
      try {
        const { ensureLocalSnapshotLoaded } = await import("@/lib/local-first-store");
        await ensureLocalSnapshotLoaded();
        const { getInvestigationWorldMap, getWorldCampaignIds } = await import(
          "@/lib/worlds-progress"
        );
        const world = getInvestigationWorldMap().get(key);
        if (world) scoped = getWorldCampaignIds(world);
      } catch { /* no snapshot — the full library still gives a stable plate */ }
      if (!alive) return;
      setPath(investigationHeroArtPath(key, scoped));
    })();

    return () => { alive = false; };
  }, [slug]);

  return path;
}
