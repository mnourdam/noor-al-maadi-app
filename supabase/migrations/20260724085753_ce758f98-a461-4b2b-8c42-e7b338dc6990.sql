
-- ============================================================
-- M3 REPAIR: Restore FROZEN Unlock Spec v2 contract
-- Additive corrective migration. Bodies only — signatures, grants,
-- tables, enums, RLS unchanged. Mirrors src/lib/stories/unlock/*.ts.
-- ============================================================

-- ---------- Normalizer: legacy → frozen v2 { version, expr } ----------
CREATE OR REPLACE FUNCTION public.normalize_unlock_spec_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_expr jsonb;
  v_type text;
  v_children jsonb;
  v_conv jsonb := '[]'::jsonb;
  v_child jsonb;
  v_converted jsonb;
  v_id text;
  v_cid text;
  v_chid text;
  v_ids jsonb;
  v_min int;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) = 'null' THEN
    RETURN jsonb_build_object('version', 2, 'expr', jsonb_build_object('type','always'));
  END IF;

  -- Already in the frozen envelope? Return as-is; caller validates.
  IF jsonb_typeof(p_input) = 'object'
     AND (p_input->>'version') = '2'
     AND p_input ? 'expr' THEN
    RETURN p_input;
  END IF;

  -- Legacy envelope { v: 1|2, rule } → unwrap rule, recurse.
  IF jsonb_typeof(p_input) = 'object'
     AND p_input ? 'rule'
     AND (p_input->>'v') IN ('1','2') THEN
    RETURN public.normalize_unlock_spec_v2(p_input->'rule');
  END IF;

  IF jsonb_typeof(p_input) <> 'object' THEN
    -- fail-closed NEVER (expressed as not(always) in the frozen vocab)
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  v_type := p_input->>'type';
  IF v_type IS NULL THEN
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  IF v_type = 'always' THEN
    v_expr := jsonb_build_object('type','always');

  ELSIF v_type = 'never' THEN
    -- Legacy 'never' → not(always).
    v_expr := jsonb_build_object('type','not','child', jsonb_build_object('type','always'));

  ELSIF v_type IN ('and','or','all_of','any_of','all','any') THEN
    v_children := COALESCE(p_input->'of', p_input->'children', '[]'::jsonb);
    IF jsonb_typeof(v_children) <> 'array' OR jsonb_array_length(v_children) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    FOR v_child IN SELECT jsonb_array_elements(v_children) LOOP
      v_converted := public.normalize_unlock_spec_v2(v_child);
      -- Unwrap {version,expr} back to a node.
      v_converted := v_converted->'expr';
      -- If any child collapsed to the fail-closed NEVER (not(always)), the whole group collapses.
      IF (v_converted->>'type') = 'not'
         AND (v_converted->'child'->>'type') = 'always' THEN
        RETURN jsonb_build_object('version', 2, 'expr',
          jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
      END IF;
      v_conv := v_conv || jsonb_build_array(v_converted);
    END LOOP;
    v_expr := jsonb_build_object(
      'type', CASE WHEN v_type IN ('and','all_of','all') THEN 'all' ELSE 'any' END,
      'of', v_conv
    );

  ELSIF v_type = 'not' THEN
    IF NOT (p_input ? 'child') THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_converted := public.normalize_unlock_spec_v2(p_input->'child');
    v_converted := v_converted->'expr';
    v_expr := jsonb_build_object('type','not','child', v_converted);

  ELSIF v_type IN ('story_complete','story_completed') THEN
    v_id := p_input->>'story_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','story_complete','story_id', v_id);

  ELSIF v_type IN ('campaign_complete','campaign_completed') THEN
    v_id := p_input->>'campaign_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','campaign_complete','campaign_id', v_id);

  ELSIF v_type = 'campaign_chapter_complete' THEN
    v_cid := p_input->>'campaign_id';
    v_chid := p_input->>'chapter_id';
    IF v_cid IS NULL OR length(v_cid) = 0 OR v_chid IS NULL OR length(v_chid) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','campaign_chapter_complete',
      'campaign_id', v_cid, 'chapter_id', v_chid);

  ELSIF v_type IN ('investigation_complete','investigation_completed') THEN
    v_id := p_input->>'investigation_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','investigation_complete','investigation_id', v_id);

  ELSIF v_type = 'entity_discovered' THEN
    v_id := p_input->>'entity_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','entity_discovered','entity_id', v_id);

  ELSIF v_type = 'entities_discovered' THEN
    v_ids := p_input->'ids';
    IF v_ids IS NULL OR jsonb_typeof(v_ids) <> 'array' OR jsonb_array_length(v_ids) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    BEGIN
      v_min := (p_input->>'min')::int;
    EXCEPTION WHEN others THEN
      v_min := 0;
    END;
    IF v_min < 1 OR v_min > jsonb_array_length(v_ids) THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','entities_discovered','ids', v_ids, 'min', v_min);

  ELSIF v_type = 'artifact_owned' THEN
    v_id := p_input->>'artifact_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','artifact_owned','artifact_id', v_id);

  ELSIF v_type = 'atlas_location_visited' THEN
    v_id := p_input->>'location_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','atlas_location_visited','location_id', v_id);

  ELSIF v_type IN ('achievement_unlocked','achievement_earned') THEN
    v_id := p_input->>'achievement_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','achievement_unlocked','achievement_id', v_id);

  ELSIF v_type = 'player_level' THEN
    BEGIN
      v_min := (p_input->>'min')::int;
    EXCEPTION WHEN others THEN
      v_min := 0;
    END;
    IF v_min < 1 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','player_level','min', v_min);

  ELSIF v_type = 'date_window' THEN
    IF NOT (p_input ? 'start') AND NOT (p_input ? 'end') THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','date_window');
    IF p_input ? 'start' THEN v_expr := v_expr || jsonb_build_object('start', p_input->>'start'); END IF;
    IF p_input ? 'end'   THEN v_expr := v_expr || jsonb_build_object('end',   p_input->>'end');   END IF;

  ELSE
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  RETURN jsonb_build_object('version', 2, 'expr', v_expr);
END;
$$;


-- ---------- Structural validator ----------
CREATE OR REPLACE FUNCTION public.validate_unlock_spec_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_node_count int := 0;
  v_max_depth int := 0;
  v_max_allowed_depth constant int := 6;
  v_max_nodes constant int := 64;
  v_stack jsonb := '[]'::jsonb;
  v_frame jsonb;
  v_node jsonb;
  v_path text;
  v_depth int;
  v_type text;
  v_allowed text[];
  v_key text;
  v_i int;
  v_kids jsonb;
  v_id text;
  v_id_field text;
  v_min_txt text;
  v_min_num numeric;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    v_errors := v_errors || jsonb_build_object('code','not_an_object','path','$','message','Unlock spec must be a JSON object.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  IF (p_input->>'version') IS DISTINCT FROM '2' THEN
    v_errors := v_errors || jsonb_build_object('code','wrong_version','path','$.version','message','Unlock spec version must be 2.');
  END IF;

  IF NOT (p_input ? 'expr') THEN
    v_errors := v_errors || jsonb_build_object('code','missing_expr','path','$.expr','message','Unlock spec is missing expr.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  v_stack := jsonb_build_array(jsonb_build_object('node', p_input->'expr', 'path', '$.expr', 'depth', 1));

  WHILE jsonb_array_length(v_stack) > 0 LOOP
    v_frame := v_stack->-1;
    v_stack := v_stack - (jsonb_array_length(v_stack) - 1);
    v_node := v_frame->'node';
    v_path := v_frame->>'path';
    v_depth := (v_frame->>'depth')::int;
    IF v_depth > v_max_depth THEN v_max_depth := v_depth; END IF;

    IF v_depth > v_max_allowed_depth THEN
      v_errors := v_errors || jsonb_build_object('code','depth_exceeded','path',v_path,
        'message', format('Nesting depth exceeds %s.', v_max_allowed_depth));
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_node) <> 'object' THEN
      v_errors := v_errors || jsonb_build_object('code','not_an_object_node','path',v_path,'message','Node must be a JSON object.');
      CONTINUE;
    END IF;
    v_node_count := v_node_count + 1;
    IF v_node_count > v_max_nodes THEN
      v_errors := v_errors || jsonb_build_object('code','node_count_exceeded','path',v_path,
        'message', format('Node count exceeds %s.', v_max_nodes));
      CONTINUE;
    END IF;

    v_type := v_node->>'type';
    IF v_type IS NULL OR length(v_type) = 0 THEN
      v_errors := v_errors || jsonb_build_object('code','missing_type','path',v_path||'.type','message','Node is missing type.');
      CONTINUE;
    END IF;

    v_allowed := CASE v_type
      WHEN 'all' THEN ARRAY['type','of']
      WHEN 'any' THEN ARRAY['type','of']
      WHEN 'not' THEN ARRAY['type','child']
      WHEN 'always' THEN ARRAY['type']
      WHEN 'campaign_complete' THEN ARRAY['type','campaign_id']
      WHEN 'campaign_chapter_complete' THEN ARRAY['type','campaign_id','chapter_id']
      WHEN 'investigation_complete' THEN ARRAY['type','investigation_id']
      WHEN 'entity_discovered' THEN ARRAY['type','entity_id']
      WHEN 'entities_discovered' THEN ARRAY['type','ids','min']
      WHEN 'artifact_owned' THEN ARRAY['type','artifact_id']
      WHEN 'atlas_location_visited' THEN ARRAY['type','location_id']
      WHEN 'achievement_unlocked' THEN ARRAY['type','achievement_id']
      WHEN 'player_level' THEN ARRAY['type','min']
      WHEN 'story_complete' THEN ARRAY['type','story_id']
      WHEN 'date_window' THEN ARRAY['type','start','end']
      ELSE NULL
    END;
    IF v_allowed IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','unknown_type','path',v_path||'.type',
        'message', format('Unknown node type %L.', v_type));
      CONTINUE;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(v_node) LOOP
      IF NOT (v_key = ANY(v_allowed)) THEN
        v_errors := v_errors || jsonb_build_object('code','extra_fields','path',v_path||'.'||v_key,
          'message', format('Field %L is not allowed on %L nodes.', v_key, v_type));
      END IF;
    END LOOP;

    IF v_type IN ('all','any') THEN
      IF NOT (v_node ? 'of') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_of','path',v_path||'.of',
          'message', format('%L requires of.', v_type));
        CONTINUE;
      END IF;
      v_kids := v_node->'of';
      IF jsonb_typeof(v_kids) <> 'array' THEN
        v_errors := v_errors || jsonb_build_object('code','of_not_array','path',v_path||'.of',
          'message', format('%L.of must be an array.', v_type));
        CONTINUE;
      END IF;
      IF jsonb_array_length(v_kids) = 0 THEN
        v_errors := v_errors || jsonb_build_object('code','empty_of_forbidden','path',v_path||'.of',
          'message', format('%L.of must not be empty.', v_type));
        CONTINUE;
      END IF;
      FOR v_i IN 0..jsonb_array_length(v_kids) - 1 LOOP
        v_stack := v_stack || jsonb_build_array(jsonb_build_object(
          'node', v_kids->v_i,
          'path', v_path||'.of['||v_i||']',
          'depth', v_depth + 1
        ));
      END LOOP;

    ELSIF v_type = 'not' THEN
      IF NOT (v_node ? 'child') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_child','path',v_path||'.child','message','not requires child.');
        CONTINUE;
      END IF;
      v_stack := v_stack || jsonb_build_array(jsonb_build_object(
        'node', v_node->'child',
        'path', v_path||'.child',
        'depth', v_depth + 1
      ));

    ELSIF v_type IN ('story_complete','campaign_complete','investigation_complete',
                     'entity_discovered','artifact_owned','atlas_location_visited','achievement_unlocked') THEN
      v_id_field := CASE v_type
        WHEN 'story_complete' THEN 'story_id'
        WHEN 'campaign_complete' THEN 'campaign_id'
        WHEN 'investigation_complete' THEN 'investigation_id'
        WHEN 'entity_discovered' THEN 'entity_id'
        WHEN 'artifact_owned' THEN 'artifact_id'
        WHEN 'atlas_location_visited' THEN 'location_id'
        WHEN 'achievement_unlocked' THEN 'achievement_id'
      END;
      IF NOT (v_node ? v_id_field) THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.'||v_id_field,
          'message', format('%L requires %L.', v_type, v_id_field));
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_node->v_id_field) <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('code','id_not_string','path',v_path||'.'||v_id_field,
          'message', format('%L must be a string.', v_id_field));
        CONTINUE;
      END IF;
      v_id := v_node->>v_id_field;
      IF length(btrim(v_id)) = 0 THEN
        v_errors := v_errors || jsonb_build_object('code','id_empty','path',v_path||'.'||v_id_field,
          'message', format('%L must not be empty.', v_id_field));
      END IF;

    ELSIF v_type = 'campaign_chapter_complete' THEN
      FOREACH v_id_field IN ARRAY ARRAY['campaign_id','chapter_id'] LOOP
        IF NOT (v_node ? v_id_field) THEN
          v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.'||v_id_field,
            'message', format('campaign_chapter_complete requires %L.', v_id_field));
        ELSIF jsonb_typeof(v_node->v_id_field) <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','id_not_string','path',v_path||'.'||v_id_field,
            'message', format('%L must be a string.', v_id_field));
        ELSIF length(btrim(v_node->>v_id_field)) = 0 THEN
          v_errors := v_errors || jsonb_build_object('code','id_empty','path',v_path||'.'||v_id_field,
            'message', format('%L must not be empty.', v_id_field));
        END IF;
      END LOOP;

    ELSIF v_type = 'entities_discovered' THEN
      IF NOT (v_node ? 'ids') OR jsonb_typeof(v_node->'ids') <> 'array' THEN
        v_errors := v_errors || jsonb_build_object('code','ids_not_array','path',v_path||'.ids','message','ids must be an array.');
      ELSE
        IF jsonb_array_length(v_node->'ids') = 0 THEN
          v_errors := v_errors || jsonb_build_object('code','ids_empty','path',v_path||'.ids','message','ids must not be empty.');
        END IF;
        FOR v_i IN 0..GREATEST(jsonb_array_length(v_node->'ids') - 1, -1) LOOP
          EXIT WHEN jsonb_array_length(v_node->'ids') = 0;
          IF jsonb_typeof((v_node->'ids')->v_i) <> 'string'
             OR length(btrim((v_node->'ids')->>v_i)) = 0 THEN
            v_errors := v_errors || jsonb_build_object('code','ids_item_not_string',
              'path', v_path||'.ids['||v_i||']', 'message','ids item must be a non-empty string.');
          END IF;
        END LOOP;
      END IF;
      IF NOT (v_node ? 'min') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.min','message','entities_discovered requires min.');
      ELSE
        v_min_txt := v_node->>'min';
        BEGIN
          v_min_num := v_min_txt::numeric;
          IF v_min_num <> trunc(v_min_num) THEN
            v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
          ELSIF v_min_num < 1
                OR (jsonb_typeof(v_node->'ids') = 'array'
                    AND v_min_num > jsonb_array_length(v_node->'ids')) THEN
            v_errors := v_errors || jsonb_build_object('code','min_out_of_range','path',v_path||'.min','message','min must be between 1 and ids.length.');
          END IF;
        EXCEPTION WHEN others THEN
          v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
        END;
      END IF;

    ELSIF v_type = 'player_level' THEN
      IF NOT (v_node ? 'min') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.min','message','player_level requires min.');
      ELSE
        v_min_txt := v_node->>'min';
        BEGIN
          v_min_num := v_min_txt::numeric;
          IF v_min_num <> trunc(v_min_num) THEN
            v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
          ELSIF v_min_num < 1 THEN
            v_errors := v_errors || jsonb_build_object('code','min_out_of_range','path',v_path||'.min','message','min must be >= 1.');
          END IF;
        EXCEPTION WHEN others THEN
          v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
        END;
      END IF;

    ELSIF v_type = 'date_window' THEN
      IF NOT (v_node ? 'start') AND NOT (v_node ? 'end') THEN
        v_errors := v_errors || jsonb_build_object('code','date_window_empty','path',v_path,'message','date_window requires start and/or end.');
      ELSE
        IF v_node ? 'start' AND jsonb_typeof(v_node->'start') <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','date_not_string','path',v_path||'.start','message','start must be an ISO date string.');
        END IF;
        IF v_node ? 'end' AND jsonb_typeof(v_node->'end') <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','date_not_string','path',v_path||'.end','message','end must be an ISO date string.');
        END IF;
      END IF;
    END IF;
    -- always: no further checks.
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (jsonb_array_length(v_errors) = 0),
    'errors', v_errors,
    'node_count', v_node_count,
    'depth', v_max_depth
  );
END;
$$;


-- ---------- Evaluator: single source of truth (frozen) ----------
CREATE OR REPLACE FUNCTION public._eval_unlock_node_v2(p_user_id uuid, p_node jsonb, p_depth int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_child jsonb;
  v_id text;
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
      -- Fail-closed: artifact ownership uses the entity discovery ledger with entity_type='artifact'.
      RETURN EXISTS (
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
$$;


CREATE OR REPLACE FUNCTION public.evaluate_unlock_spec_v2(p_user_id uuid, p_spec jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm jsonb;
  v_check jsonb;
  v_expr jsonb;
BEGIN
  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_check := public.validate_unlock_spec_v2(v_norm);
  IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
  v_expr := v_norm->'expr';

  IF p_user_id IS NULL THEN
    -- Anonymous callers: only unconditional 'always' passes.
    RETURN ((v_expr->>'type') = 'always');
  END IF;

  RETURN public._eval_unlock_node_v2(p_user_id, v_expr, 1);
END;
$$;

COMMENT ON FUNCTION public.evaluate_unlock_spec_v2(uuid, jsonb) IS
  'M3 Unlock Spec v2 — SoT for the FROZEN contract. Envelope {version:2,expr}. Logical: all/any(of), not(child). Fail-closed. Mirrors src/lib/stories/unlock/evaluate.ts.';
