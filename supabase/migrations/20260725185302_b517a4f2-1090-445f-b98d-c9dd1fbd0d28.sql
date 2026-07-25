CREATE OR REPLACE FUNCTION public._eval_unlock_node_v2(p_user_id uuid, p_node jsonb, p_depth integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_child jsonb;
  v_ids jsonb;
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
    WHEN 'always' THEN
      RETURN true;
    WHEN 'all' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF NOT public._eval_unlock_node_v2(p_user_id, v_child, p_depth + 1) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'any' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF public._eval_unlock_node_v2(p_user_id, v_child, p_depth + 1) THEN RETURN true; END IF;
      END LOOP;
      RETURN false;
    WHEN 'not' THEN
      IF NOT (p_node ? 'child') THEN RETURN false; END IF;
      RETURN NOT public._eval_unlock_node_v2(p_user_id, p_node->'child', p_depth + 1);

    WHEN 'story_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_story_completions
         WHERE user_id = p_user_id AND story_id = p_node->>'story_id'
      );
    WHEN 'campaign_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_campaign_completions
         WHERE user_id = p_user_id AND campaign_id = p_node->>'campaign_id'
      );
    WHEN 'campaign_chapter_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_campaign_progress
         WHERE user_id = p_user_id
           AND campaign_id::text = p_node->>'campaign_id'
           AND chapter_id::text  = p_node->>'chapter_id'
           AND (status = 'completed' OR completed_at IS NOT NULL)
      );
    WHEN 'investigation_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_investigation_progress
         WHERE user_id = p_user_id
           AND investigation_id::text = p_node->>'investigation_id'
           AND completed_at IS NOT NULL
      );
    WHEN 'entity_discovered' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id AND entity_id::text = p_node->>'entity_id'
      );
    WHEN 'entities_discovered' THEN
      v_ids := COALESCE(p_node->'ids','[]'::jsonb);
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO v_hit
        FROM jsonb_array_elements_text(v_ids) AS x(id)
        JOIN public.user_entity_discoveries u
          ON u.user_id = p_user_id AND u.entity_id::text = x.id;
      RETURN v_hit >= v_min;
    WHEN 'artifact_owned' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_collection
         WHERE user_id = p_user_id
           AND item_id = p_node->>'artifact_id'
      ) OR EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id::text = p_node->>'artifact_id'
           AND (entity_type IS NULL OR entity_type = 'artifact')
      );
    WHEN 'atlas_location_visited' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id::text = p_node->>'location_id'
           AND (entity_type IS NULL OR entity_type = 'atlas_location')
      );
    WHEN 'achievement_unlocked' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_achievements
         WHERE user_id = p_user_id AND achievement_id = p_node->>'achievement_id'
      );
    WHEN 'player_level' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = p_user_id AND COALESCE(level, 0) >= v_min
      );
    WHEN 'date_window' THEN
      BEGIN
        v_start := CASE WHEN p_node ? 'start' THEN (p_node->>'start')::timestamptz ELSE NULL END;
        v_end   := CASE WHEN p_node ? 'end'   THEN (p_node->>'end')::timestamptz   ELSE NULL END;
      EXCEPTION WHEN others THEN
        RETURN false;
      END;
      IF v_start IS NULL AND v_end IS NULL THEN RETURN false; END IF;
      IF v_start IS NOT NULL AND v_now < v_start THEN RETURN false; END IF;
      IF v_end   IS NOT NULL AND v_now > v_end   THEN RETURN false; END IF;
      RETURN true;

    ELSE
      RETURN false;
  END CASE;
END;
$function$;