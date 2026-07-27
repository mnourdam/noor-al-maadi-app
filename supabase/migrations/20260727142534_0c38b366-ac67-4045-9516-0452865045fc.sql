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
  -- Player/public feed is publication-gated at the source.
  -- Draft/archived stories are never returned here, even for admin/editor users.
  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
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
          SELECT 1
            FROM public.user_story_completions c
           WHERE c.user_id = v_uid
             AND c.story_id = b.id
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
           WHERE p.user_id = v_uid
             AND p.story_id = b.id
        )
      END AS progress
    FROM base b
    LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e.row,
             e.unlocked,
             false,
             e.scene_count,
             e.prereqs,
             e.completed,
             e.progress
           ) AS row_json,
           e.display_order,
           e.id
      FROM enriched e
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_out
    FROM redacted
   WHERE row_json IS NOT NULL;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_stories_v2(p_world_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.list_stories_v3(p_world_slug, NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_story_bundle_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_unlocked boolean := false;
  v_lv text;
  v_prereqs jsonb;
BEGIN
  -- Player/public bundle is publication-gated at the source.
  -- Draft/archived stories are indistinguishable from missing stories here.
  SELECT *
    INTO v_story
    FROM public.stories
   WHERE id = p_story_id
     AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);

  IF v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'story', to_jsonb(v_story),
      'scenes', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
          FROM public.story_scenes sc
         WHERE sc.story_id = v_story.id
      ), '[]'::jsonb),
      'progress', (
        SELECT to_jsonb(p)
          FROM public.user_story_progress p
         WHERE p.user_id = v_uid
           AND p.story_id = v_story.id
      ),
      'completed', (v_uid IS NOT NULL) AND EXISTS (
        SELECT 1
          FROM public.user_story_completions c
         WHERE c.user_id = v_uid
           AND c.story_id = v_story.id
      )
    );
  END IF;

  v_lv := COALESCE(v_story.lock_visibility::text, 'visible');
  IF v_lv = 'hidden' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', jsonb_build_object(
        'id', v_story.id,
        'slug', v_story.slug,
        'is_locked', true,
        'lock_visibility', 'mystery',
        'is_redacted', true
      )
    );
  ELSE
    v_prereqs := public._story_prereqs_v2(v_uid, v_story.unlock_spec);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', (to_jsonb(v_story) - 'unlock_spec' - 'previous_draft')
                || jsonb_build_object('is_locked', true, 'is_redacted', false),
      'prereqs', v_prereqs
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_story_access(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_unlocked boolean := false;
BEGIN
  -- Legacy player/public access path: same publication gate as get_story_bundle_v2.
  SELECT *
    INTO v_story
    FROM public.stories
   WHERE id = p_story_id
     AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid IS NULL THEN
    v_unlocked := public.evaluate_unlock_spec_v2(NULL, v_story.unlock_spec);
  ELSE
    v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);
  END IF;

  IF NOT v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', to_jsonb(v_story) - 'unlock_spec' - 'previous_draft'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'story', to_jsonb(v_story),
    'scenes', COALESCE((
      SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
        FROM public.story_scenes sc
       WHERE sc.story_id = v_story.id
    ), '[]'::jsonb),
    'progress', (
      SELECT to_jsonb(p)
        FROM public.user_story_progress p
       WHERE p.user_id = v_uid
         AND p.story_id = v_story.id
    ),
    'completed', EXISTS (
      SELECT 1
        FROM public.user_story_completions c
       WHERE c.user_id = v_uid
         AND c.story_id = v_story.id
    )
  );
END;
$$;