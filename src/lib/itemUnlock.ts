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
import {
  getUnlockedRegistryIds,
  getUnlockSourcesMap,
} from "@/lib/importedUnlocks";
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

  const registryUnlocks = useMemo(() => new Set(getUnlockedRegistryIds()), [tick]);
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
    const aliases: string[] = Array.isArray(metadata?.aliases) ? metadata.aliases : [];

    let unlocked = false;
    let sourceCampaignId: string | undefined;

    // 1. Supabase user_collection (typed) — preferred.
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

    // 2. Imported registry unlocks (raw "type:slug").
    if (!unlocked) {
      const candidates: string[] = [];
      if (type) candidates.push(`${type}:${slug}`);
      if (type && legacyId) candidates.push(`${type}:${legacyId}`);
      for (const a of aliases) candidates.push(a);
      for (const c of candidates) {
        if (registryUnlocks.has(c)) {
          unlocked = true;
          sourceCampaignId = registrySources.get(c);
          break;
        }
      }
      // Type-unknown: any registry id whose slug-part === slug.
      if (!unlocked && !type) {
        for (const raw of registryUnlocks) {
          const parts = raw.split(":");
          const s = parts.length > 1 ? parts.slice(1).join(":") : parts[0];
          if (s === slug) {
            unlocked = true;
            sourceCampaignId = registrySources.get(raw);
            break;
          }
        }
      }
    }

    // 3. Legacy profile arrays.
    if (!unlocked) {
      if ((type === "figure" || !type) &&
          (profile.charactersUnlocked.includes(slug) || (legacyId && profile.charactersUnlocked.includes(legacyId)))) {
        unlocked = true;
      } else if ((type === "artifact" || !type) &&
          (profile.artifactsFound.includes(slug) || (legacyId && profile.artifactsFound.includes(legacyId)))) {
        unlocked = true;
      }
    }

    const sourceCampaignTitle = sourceCampaignId ? campaignTitles.get(sourceCampaignId) : undefined;
    return {
      loading,
      unlocked,
      unlockHint: unlocked ? "" : hintForCampaign(sourceCampaignTitle),
      sourceCampaignTitle,
    };
  }, [supaUnlocks, registryUnlocks, registrySources, campaignTitles, profile, slug, type, metadata]);
}

/** Pure helper for non-React code paths (e.g. building a reveal payload). */
export function buildUnlockHint(sourceCampaignTitle?: string): string {
  return hintForCampaign(sourceCampaignTitle);
}
