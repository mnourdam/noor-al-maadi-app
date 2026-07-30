// ============================================================
// Campaign route → authored section key (ambience only)
// ------------------------------------------------------------
// Resolves the section for whichever campaign the current URL is
// inside, using ONLY authored values:
//   1. the campaign's own `section_key`
//   2. the `sectionKey` of the divider that opens its section
//   3. null → default campaign ambience
// Never inferred from era / worldSlug / tags / titles.
// ============================================================

import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { sectionKeysFromFeed } from "@/lib/campaignDividers";
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
    const byId = sectionKeysFromFeed(feed.items);
    if (byId.has(routeKey)) return byId.get(routeKey) ?? null;
    // The URL may carry a slug instead of the row id.
    const match = feed.campaigns.find((c) => c.slug === routeKey);
    return match ? (byId.get(match.id) ?? null) : null;
  }, [routeKey, feed]);
}
