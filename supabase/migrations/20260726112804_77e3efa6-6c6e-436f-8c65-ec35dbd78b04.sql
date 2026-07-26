
-- Guest unlock evaluation: evidence-based, client-supplied, anon-only.
CREATE OR REPLACE FUNCTION public._ev_has(p_ev jsonb, p_key text, p_val text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_val IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(COALESCE(p_ev->p_key, '[]'::jsonb)) = 'array'
           THEN p_ev->p_key ELSE '[]'::jsonb END
    ) AS x(v)
    WHERE x.v = p_val
  );
$$;

CREATE OR REPLACE FUNCTION public._eval_unlock_node_guest_v2(p_node jsonb, p_depth integer, p_ev jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_child jsonb;
  v_min int;
  v_hit int;
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_depth > 6 THEN RETURN false; END IF;
  IF p_node IS NULL OR jsonb_typeof(p_node) <> 'object' THEN RETURN false; END IF;
  v_type := p_node->>'type';

  CASE v_type
    WHEN 'always' THEN RETURN true;
    WHEN 'all' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF NOT public._eval_unlock_node_guest_v2(v_child, p_depth + 1, p_ev) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'any' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF public._eval_unlock_node_guest_v2(v_child, p_depth + 1, p_ev) THEN RETURN true; END IF;
      END LOOP;
      RETURN false;
    WHEN 'not' THEN
      IF NOT (p_node ? 'child') THEN RETURN false; END IF;
      RETURN NOT public._eval_unlock_node_guest_v2(p_node->'child', p_depth + 1, p_ev);

    WHEN 'story_complete' THEN
      RETURN public._ev_has(p_ev, 'stories', p_node->>'story_id');
    WHEN 'campaign_complete' THEN
      RETURN public._ev_has(p_ev, 'campaigns', p_node->>'campaign_id');
    WHEN 'campaign_chapter_complete' THEN
      RETURN public._ev_has(p_ev, 'chapters',
        (p_node->>'campaign_id') || '::' || (p_node->>'chapter_id'));
    WHEN 'investigation_complete' THEN
      RETURN public._ev_has(p_ev, 'investigations', p_node->>'investigation_id');
    WHEN 'entity_discovered' THEN
      RETURN public._ev_has(p_ev, 'discovered', p_node->>'entity_id');
    WHEN 'entities_discovered' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO v_hit
        FROM jsonb_array_elements_text(COALESCE(p_node->'ids','[]'::jsonb)) AS x(id)
       WHERE public._ev_has(p_ev, 'discovered', x.id);
      RETURN v_hit >= v_min;
    WHEN 'artifact_owned' THEN
      RETURN public._ev_has(p_ev, 'artifacts', p_node->>'artifact_id')
          OR public._ev_has(p_ev, 'discovered', p_node->>'artifact_id');
    WHEN 'atlas_location_visited' THEN
      RETURN public._ev_has(p_ev, 'atlas', p_node->>'location_id')
          OR public._ev_has(p_ev, 'discovered', p_node->>'location_id');
    WHEN 'achievement_unlocked' THEN
      RETURN public._ev_has(p_ev, 'achievements', p_node->>'achievement_id');
    WHEN 'player_level' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      RETURN COALESCE((p_ev->>'level')::int, 0) >= v_min;
    WHEN 'date_window' THEN
      BEGIN
        v_start := CASE WHEN p_node ? 'start' THEN (p_node->>'start')::timestamptz ELSE NULL END;
        v_end   := CASE WHEN p_node ? 'end'   THEN (p_node->>'end')::timestamptz   ELSE NULL END;
      EXCEPTION WHEN others THEN RETURN false;
      END;
      IF v_start IS NULL AND v_end IS NULL THEN RETURN false; END IF;
      IF v_start IS NOT NULL AND v_now < v_start THEN RETURN false; END IF;
      IF v_end   IS NOT NULL AND v_now > v_end   THEN RETURN false; END IF;
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_unlock_spec_guest_v2(p_spec jsonb, p_ev jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_norm jsonb;
  v_check jsonb;
BEGIN
  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_check := public.validate_unlock_spec_v2(v_norm);
  IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
  RETURN public._eval_unlock_node_guest_v2(v_norm->'expr', 1, COALESCE(p_ev, '{}'::jsonb));
END;
$$;

-- Guest story list: same payload shape as list_stories_v3, but the
-- unlock decision comes from the device's own evidence.
CREATE OR REPLACE FUNCTION public.list_stories_guest_v3(
  p_world_slug text DEFAULT NULL,
  p_collection_id text DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  -- Signed-in callers always go through the server-authoritative path.
  IF auth.uid() IS NOT NULL THEN
    RETURN public.list_stories_v3(p_world_slug, p_collection_id);
  END IF;

  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
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

-- Guest story bundle: content delivery gated by device evidence.
CREATE OR REPLACE FUNCTION public.get_story_bundle_guest_v2(
  p_story_id text,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_story public.stories%ROWTYPE;
  v_unlocked boolean := false;
  v_lv text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN public.get_story_bundle_v2(p_story_id);
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND OR v_story.status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_unlocked := public.evaluate_unlock_spec_guest_v2(v_story.unlock_spec, p_evidence);

  IF v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'story', to_jsonb(v_story),
      'scenes', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
          FROM public.story_scenes sc
         WHERE sc.story_id = v_story.id
      ), '[]'::jsonb),
      'progress', NULL,
      'completed', false
    );
  END IF;

  v_lv := COALESCE(v_story.lock_visibility::text, 'visible');
  IF v_lv = 'hidden' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'story', jsonb_build_object(
        'id', v_story.id, 'slug', v_story.slug,
        'is_locked', true, 'lock_visibility', 'mystery', 'is_redacted', true
      )
    );
  ELSE
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'story', (to_jsonb(v_story) - 'unlock_spec' - 'previous_draft')
                || jsonb_build_object('is_locked', true, 'is_redacted', false),
      'prereqs', public._story_prereqs_v2(NULL, v_story.unlock_spec)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_stories_guest_v3(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_story_bundle_guest_v2(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_unlock_spec_guest_v2(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_stories_guest_v3(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_story_bundle_guest_v2(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_unlock_spec_guest_v2(jsonb, jsonb) TO anon, authenticated;
