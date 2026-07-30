import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CampaignAudioScope } from "@/components/campaigns/CampaignAudioScope";
import { useCampaignRouteSection } from "@/lib/campaigns/useCampaignRouteSection";

/**
 * Campaign context layout. Owns the section-ambience scope for every
 * campaign screen (list, campaign page, intro overlay, chapters), so audio
 * never restarts while navigating inside the context.
 *
 * The section key comes exclusively from authored values — the campaign's
 * own `section_key`, else the key on the divider that opens its section.
 * Nothing is ever inferred from era / worldSlug / tags / titles.
 */
function CampaignsLayout() {
  const sectionKey = useCampaignRouteSection();
  return (
    <CampaignAudioScope sectionKey={sectionKey}>
      <Outlet />
    </CampaignAudioScope>
  );
}

export const Route = createFileRoute("/campaigns")({
  component: CampaignsLayout,
});
