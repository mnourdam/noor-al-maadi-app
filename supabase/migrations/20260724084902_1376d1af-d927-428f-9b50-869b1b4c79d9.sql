
-- ============================================================
-- M3: Unlock Spec v2 — server evaluator + validator
-- Additive only. No existing objects are altered.
-- Mirrors src/lib/stories/unlock/*.ts exactly. Any behaviour
-- change here MUST be mirrored in the TS module and tests.
-- ============================================================

-- ---------- Normalizer: v1 (or bare v2 node) → v2 spec ----------
CREATE OR REPLACE FUNCTION public.normalize_unlock_spec_v2(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_rule jsonb;
  v_type text;
  v_children jsonb;
  v_conv jsonb := '[]'::jsonb;
  v_child jsonb;
  v_converted jsonb;
  v_id text;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) = 'null' THEN
    RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'always'));
  END IF;

  -- Already v2? Return as-is; validator called separately by caller.
  IF jsonb_typeof(p_input) = 'object'
     AND (p_input->>'v') = '2'
     AND p_input ? 'rule' THEN
    RETURN p_input;
  END IF;

  IF jsonb_typeof(p_input) <> 'object' THEN
    RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
  END IF;

  v_type := p_input->>'type';
  IF v_type IS NULL THEN
    RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
  END IF;

  IF v_type = 'always' THEN
    v_rule := jsonb_build_object('type', 'always');
  ELSIF v_type = 'never' THEN
    v_rule := jsonb_build_object('type', 'never');
  ELSIF v_type IN ('and', 'or', 'all_of', 'any_of') THEN
    v_children := COALESCE(p_input->'children', '[]'::jsonb);
    IF jsonb_typeof(v_children) <> 'array' OR jsonb_array_length(v_children) = 0 THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    FOR v_child IN SELECT jsonb_array_elements(v_children) LOOP
      v_converted := public.normalize_unlock_spec_v2(v_child);
      -- Unwrap the returned {v,rule} envelope back to a node.
      v_converted := v_converted->'rule';
      -- Any child that normalised to 'never' means garbage → whole node is never.
      IF (v_converted->>'type') = 'never' THEN
        RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
      END IF;
      v_conv := v_conv || jsonb_build_array(v_converted);
    END LOOP;
    v_rule := jsonb_build_object(
      'type', CASE WHEN v_type IN ('and', 'all_of') THEN 'all_of' ELSE 'any_of' END,
      'children', v_conv
    );
  ELSIF v_type = 'not' THEN
    IF NOT (p_input ? 'child') THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    v_converted := public.normalize_unlock_spec_v2(p_input->'child');
    v_converted := v_converted->'rule';
    IF (v_converted->>'type') = 'never' THEN
      -- 'not(never)' is legal — do NOT collapse here; only garbage children collapse.
      NULL;
    END IF;
    v_rule := jsonb_build_object('type', 'not', 'child', v_converted);
  ELSIF v_type IN ('story_complete', 'story_completed') THEN
    v_id := p_input->>'story_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    v_rule := jsonb_build_object('type', 'story_complete', 'story_id', v_id);
  ELSIF v_type IN ('campaign_complete', 'campaign_completed') THEN
    v_id := p_input->>'campaign_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    v_rule := jsonb_build_object('type', 'campaign_complete', 'campaign_id', v_id);
  ELSIF v_type IN ('investigation_complete', 'investigation_completed') THEN
    v_id := p_input->>'investigation_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    v_rule := jsonb_build_object('type', 'investigation_complete', 'investigation_id', v_id);
  ELSIF v_type = 'achievement_earned' THEN
    v_id := p_input->>'achievement_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
    END IF;
    v_rule := jsonb_build_object('type', 'achievement_earned', 'achievement_id', v_id);
  ELSE
    RETURN jsonb_build_object('v', 2, 'rule', jsonb_build_object('type', 'never'));
  END IF;

  RETURN jsonb_build_object('v', 2, 'rule', v_rule);
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_unlock_spec_v2(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.normalize_unlock_spec_v2(jsonb) TO anon, authenticated, service_role;


-- ---------- Structural validator ----------
-- Returns jsonb: { ok: bool, errors: [{code, path, message}], node_count, depth }
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
  -- Stack frames: {node jsonb, path text, depth int}
  v_stack jsonb := '[]'::jsonb;
  v_frame jsonb;
  v_node jsonb;
  v_path text;
  v_depth int;
  v_type text;
  v_allowed text[];
  v_key text;
  v_child jsonb;
  v_i int;
  v_kids jsonb;
  v_id text;
  v_id_field text;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    v_errors := v_errors || jsonb_build_object('code','not_an_object','path','$','message','Unlock spec must be a JSON object.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  IF (p_input->>'v')::int IS DISTINCT FROM 2 THEN
    v_errors := v_errors || jsonb_build_object('code','wrong_version','path','$.v','message','Unlock spec version must be 2.');
  END IF;

  IF NOT (p_input ? 'rule') THEN
    v_errors := v_errors || jsonb_build_object('code','missing_rule','path','$.rule','message','Unlock spec is missing rule.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  v_stack := jsonb_build_array(jsonb_build_object('node', p_input->'rule', 'path', '$.rule', 'depth', 1));

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
      WHEN 'always' THEN ARRAY['type']
      WHEN 'never' THEN ARRAY['type']
      WHEN 'all_of' THEN ARRAY['type','children']
      WHEN 'any_of' THEN ARRAY['type','children']
      WHEN 'not' THEN ARRAY['type','child']
      WHEN 'story_complete' THEN ARRAY['type','story_id']
      WHEN 'campaign_complete' THEN ARRAY['type','campaign_id']
      WHEN 'investigation_complete' THEN ARRAY['type','investigation_id']
      WHEN 'achievement_earned' THEN ARRAY['type','achievement_id']
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

    IF v_type IN ('all_of','any_of') THEN
      IF NOT (v_node ? 'children') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_children','path',v_path||'.children',
          'message', format('%L requires children.', v_type));
        CONTINUE;
      END IF;
      v_kids := v_node->'children';
      IF jsonb_typeof(v_kids) <> 'array' THEN
        v_errors := v_errors || jsonb_build_object('code','children_not_array','path',v_path||'.children',
          'message', format('%L.children must be an array.', v_type));
        CONTINUE;
      END IF;
      IF jsonb_array_length(v_kids) = 0 THEN
        v_errors := v_errors || jsonb_build_object('code','empty_children_forbidden','path',v_path||'.children',
          'message', format('%L.children must not be empty.', v_type));
        CONTINUE;
      END IF;
      FOR v_i IN 0..jsonb_array_length(v_kids) - 1 LOOP
        v_stack := v_stack || jsonb_build_array(jsonb_build_object(
          'node', v_kids->v_i,
          'path', v_path||'.children['||v_i||']',
          'depth', v_depth + 1
        ));
      END LOOP;
    ELSIF v_type = 'not' THEN
      IF NOT (v_node ? 'child') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_child','path',v_path||'.child',
          'message', 'not requires child.');
        CONTINUE;
      END IF;
      v_stack := v_stack || jsonb_build_array(jsonb_build_object(
        'node', v_node->'child',
        'path', v_path||'.child',
        'depth', v_depth + 1
      ));
    ELSIF v_type IN ('story_complete','campaign_complete','investigation_complete','achievement_earned') THEN
      v_id_field := CASE v_type
        WHEN 'story_complete' THEN 'story_id'
        WHEN 'campaign_complete' THEN 'campaign_id'
        WHEN 'investigation_complete' THEN 'investigation_id'
        WHEN 'achievement_earned' THEN 'achievement_id'
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
    END IF;
    -- always / never: no further checks.
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (jsonb_array_length(v_errors) = 0),
    'errors', v_errors,
    'node_count', v_node_count,
    'depth', v_max_depth
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_unlock_spec_v2(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_unlock_spec_v2(jsonb) TO anon, authenticated, service_role;


-- ---------- Evaluator: single source of truth ----------
-- Deterministic. Fail-closed. Reads only completion-truth tables the
-- user can already see under RLS-equivalent scope for their own uid.
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
  v_rule jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    -- Anonymous callers: only always-open specs pass.
    v_norm := public.normalize_unlock_spec_v2(p_spec);
    v_check := public.validate_unlock_spec_v2(v_norm);
    IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
    RETURN ((v_norm->'rule'->>'type') = 'always');
  END IF;

  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_check := public.validate_unlock_spec_v2(v_norm);
  IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
  v_rule := v_norm->'rule';
  RETURN public._eval_unlock_node_v2(p_user_id, v_rule, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_unlock_spec_v2(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_unlock_spec_v2(uuid, jsonb) TO anon, authenticated, service_role;


-- Internal recursive node evaluator. Fail-closed on unknown types,
-- missing fields, or depth-budget exhaustion.
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
BEGIN
  IF p_depth > 6 THEN RETURN false; END IF;
  IF p_node IS NULL OR jsonb_typeof(p_node) <> 'object' THEN RETURN false; END IF;
  v_type := p_node->>'type';

  CASE v_type
    WHEN 'always' THEN
      RETURN true;
    WHEN 'never' THEN
      RETURN false;
    WHEN 'all_of' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'children','[]'::jsonb)) LOOP
        IF NOT public._eval_unlock_node_v2(p_user_id, v_child, p_depth + 1) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'any_of' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'children','[]'::jsonb)) LOOP
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
    WHEN 'investigation_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_investigation_progress
         WHERE user_id = p_user_id
           AND investigation_id::text = p_node->>'investigation_id'
           AND completed_at IS NOT NULL
      );
    WHEN 'achievement_earned' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_achievements
         WHERE user_id = p_user_id
           AND achievement_id = p_node->>'achievement_id'
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public._eval_unlock_node_v2(uuid, jsonb, int) FROM public;
GRANT EXECUTE ON FUNCTION public._eval_unlock_node_v2(uuid, jsonb, int) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.evaluate_unlock_spec_v2(uuid, jsonb) IS
  'M3 Unlock Spec v2 — single source of truth. Deterministic, fail-closed, depth ≤ 6, node count ≤ 64. Mirrors src/lib/stories/unlock/evaluate.ts.';
