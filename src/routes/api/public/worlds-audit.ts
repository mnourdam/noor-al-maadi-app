import { createFileRoute } from '@tanstack/react-router';
import { buildWorldIndex } from '@/lib/worlds-progress';
import { localPublishedCampaigns, localInvestigations } from '@/lib/local-first-store';

export const Route = createFileRoute('/api/public/worlds-audit')({
  server: {
    handlers: {
      GET: async () => {
        const index = buildWorldIndex();
        const results = [];
        
        const allCampaigns = localPublishedCampaigns();
        const allInvestigations = localInvestigations();

        for (const [slug, world] of index.entries()) {
          results.push({
            world: slug,
            campaignCount: world.campaignIds.length,
            investigationCount: world.investigationSlugs.length
          });
        }

        return new Response(JSON.stringify({
          worlds: results,
          totalPublishedCampaigns: allCampaigns.length,
          totalInvestigations: allInvestigations.length
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
});
