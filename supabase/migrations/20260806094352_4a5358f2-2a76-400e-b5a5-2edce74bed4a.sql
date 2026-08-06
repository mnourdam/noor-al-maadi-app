-- Add world_slug to investigations
ALTER TABLE public.investigations ADD COLUMN IF NOT EXISTS world_slug text;

-- Grant column read to players
GRANT SELECT (world_slug) ON public.investigations TO anon, authenticated;

-- Update public view
CREATE OR REPLACE VIEW public.investigations_public
WITH (security_invoker = true) AS
  SELECT
    id, slug, title, subtitle, description, difficulty,
    reward, steps, related_entities, enabled,
    content_version, published_at, created_at, updated_at,
    world_slug
    FROM public.investigations
   WHERE enabled = true;

GRANT SELECT ON public.investigations_public TO anon, authenticated;
