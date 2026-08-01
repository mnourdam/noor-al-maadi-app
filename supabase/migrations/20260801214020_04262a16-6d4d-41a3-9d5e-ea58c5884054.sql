-- ============================================================
-- Story kind isolation: library stories vs campaign intros
-- ============================================================

CREATE OR REPLACE FUNCTION public.story_is_campaign_intro(
  p_story_id text,
  p_metadata jsonb,
  p_tags text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
       COALESCE(p_metadata->>'kind', '') = 'campaign_intro'
    OR 'campaign-intro' = ANY (COALESCE(p_tags, ARRAY[]::text[]))
    OR EXISTS (
         SELECT 1 FROM public.admin_campaigns c
          WHERE c.data->>'intro_story_id' = p_story_id
       );
$$;

GRANT EXECUTE ON FUNCTION public.story_is_campaign_intro(text, jsonb, text[]) TO anon, authenticated, service_role;

-- Which campaign does an intro story belong to?
CREATE OR REPLACE FUNCTION public.campaign_id_for_intro_story(p_story_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.id FROM public.admin_campaigns c WHERE c.data->>'intro_story_id' = p_story_id LIMIT 1),
    (SELECT s.metadata->>'campaign_id' FROM public.stories s WHERE s.id = p_story_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.campaign_id_for_intro_story(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Library feed (signed in): campaign intros are not library content
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_stories_v3(
  p_world_slug text DEFAULT NULL,
  p_collection_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT public.story_is_campaign_intro(s.id, s.metadata, s.tags)
       AND (p_world_slug IS NULL OR s.world_slug = p_world_slug)
       AND (p_collection_id IS NULL OR s.story_collection_id = p_collection_id)
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  enriched AS (
    SELECT
      b.row AS row,
      b.id AS id,
      b.display_order AS display_order,
      COALESCE(sc.n, 0) AS scene_count,
      public.evaluate_unlock_spec_v2(v_uid, b.unlock_spec) AS unlocked,
      public._story_prereqs_v2(v_uid, b.unlock_spec) AS prereqs,
      CASE
        WHEN v_uid IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.user_story_completions c
           WHERE c.user_id = v_uid AND c.story_id = b.id
        )
      END AS completed,
      CASE
        WHEN v_uid IS NULL THEN NULL
        ELSE (
          SELECT jsonb_build_object(
            'last_scene_index', p.last_scene_index,
            'max_scene_index_reached', p.max_scene_index_reached
          )
            FROM public.user_story_progress p
           WHERE p.user_id = v_uid AND p.story_id = b.id
        )
      END AS progress
    FROM base b
    LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e.row, e.unlocked, false, e.scene_count, e.prereqs, e.completed, e.progress
           ) AS row_json,
           e.display_order, e.id
      FROM enriched e
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_out
    FROM redacted
   WHERE row_json IS NOT NULL;

  RETURN v_out;
END;
$$;

-- ------------------------------------------------------------
-- Library feed (guest mirror)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_stories_guest_v3(
  p_world_slug text DEFAULT NULL,
  p_collection_id text DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN public.list_stories_v3(p_world_slug, p_collection_id);
  END IF;

  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT public.story_is_campaign_intro(s.id, s.metadata, s.tags)
       AND (p_world_slug    IS NULL OR s.world_slug = p_world_slug)
       AND (p_collection_id IS NULL OR s.story_collection_id = p_collection_id)
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  enriched AS (
    SELECT b.row AS row, b.id AS id, b.display_order AS display_order,
           COALESCE(sc.n, 0) AS scene_count,
           public.evaluate_unlock_spec_guest_v2(b.unlock_spec, p_evidence) AS unlocked,
           public._story_prereqs_v2(NULL, b.unlock_spec) AS prereqs
      FROM base b
      LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e.row, e.unlocked, false, e.scene_count, e.prereqs, false, NULL
           ) AS row_json,
           e.display_order, e.id
      FROM enriched e
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_out
    FROM redacted
   WHERE row_json IS NOT NULL;

  RETURN v_out;
END;
$$;

-- ------------------------------------------------------------
-- Library reader: campaign intros are never served as library stories
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_story_bundle_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_res jsonb;
  v_is_intro boolean;
BEGIN
  SELECT public.story_is_campaign_intro(s.id, s.metadata, s.tags)
    INTO v_is_intro
    FROM public.stories s
   WHERE s.id = p_story_id;

  IF COALESCE(v_is_intro, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'campaign_intro',
      'campaign_id', public.campaign_id_for_intro_story(p_story_id)
    );
  END IF;

  v_res := public._get_story_bundle_v2_core(p_story_id);
  RETURN v_res;
END;
$$;
