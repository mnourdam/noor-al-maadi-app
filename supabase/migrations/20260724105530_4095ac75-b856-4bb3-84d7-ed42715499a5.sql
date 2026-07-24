
CREATE OR REPLACE FUNCTION public.list_stories_v3(
  p_world_slug   text DEFAULT NULL,
  p_collection_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_editor boolean := false;
  v_out jsonb;
BEGIN
  IF v_uid IS NOT NULL THEN
    BEGIN v_is_editor := public.is_content_editor();
    EXCEPTION WHEN others THEN v_is_editor := public.has_role(v_uid, 'admin');
    END;
  END IF;

  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE (v_is_editor OR s.status = 'published')
       AND (p_world_slug   IS NULL OR s.world_slug = p_world_slug)
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
      b.row AS row, b.id AS id, b.display_order AS display_order,
      COALESCE(sc.n, 0) AS scene_count,
      CASE
        WHEN v_uid IS NULL THEN
          ((b.unlock_spec->>'type') IS NULL OR (b.unlock_spec->>'type') = 'always'
           OR public.evaluate_unlock_spec_v2(NULL, b.unlock_spec))
        ELSE public.evaluate_unlock_spec_v2(v_uid, b.unlock_spec)
      END AS unlocked,
      public._story_prereqs_v2(v_uid, b.unlock_spec) AS prereqs,
      CASE
        WHEN v_uid IS NULL THEN false
        ELSE EXISTS (SELECT 1 FROM public.user_story_completions c
                      WHERE c.user_id = v_uid AND c.story_id = b.id)
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
             e.row, e.unlocked, v_is_editor,
             e.scene_count, e.prereqs, e.completed, e.progress
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
