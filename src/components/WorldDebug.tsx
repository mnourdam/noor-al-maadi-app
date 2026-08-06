import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublishedFeed } from "@/lib/supabaseCampaigns";
import { useWorldMembership } from "@/lib/worlds-progress";

export function WorldDebug({ worldSlug }: { worldSlug: string }) {
  const { data: feedData } = useQuery({
    queryKey: ["campaigns", "feed"],
    queryFn: fetchPublishedFeed,
  });

  const { campaignIds, ready: membershipReady } = useWorldMembership(worldSlug);

  useEffect(() => {
    if (!feedData || !membershipReady) return;

    console.log(`[WorldDebug] --- Diagnostics for World: ${worldSlug} ---`);
    console.log(`[WorldDebug] Feed Data:`, {
      totalCampaigns: feedData.campaigns.length,
      sectionsCount: feedData.sections.length
    });

    // 1. Audit Feed Campaigns
    const feedCampaigns = feedData.campaigns.map(c => ({
      id: c.id,
      slug: c.slug,
      world_slug: (c as any).worldSlug || (c as any).world_slug || "NONE",
      era: c.era,
      group_key: (c as any).group_key || "NONE",
      chronological_order: (c as any).chronological_order
    }));

    // Find campaigns that appear in sections under "prophetic" dividers
    const campaignsBySection: Record<string, string[]> = {};
    feedData.sections.forEach(s => {
      const dividerTitle = s.divider?.title || "Uncategorized";
      const dividerEra = s.divider?.era || "NONE";
      const dividerRawKey = (s.divider as any)?.rawSectionKey || "NONE";
      const key = `${dividerTitle} (Era: ${dividerEra}, Raw: ${dividerRawKey})`;
      campaignsBySection[key] = s.campaigns.map(c => c.slug);
    });
    console.log(`[WorldDebug] Campaigns by Section:`, campaignsBySection);

    const propheticInFeed = feedCampaigns.filter(c => 
      c.world_slug === "prophetic" || 
      c.era === "prophetic" || 
      c.group_key === "prophetic"
    );

    console.log(`[WorldDebug] Campaigns in Feed that MIGHT be prophetic:`, propheticInFeed);

    // 2. Audit World Membership Index
    console.log(`[WorldDebug] Membership ready: ${membershipReady}`);
    console.log(`[WorldDebug] Campaign IDs in Membership for ${worldSlug}:`, Array.from(campaignIds));

    // 3. Match comparison
    const matched = feedData.campaigns.filter(c => campaignIds.has(c.id));
    console.log(`[WorldDebug] Campaigns matched by world membership in ${worldSlug}:`, matched.map(c => c.slug));

    console.log(`[WorldDebug] --- End Diagnostics ---`);
  }, [feedData, membershipReady, worldSlug, campaignIds]);

  return null;
}
