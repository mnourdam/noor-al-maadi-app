CREATE OR REPLACE FUNCTION public.admin_validate_investigation_payload(
  v_data JSONB,
  v_before JSONB,
  v_allow_removals BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT := v_data->>'title';
  v_slug TEXT := v_data->>'slug';
  v_diff TEXT := v_data->>'difficulty';
  v_steps JSONB := COALESCE(v_data->'steps','[]'::jsonb);
  v_reward JSONB := COALESCE(v_data->'reward','{}'::jsonb);
  v_rel JSONB := COALESCE(v_data->'related_entities','[]'::jsonb);
  v_step JSONB;
  v_type TEXT;
  v_prompt TEXT;
  v_opts JSONB;
  v_correct INT;
  v_ids TEXT[] := ARRAY[]::TEXT[];
  v_qcount INT := 0;
  v_i INT;
  v_txt TEXT;
  v_missing_rel INT := 0;
  v_before_ids TEXT[] := ARRAY[]::TEXT[];
  v_incoming_ids TEXT[] := ARRAY[]::TEXT[];
  v_removed TEXT[];
  v_num NUMERIC;
BEGIN
  IF v_title IS NULL OR length(btrim(v_title)) < 2 THEN
    RAISE EXCEPTION 'investigation.title is required (min 2 chars)';
  END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,80}$' THEN
    RAISE EXCEPTION 'investigation.slug is required and must be a valid slug';
  END IF;
  IF v_diff IS NOT NULL AND v_diff NOT IN ('easy','medium','hard') THEN
    RAISE EXCEPTION 'investigation.difficulty must be easy|medium|hard';
  END IF;

  FOR v_txt IN SELECT unnest(ARRAY['xp','dinars','hearts','coins']) LOOP
    IF v_reward ? v_txt THEN
      BEGIN
        v_num := (v_reward->>v_txt)::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'investigation.reward.% must be numeric', v_txt;
      END;
      IF v_num < 0 OR v_num > 100000 THEN
        RAISE EXCEPTION 'investigation.reward.% is out of range (0..100000)', v_txt;
      END IF;
    END IF;
  END LOOP;

  IF jsonb_typeof(v_steps) <> 'array' OR jsonb_array_length(v_steps) < 1 THEN
    RAISE EXCEPTION 'investigation.steps must be a non-empty array';
  END IF;

  FOR v_i IN 0 .. jsonb_array_length(v_steps)-1 LOOP
    v_step := v_steps -> v_i;
    v_type := v_step->>'type';
    IF v_type NOT IN ('briefing','evidence','question','decision','conclusion') THEN
      RAISE EXCEPTION 'investigation.steps[%].type is invalid: %', v_i, COALESCE(v_type,'null');
    END IF;

    IF v_step ? 'id' AND (v_step->>'id') IS NOT NULL THEN
      IF (v_step->>'id') = ANY(v_ids) THEN
        RAISE EXCEPTION 'investigation.steps[%].id % is duplicated', v_i, v_step->>'id';
      END IF;
      v_ids := v_ids || (v_step->>'id');
    END IF;

    IF v_type IN ('question','decision') THEN
      v_qcount := v_qcount + 1;
      v_prompt := v_step->>'prompt';
      IF v_prompt IS NULL OR length(btrim(v_prompt)) < 1 THEN
        RAISE EXCEPTION 'investigation.steps[%].prompt is required', v_i;
      END IF;
      v_opts := v_step->'options';
      IF jsonb_typeof(v_opts) <> 'array' OR jsonb_array_length(v_opts) < 2 THEN
        RAISE EXCEPTION 'investigation.steps[%].options must have >= 2 entries', v_i;
      END IF;
      IF (SELECT count(*) FROM jsonb_array_elements_text(v_opts) t WHERE btrim(t) = '') > 0 THEN
        RAISE EXCEPTION 'investigation.steps[%].options contains an empty entry', v_i;
      END IF;
      IF (SELECT count(*) - count(DISTINCT t) FROM jsonb_array_elements_text(v_opts) t) > 0 THEN
        RAISE EXCEPTION 'investigation.steps[%].options contains duplicates', v_i;
      END IF;

      IF v_type = 'question' AND (v_step->>'correctAnswer') IS NULL THEN
        RAISE EXCEPTION 'investigation.steps[%].correctAnswer is required for question', v_i;
      END IF;
      IF (v_step->>'correctAnswer') IS NOT NULL THEN
        BEGIN
          v_correct := (v_step->>'correctAnswer')::int;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'investigation.steps[%].correctAnswer must be an integer', v_i;
        END;
        IF v_correct < 0 OR v_correct >= jsonb_array_length(v_opts) THEN
          RAISE EXCEPTION 'investigation.steps[%].correctAnswer is out of range', v_i;
        END IF;
      END IF;
    ELSIF v_type IN ('briefing','conclusion','evidence') THEN
      v_txt := v_step->>'text';
      IF v_txt IS NULL OR length(btrim(v_txt)) < 1 THEN
        RAISE EXCEPTION 'investigation.steps[%].text is required for % step', v_i, v_type;
      END IF;
    END IF;
  END LOOP;

  IF v_qcount < 1 THEN
    RAISE EXCEPTION 'investigation must contain at least one question or decision step';
  END IF;

  IF jsonb_typeof(v_rel) <> 'array' THEN
    RAISE EXCEPTION 'investigation.related_entities must be an array';
  END IF;
  IF jsonb_array_length(v_rel) > 0 THEN
    SELECT count(*) INTO v_missing_rel
    FROM jsonb_array_elements(v_rel) r
    LEFT JOIN public.encyclopedia_entities ee
      ON ee.id::text = COALESCE(r->>'id', r->>'entity_id')
     AND ee.enabled = true
    WHERE ee.id IS NULL;
    IF v_missing_rel > 0 THEN
      RAISE EXCEPTION 'investigation.related_entities has % unresolved or disabled reference(s)', v_missing_rel;
    END IF;
  END IF;

  IF v_before IS NOT NULL THEN
    SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::TEXT[])
      INTO v_before_ids
      FROM jsonb_array_elements(COALESCE(v_before->'steps','[]'::jsonb)) s
     WHERE (s->>'id') IS NOT NULL;
    SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::TEXT[])
      INTO v_incoming_ids
      FROM jsonb_array_elements(v_steps) s
     WHERE (s->>'id') IS NOT NULL;
    SELECT ARRAY(SELECT unnest(v_before_ids) EXCEPT SELECT unnest(v_incoming_ids)) INTO v_removed;
    IF array_length(v_removed,1) IS NOT NULL AND NOT v_allow_removals THEN
      RAISE EXCEPTION 'investigation update removes step id(s) [%] without explicit allow_removals approval',
        array_to_string(v_removed, ',');
    END IF;
  END IF;
END;
$$;