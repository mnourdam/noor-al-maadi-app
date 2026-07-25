
-- Expose Key Art paths through the public campaigns view so player surfaces
-- can resolve campaign artwork through the single resolver.
DROP VIEW IF EXISTS public.campaigns_public;
CREATE VIEW public.campaigns_public AS
SELECT
  id,
  slug,
  title,
  status,
  data,
  content_version,
  published_at,
  created_at,
  updated_at,
  key_art_path,
  key_art_square_path,
  key_art_credit
FROM public.admin_campaigns
WHERE status = 'published';

COMMENT ON VIEW public.campaigns_public IS
  'Public/player-safe projection of admin_campaigns. Excludes draft_data, updated_by, last_editor_email, has_unpublished_changes, key_art_source. Only status=published rows. Owner-runs so anon/authenticated do not need SELECT on the base table.';

REVOKE ALL ON public.campaigns_public FROM PUBLIC;
GRANT SELECT ON public.campaigns_public TO anon;
GRANT SELECT ON public.campaigns_public TO authenticated;
GRANT ALL ON public.campaigns_public TO service_role;

-- Pilot: attach the frozen Golden Template v1 to the Iqra campaign.
UPDATE public.admin_campaigns
   SET key_art_path   = 'prophetic-mission/golden-template-v1.jpg',
       key_art_credit = COALESCE(key_art_credit, 'Irth Campaign Key Art — Golden Template v1'),
       key_art_source = COALESCE(key_art_source, 'irth-internal:golden-template-v1'),
       content_version = COALESCE(content_version, 0) + 1
 WHERE id = 'prophetic-mission';
