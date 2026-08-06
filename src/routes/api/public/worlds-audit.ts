import { createFileRoute } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/api/public/worlds-audit')({
  server: {
    handlers: {
      GET: async () => {
        // 1. Fetch campaigns
        const { data: camps } = await supabase
          .from("campaigns_public" as any)
          .select("id, slug, data");
        
        // 2. Fetch investigations
        const { data: invs } = await supabase
          .from("investigations_public" as any)
          .select("id, slug, world_slug, related_entities");

        return new Response(JSON.stringify({
          campaigns: (camps || []).map(c => ({
            id: c.id,
            slug: c.slug,
            worldSlug: c.data?.worldSlug,
            hasData: !!c.data
          })),
          investigations: (invs || []).map(i => ({
            id: i.id,
            slug: i.slug,
            world_slug: (i as any).world_slug,
            related_count: Array.isArray(i.related_entities) ? i.related_entities.length : 0
          }))
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
});
