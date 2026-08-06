import { createFileRoute } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/api/public/worlds-audit')({
  server: {
    handlers: {
      GET: async () => {
        // 1. Fetch campaigns using any to avoid type errors with dynamic views
        const { data: camps } = await (supabase
          .from("campaigns_public" as any)
          .select("id, slug, data") as any);
        
        // 2. Fetch investigations
        const { data: invs } = await (supabase
          .from("investigations_public" as any)
          .select("id, slug, world_slug, related_entities") as any);

        const campaigns = (camps || []).map((c: any) => ({
          id: c.id,
          slug: c.slug,
          worldSlug: c.data?.worldSlug,
          hasData: !!c.data
        }));

        const investigations = (invs || []).map((i: any) => ({
          id: i.id,
          slug: i.slug,
          world_slug: i.world_slug,
          related_count: Array.isArray(i.related_entities) ? i.related_entities.length : 0
        }));

        return new Response(JSON.stringify({
          campaigns,
          investigations
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
});
