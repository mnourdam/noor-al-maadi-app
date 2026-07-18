
-- ============================================================
-- Phase B: Canonical investigation validator (retires the drifted
-- prompt-length version and adds string-or-object related_entities
-- support plus reward.coins/dinars conflict detection).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_validate_investigation_payload(
  v_data JSONB,
  v_before JSONB,
  v_allow_removals BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_dinars NUMERIC;
  v_coins NUMERIC;
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

  -- Numeric reward fields (accept both canonical `dinars` and legacy `coins`).
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

  -- Reject conflicting dinars vs coins (accept aligned duplicates for
  -- backward-compat, but never silently add them together).
  IF (v_reward ? 'dinars') AND (v_reward ? 'coins') THEN
    v_dinars := (v_reward->>'dinars')::numeric;
    v_coins  := (v_reward->>'coins')::numeric;
    IF v_dinars <> v_coins THEN
      RAISE EXCEPTION 'investigation.reward has conflicting dinars (%) and coins (%) values; normalize before save',
        v_dinars, v_coins;
    END IF;
  END IF;

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
    -- Accept canonical strings ("type:slug" or bare slug) OR legacy object
    -- shapes ({id}, {entity_id}, {slug}). Each entry must resolve to an
    -- enabled encyclopedia entity by slug or by id.
    WITH raw AS (
      SELECT r,
             CASE
               WHEN jsonb_typeof(r) = 'string' THEN
                 -- Strip optional "type:" prefix, keep the trailing slug part.
                 lower(split_part(trim(both '"' from r::text), ':', greatest(1, array_length(string_to_array(trim(both '"' from r::text), ':'),1))))
               ELSE NULL
             END AS str_slug,
             CASE WHEN jsonb_typeof(r) = 'object'
                  THEN COALESCE(r->>'slug', r->>'id', r->>'entity_id')
                  ELSE NULL
             END AS obj_ref
        FROM jsonb_array_elements(v_rel) r
    )
    SELECT count(*) INTO v_missing_rel
      FROM raw
      LEFT JOIN public.encyclopedia_entities ee
        ON ee.enabled = true
       AND (
         (raw.str_slug IS NOT NULL AND lower(ee.slug) = raw.str_slug) OR
         (raw.obj_ref IS NOT NULL AND (
            lower(ee.slug) = lower(raw.obj_ref) OR
            ee.id::text  = raw.obj_ref
         ))
       )
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

REVOKE ALL ON FUNCTION public.admin_validate_investigation_payload(JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_validate_investigation_payload(JSONB, JSONB, BOOLEAN) TO authenticated, service_role;

-- ============================================================
-- Phase B: Admin list of investigations
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_investigations()
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  subtitle TEXT,
  difficulty TEXT,
  enabled BOOLEAN,
  reward JSONB,
  step_count INT,
  question_count INT,
  related_count INT,
  related_entities JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      i.id,
      i.slug,
      i.title,
      i.subtitle,
      i.difficulty,
      i.enabled,
      COALESCE(i.reward, '{}'::jsonb) AS reward,
      COALESCE(jsonb_array_length(i.steps), 0)::INT AS step_count,
      (
        SELECT COALESCE(count(*), 0)::INT
          FROM jsonb_array_elements(COALESCE(i.steps,'[]'::jsonb)) s
         WHERE s->>'type' IN ('question','decision')
      ) AS question_count,
      COALESCE(jsonb_array_length(i.related_entities), 0)::INT AS related_count,
      COALESCE(i.related_entities, '[]'::jsonb) AS related_entities,
      i.created_at,
      i.updated_at
    FROM public.investigations i
    ORDER BY i.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_investigations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_investigations() TO authenticated;

-- ============================================================
-- Phase B: Full investigation payload (by id or slug)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_investigation_full(p_id_or_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uuid UUID;
  v_row public.investigations%ROWTYPE;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_id_or_slug IS NULL OR length(btrim(p_id_or_slug)) = 0 THEN
    RAISE EXCEPTION 'p_id_or_slug is required';
  END IF;

  BEGIN
    v_uuid := p_id_or_slug::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL THEN
    SELECT * INTO v_row FROM public.investigations WHERE id = v_uuid;
  ELSE
    SELECT * INTO v_row FROM public.investigations WHERE slug = p_id_or_slug;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',                v_row.id,
    'slug',              v_row.slug,
    'title',             v_row.title,
    'subtitle',          v_row.subtitle,
    'description',       v_row.description,
    'difficulty',        v_row.difficulty,
    'reward',            COALESCE(v_row.reward, '{}'::jsonb),
    'steps',             COALESCE(v_row.steps, '[]'::jsonb),
    'related_entities',  COALESCE(v_row.related_entities, '[]'::jsonb),
    'enabled',           v_row.enabled,
    'created_at',        v_row.created_at,
    'updated_at',        v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_investigation_full(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_investigation_full(TEXT) TO authenticated;

-- ============================================================
-- Phase B: Audited enable / disable
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_investigation_enabled(
  p_id UUID,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug TEXT;
  v_before BOOLEAN;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigations
     SET enabled = p_enabled, updated_at = now()
   WHERE id = p_id
   RETURNING slug, (NOT p_enabled) INTO v_slug, v_before;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'investigation % not found', p_id;
  END IF;

  INSERT INTO public.admin_audit_log(actor_id, action, detail, reason)
  VALUES (
    auth.uid(),
    CASE WHEN p_enabled THEN 'investigation.enable' ELSE 'investigation.disable' END,
    jsonb_build_object('investigation_id', p_id, 'slug', v_slug, 'enabled', p_enabled),
    NULL
  );

  RETURN jsonb_build_object('id', p_id, 'slug', v_slug, 'enabled', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_investigation_enabled(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_investigation_enabled(UUID, BOOLEAN) TO authenticated;
