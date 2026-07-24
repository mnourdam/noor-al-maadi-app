-- =====================================================================
-- M7A — Server-authoritative offline Story snapshot manifest
-- Additive: no schema, table, or policy changes; existing anon table
-- SELECT policies remain intact for installed-APK compatibility.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.stories_snapshot_manifest_v2(
  p_include_on_demand boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stories       jsonb;
  v_scenes        jsonb;
  v_media         jsonb;
  v_collections   jsonb;
  v_accessible    uuid[];  -- (unused placeholder for clarity)
BEGIN
  -- ----------------------------------------------------------------
  -- Story rows: redacted per anon visibility. Locked+hidden omitted.
  -- Snapshot is public/shared, so we evaluate as anon (uid=NULL).
  -- ----------------------------------------------------------------
  WITH base AS (
    SELECT s.*,
           public.evaluate_unlock_spec_v2(NULL, s.unlock_spec) AS anon_unlocked,
           COALESCE(sc.n, 0) AS scene_count
      FROM public.stories s
      LEFT JOIN (
        SELECT story_id, count(*)::int AS n
          FROM public.story_scenes GROUP BY story_id
      ) sc ON sc.story_id = s.id
     WHERE s.status = 'published'
       AND (p_include_on_demand OR s.snapshot_tier <> 'on_demand')
  ),
  redacted AS (
    SELECT
      b.id, b.snapshot_tier, b.display_order, b.anon_unlocked,
      COALESCE(b.lock_visibility::text, 'visible') AS lock_visibility,
      CASE
        WHEN b.anon_unlocked THEN jsonb_build_object(
          -- Full published row shape (mirrors _story_redact_summary_v2 full path).
          'id', b.id, 'slug', b.slug,
          'title_ar', b.title_ar, 'title_en', b.title_en,
          'summary_ar', b.summary_ar, 'summary_en', b.summary_en,
          'world_slug', b.world_slug, 'era', b.era,
          'display_order', b.display_order,
          'status', 'published',
          'content_version', b.content_version,
          'unlock_spec', b.unlock_spec,
          'cover_media_id', b.cover_media_id,
          'xp_reward', b.xp_reward, 'dinar_reward', b.dinar_reward,
          'metadata', COALESCE(b.metadata, '{}'::jsonb),
          'published_at', b.published_at,
          'category', b.category, 'rarity', b.rarity,
          'length_class', b.length_class,
          'historical_confidence', b.historical_confidence,
          'lock_visibility', COALESCE(b.lock_visibility::text, 'visible'),
          'snapshot_tier', b.snapshot_tier,
          'tags', COALESCE(to_jsonb(b.tags), '[]'::jsonb),
          'story_collection_id', b.story_collection_id,
          'collection_order', b.collection_order,
          'scene_count', b.scene_count,
          'is_locked', false, 'is_redacted', false
        )
        WHEN COALESCE(b.lock_visibility::text, 'visible') = 'hidden' THEN NULL
        WHEN COALESCE(b.lock_visibility::text, 'visible') = 'mystery' THEN jsonb_build_object(
          'id', b.id, 'slug', b.slug,
          'status', 'published',
          'is_locked', true, 'is_redacted', true,
          'lock_visibility', 'mystery',
          'snapshot_tier', b.snapshot_tier
        )
        ELSE jsonb_build_object(
          -- Locked 'visible': permitted metadata + prereqs; no unlock_spec, no scenes/media.
          'id', b.id, 'slug', b.slug,
          'title_ar', b.title_ar, 'title_en', b.title_en,
          'summary_ar', b.summary_ar, 'summary_en', b.summary_en,
          'world_slug', b.world_slug, 'era', b.era,
          'display_order', b.display_order,
          'status', 'published',
          'content_version', b.content_version,
          'cover_media_id', b.cover_media_id,
          'xp_reward', b.xp_reward, 'dinar_reward', b.dinar_reward,
          'published_at', b.published_at,
          'category', b.category, 'rarity', b.rarity,
          'length_class', b.length_class,
          'historical_confidence', b.historical_confidence,
          'lock_visibility', 'visible',
          'snapshot_tier', b.snapshot_tier,
          'tags', COALESCE(to_jsonb(b.tags), '[]'::jsonb),
          'story_collection_id', b.story_collection_id,
          'collection_order', b.collection_order,
          'scene_count', b.scene_count,
          'is_locked', true, 'is_redacted', false
        )
      END AS row_json
    FROM base b
  ),
  accessible AS (
    SELECT id FROM redacted WHERE anon_unlocked
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_stories
    FROM redacted
   WHERE row_json IS NOT NULL;

  -- Scenes only for anon-accessible stories.
  SELECT COALESCE(jsonb_agg(to_jsonb(sc) ORDER BY sc.story_id, sc.scene_index), '[]'::jsonb)
    INTO v_scenes
    FROM public.story_scenes sc
   WHERE sc.story_id IN (
     SELECT b.id FROM public.stories b
      WHERE b.status = 'published'
        AND (p_include_on_demand OR b.snapshot_tier <> 'on_demand')
        AND public.evaluate_unlock_spec_v2(NULL, b.unlock_spec)
   );

  -- Verified media for anon-accessible stories only. Strips auditing fields.
  SELECT COALESCE(jsonb_agg(
           to_jsonb(m) - 'verified_by' ORDER BY m.id
         ), '[]'::jsonb)
    INTO v_media
    FROM public.story_media m
   WHERE m.verified = true
     AND (
       m.story_id IN (
         SELECT b.id FROM public.stories b
          WHERE b.status = 'published'
            AND (p_include_on_demand OR b.snapshot_tier <> 'on_demand')
            AND public.evaluate_unlock_spec_v2(NULL, b.unlock_spec)
       )
     );

  -- Collections (public read).
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.display_order, c.id), '[]'::jsonb)
    INTO v_collections
    FROM public.story_collections c;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'include_on_demand', p_include_on_demand,
    'stories', v_stories,
    'story_scenes', v_scenes,
    'story_media', v_media,
    'story_collections', v_collections
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stories_snapshot_manifest_v2(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stories_snapshot_manifest_v2(boolean) TO anon, authenticated;
