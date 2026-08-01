CREATE OR REPLACE FUNCTION public.campaign_intros_sync_v1(
  p_since timestamptz DEFAULT NULL,
  p_story_ids text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_links       jsonb;
  v_catalog     jsonb;
  v_stories     jsonb;
  v_scenes      jsonb;
  v_media       jsonb;
  v_wanted      text[];
BEGIN
  -- Campaign -> intro story link, published campaigns only.
  WITH links AS (
    SELECT c.id AS campaign_id,
           c.slug,
           NULLIF(TRIM(c.data->>'intro_story_id'), '') AS story_id,
           GREATEST(1, COALESCE((c.data->>'intro_version')::int, 1)) AS intro_version,
           c.updated_at
      FROM public.campaigns_public c
     WHERE c.status = 'published'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'campaign_id', l.campaign_id,
           'slug', l.slug,
           'story_id', l.story_id,
           'intro_version', l.intro_version,
           'updated_at', l.updated_at
         ) ORDER BY l.campaign_id), '[]'::jsonb)
    INTO v_links
    FROM links l
   WHERE l.story_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.stories s
        WHERE s.id = l.story_id AND s.status = 'published'
     );

  -- Catalogue of every valid, published intro story (small: id + version).
  WITH intro_ids AS (
    SELECT DISTINCT NULLIF(TRIM(c.data->>'intro_story_id'), '') AS story_id
      FROM public.campaigns_public c
     WHERE c.status = 'published'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'story_id', s.id,
           'content_version', COALESCE(s.content_version, 1),
           'updated_at', s.updated_at
         ) ORDER BY s.id), '[]'::jsonb)
    INTO v_catalog
    FROM public.stories s
    JOIN intro_ids i ON i.story_id = s.id
   WHERE s.status = 'published';

  -- Which bundles to ship on this call.
  WITH intro_ids AS (
    SELECT DISTINCT NULLIF(TRIM(c.data->>'intro_story_id'), '') AS story_id
      FROM public.campaigns_public c
     WHERE c.status = 'published'
  )
  SELECT COALESCE(array_agg(s.id), ARRAY[]::text[])
    INTO v_wanted
    FROM public.stories s
    JOIN intro_ids i ON i.story_id = s.id
   WHERE s.status = 'published'
     AND (
       (p_story_ids IS NOT NULL AND s.id = ANY(p_story_ids))
       OR (p_since IS NULL)
       OR (s.updated_at > p_since)
     );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'slug', s.slug,
           'title_ar', s.title_ar, 'title_en', s.title_en,
           'summary_ar', s.summary_ar, 'summary_en', s.summary_en,
           'world_slug', s.world_slug, 'era', s.era,
           'status', 'published',
           'content_version', COALESCE(s.content_version, 1),
           'updated_at', s.updated_at,
           'cover_media_id', s.cover_media_id,
           'metadata', COALESCE(s.metadata, '{}'::jsonb),
           'tags', COALESCE(to_jsonb(s.tags), '[]'::jsonb),
           'category', s.category, 'rarity', s.rarity,
           'length_class', s.length_class,
           'historical_confidence', s.historical_confidence,
           'xp_reward', s.xp_reward, 'dinar_reward', s.dinar_reward
         ) ORDER BY s.id), '[]'::jsonb)
    INTO v_stories
    FROM public.stories s
   WHERE s.id = ANY(v_wanted);

  SELECT COALESCE(jsonb_agg(to_jsonb(sc) ORDER BY sc.story_id, sc.scene_index), '[]'::jsonb)
    INTO v_scenes
    FROM public.story_scenes sc
   WHERE sc.story_id = ANY(v_wanted);

  SELECT COALESCE(jsonb_agg((to_jsonb(m) - 'verified_by') ORDER BY m.id), '[]'::jsonb)
    INTO v_media
    FROM public.story_media m
   WHERE m.story_id = ANY(v_wanted)
     AND m.verified = true;

  RETURN jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'since', p_since,
    'links', v_links,
    'catalog', v_catalog,
    'stories', v_stories,
    'story_scenes', v_scenes,
    'story_media', v_media
  );
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_intros_sync_v1(timestamptz, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_intros_sync_v1(timestamptz, text[]) TO anon, authenticated, service_role;