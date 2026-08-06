-- 1) Table column
ALTER TABLE public.investigations ADD COLUMN IF NOT EXISTS world_slug text;

-- 2) Column grants for players
GRANT SELECT (world_slug) ON public.investigations TO anon, authenticated;

-- 3) Public view update
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
