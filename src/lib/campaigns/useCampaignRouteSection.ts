// ============================================================
// Campaign route → ambience section key
// ------------------------------------------------------------
// Uses ONLY the campaign the URL points at, resolved through the
// explicit era → music table (`src/lib/audio/eraMusicMap.ts`).
// Never derived from divider position, feed order, or titles, so a
// campaign can never inherit a neighbouring era's music.
// ============================================================

import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { resolveAmbienceSection } from "@/lib/audio/campaignAmbienceResolver";
import type { CampaignSectionKey } from "@/lib/campaigns/sections";

/** `/campaigns/imported/<idOrSlug>/...` → `<idOrSlug>`, else null. */
export function campaignKeyFromPath(pathname: string): string | null {
  const m = /^\/campaigns\/imported\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function useCampaignRouteSection(): CampaignSectionKey | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routeKey = campaignKeyFromPath(pathname);

  const { data: feed } = useQuery({
    queryKey: ["campaign-feed", "sections"],
    queryFn: fetchPublishedFeed,
    staleTime: 5 * 60_000,
    enabled: Boolean(routeKey),
  });

  return useMemo(() => {
    if (!routeKey || !feed) return null;
    const match =
      feed.campaigns.find((c) => c.id === routeKey) ??
      feed.campaigns.find((c) => c.slug === routeKey) ??
      null;
    return resolveAmbienceSection(match as never);
  }, [routeKey, feed]);
}
