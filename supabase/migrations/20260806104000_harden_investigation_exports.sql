-- 1. Ensure world_slug is accessible to RPCs and View
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;
GRANT SELECT ON public.investigations TO anon;

-- 2. Force view refresh
DROP VIEW IF EXISTS public.investigations_public;
CREATE OR REPLACE VIEW public.investigations_public AS
 SELECT id, slug, title, subtitle, description, difficulty, reward, steps, related_entities, enabled, content_version, published_at, created_at, updated_at, world_slug
   FROM investigations;
GRANT SELECT ON public.investigations_public TO authenticated, anon;

-- 3. Verify birth-of-a-new-state state
-- (This doesn't change anything but lets us confirm the migration ran)
UPDATE investigations SET world_slug = 'umayyad' WHERE slug = 'birth-of-a-new-state' AND world_slug IS NULL;
