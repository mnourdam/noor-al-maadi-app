// ============================================================
// Item unlock state (museum/encyclopedia gating)
// ------------------------------------------------------------
// Single source-of-truth for "is this collectible unlocked for
// the current player?" Used by:
//   - /collection (museum cards & reveal dialog)
//   - /encyclopedia/entity/$id  (direct URL gating)
//
// Does NOT introduce a new unlock store. It joins the three
// existing sources already used elsewhere:
//   1. Supabase user_collection rows
//   2. Imported-campaign registry unlocks (localStorage)
//   3. Legacy profile arrays (characters/artifacts)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/profile";
import { getUnlockSourcesMap } from "@/lib/importedUnlocks";

import { listCampaigns } from "@/lib/campaignStorage";

export interface UnlockState {
  loading: boolean;
  unlocked: boolean;
  /** Short Arabic hint shown on locked items. Always defined. */
  unlockHint: string;
  /** Campaign title that unlocked it, when known. */
  sourceCampaignTitle?: string;
}

const KNOWN_TITLES: Record<string, string> = {
  "prophetic-mission": "البعثة النبوية",
};

function hintForCampaign(title: string | undefined): string {
  if (title) return `ينفتح عند إكمال: ${title}`;
  return "تابع رحلتك في الحملات لاكتشاف هذا المقتنى.";
}

/**
 * Hook: resolve unlock state for a collectible by (type?, slug, metadata?).
 * - `type` may be null when only the slug is known (direct URL access).
 * - `metadata` may carry legacy_id / aliases used by the museum.
 */
export function useEntityUnlockState(
  slug: string,
  type?: string | null,
  metadata?: any,
): UnlockState {
  const { profile } = useProfile();
  const [tick, setTick] = useState(0);
  const [supaUnlocks, setSupaUnlocks] = useState<{
    byType: Map<string, Set<string>>;
    allSlugs: Set<string>;
    campaignFor: Map<string, string>; // key `${type}:${slug}` -> source campaign id
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) {
          if (!cancelled) setSupaUnlocks({ byType: new Map(), allSlugs: new Set(), campaignFor: new Map() });
          return;
        }
        const { data, error } = await supabase
          .from("user_collection")
          .select("item_id,item_type,source_campaign_id")
          .eq("user_id", uid);
        if (cancelled) return;
        if (error || !data) {
          setSupaUnlocks({ byType: new Map(), allSlugs: new Set(), campaignFor: new Map() });
          return;
        }
        const byType = new Map<string, Set<string>>();
        const allSlugs = new Set<string>();
        const campaignFor = new Map<string, string>();
        for (const r of data as any[]) {
          const t = String(r.item_type);
          const s = String(r.item_id);
          const set = byType.get(t) ?? new Set<string>();
          set.add(s);
          byType.set(t, set);
          allSlugs.add(s);
          if (r.source_campaign_id) campaignFor.set(`${t}:${s}`, String(r.source_campaign_id));
        }
        setSupaUnlocks({ byType, allSlugs, campaignFor });
      } catch {
        if (!cancelled) setSupaUnlocks({ byType: new Map(), allSlugs: new Set(), campaignFor: new Map() });
      }
    })();
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("focus", bump);
    return () => { cancelled = true; window.removeEventListener("focus", bump); };
  }, [tick, slug, type]);

  // (registry localStorage unlocks are no longer an unlock authority)
  const registrySources = useMemo(() => getUnlockSourcesMap(), [tick]);
  const campaignTitles = useMemo(() => {
    const m = new Map<string, string>(Object.entries(KNOWN_TITLES));
    for (const c of listCampaigns()) m.set(c.id, c.title);
    return m;
  }, [tick]);

  return useMemo<UnlockState>(() => {
    const loading = supaUnlocks == null;
    const legacyId: string | undefined =
      typeof metadata?.legacy_id === "string" ? metadata.legacy_id : undefined;

    let unlocked = false;
    let sourceCampaignId: string | undefined;

    // Supabase user_collection is the ONLY authority for `unlocked`.
    // Registry/localStorage and legacy profile arrays are intentionally
    // NOT consulted here — they would let unconfirmed/demo entries
    // (e.g. Salah al-Din, Umar) reveal full encyclopedia content.
    // The registry → Supabase migration (registryUnlockMigration.ts)
    // promotes real local unlocks into Supabase on boot / SIGNED_IN /
    // online; until that completes the item stays in locked preview.
    if (supaUnlocks) {
      if (type && supaUnlocks.byType.get(type)?.has(slug)) {
        unlocked = true;
        sourceCampaignId = supaUnlocks.campaignFor.get(`${type}:${slug}`);
      } else if (type && legacyId && supaUnlocks.byType.get(type)?.has(legacyId)) {
        unlocked = true;
        sourceCampaignId = supaUnlocks.campaignFor.get(`${type}:${legacyId}`);
      } else if (!type && supaUnlocks.allSlugs.has(slug)) {
        // Direct URL access: type unknown. Slug match across any type counts.
        unlocked = true;
      }
    }

    // Resolve hint campaign title from registry sources map when Supabase
    // didn't carry it (purely cosmetic; never affects `unlocked`).
    if (!unlocked && !sourceCampaignId) {
      const candidates: string[] = [];
      if (type) candidates.push(`${type}:${slug}`);
      if (type && legacyId) candidates.push(`${type}:${legacyId}`);
      for (const c of candidates) {
        const src = registrySources.get(c);
        if (src) { sourceCampaignId = src; break; }
      }
    }

    const sourceCampaignTitle = sourceCampaignId ? campaignTitles.get(sourceCampaignId) : undefined;
    return {
      loading,
      unlocked,
      unlockHint: unlocked ? "" : hintForCampaign(sourceCampaignTitle),
      sourceCampaignTitle,
    };
  }, [supaUnlocks, registrySources, campaignTitles, profile, slug, type, metadata]);
}


/** Pure helper for non-React code paths (e.g. building a reveal payload). */
export function buildUnlockHint(sourceCampaignTitle?: string): string {
  return hintForCampaign(sourceCampaignTitle);
}
