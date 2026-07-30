import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CampaignAudioScope } from "@/components/campaigns/CampaignAudioScope";

/**
 * Campaign context layout. Owns the section-ambience scope for every
 * campaign screen (list, campaign page, intro overlay, chapters), so audio
 * never restarts while navigating inside the context.
 *
 * Stage 1 mounts the scope with `null` (default campaign ambience = current
 * behaviour). Stage 2 feeds it the resolved `section_key`.
 */
export const Route = createFileRoute("/campaigns")({
  component: () => (
    <CampaignAudioScope sectionKey={null}>
      <Outlet />
    </CampaignAudioScope>
  ),
});
