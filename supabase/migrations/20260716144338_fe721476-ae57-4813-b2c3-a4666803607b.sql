-- ============================================================
-- Phase 5.5b — Nested-transactional investigation import.
-- ============================================================

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
      IF v_prompt IS NULL OR length(btrim(v_prompt)) < 3 THEN
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
      IF v_txt IS NULL OR length(btrim(v_txt)) < 2 THEN
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

REVOKE ALL ON FUNCTION public.admin_validate_investigation_payload(JSONB, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_validate_investigation_payload(JSONB, JSONB, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_merge_investigation_stable_ids(
  v_data JSONB,
  v_before JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incoming JSONB := COALESCE(v_data->'steps','[]'::jsonb);
  v_prev JSONB := COALESCE(v_before->'steps','[]'::jsonb);
  v_out JSONB := '[]'::jsonb;
  v_step JSONB;
  v_type TEXT;
  v_id TEXT;
  v_i INT;
  v_prev_step JSONB;
  v_match JSONB;
BEGIN
  IF jsonb_typeof(v_incoming) <> 'array' THEN
    RETURN v_data;
  END IF;

  FOR v_i IN 0 .. jsonb_array_length(v_incoming)-1 LOOP
    v_step := v_incoming -> v_i;
    v_type := v_step->>'type';
    v_id := v_step->>'id';

    IF v_id IS NULL AND v_before IS NOT NULL AND jsonb_array_length(v_prev) > 0 THEN
      SELECT s INTO v_match
      FROM jsonb_array_elements(v_prev) s
      WHERE s->>'type' = v_type
        AND (
          (v_type IN ('question','decision') AND s->>'prompt' = v_step->>'prompt' AND (s->>'prompt') IS NOT NULL)
          OR (v_type IN ('briefing','evidence','conclusion') AND s->>'text' = v_step->>'text' AND (s->>'text') IS NOT NULL)
        )
        AND (s->>'id') IS NOT NULL
      LIMIT 1;

      IF v_match IS NULL AND v_i < jsonb_array_length(v_prev) THEN
        v_prev_step := v_prev -> v_i;
        IF v_prev_step->>'type' = v_type AND (v_prev_step->>'id') IS NOT NULL THEN
          v_match := v_prev_step;
        END IF;
      END IF;

      IF v_match IS NOT NULL THEN
        v_id := v_match->>'id';
      END IF;
    END IF;

    IF v_id IS NULL AND v_type IN ('question','decision','evidence') THEN
      v_id := gen_random_uuid()::text;
    END IF;

    IF v_id IS NOT NULL THEN
      v_step := jsonb_set(v_step, '{id}', to_jsonb(v_id));
    END IF;

    v_out := v_out || jsonb_build_array(v_step);
  END LOOP;

  RETURN jsonb_set(v_data, '{steps}', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_investigation_stable_ids(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merge_investigation_stable_ids(JSONB, JSONB) TO authenticated;

-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_run_import_batch(plan JSONB, p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ctype TEXT := plan->>'content_type';
  v_plan_hash TEXT := plan->>'approved_plan_hash';
  v_payload_hash TEXT := plan->>'original_payload_hash';
  v_file TEXT := plan->>'file_name';
  v_items JSONB := COALESCE(plan->'items','[]'::jsonb);
  v_meta JSONB := COALESCE(plan->'metadata','{}'::jsonb);
  v_allow_removals BOOLEAN := COALESCE((v_meta->>'allow_removals')::boolean, false);
  v_batch UUID;
  v_existing_batch UUID;
  v_item JSONB;
  v_action TEXT;
  v_target UUID;
  v_before JSONB;
  v_after JSONB;
  v_new_id UUID;
  v_version_signal TEXT;
  v_current_version TEXT;
  v_data JSONB;
  v_target_key JSONB;
  v_slug TEXT;
  v_etype TEXT;
  v_table TEXT;
  v_cols TEXT;
  v_created INT := 0;
  v_updated INT := 0;
  v_aliased INT := 0;
  v_skipped INT := 0;
  v_failed INT := 0;
  v_conflict INT := 0;
  v_item_results JSONB := '[]'::jsonb;
  v_this_result JSONB;
  v_err TEXT;
  v_first_err TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'owner')) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('dry_run','commit') THEN
    RAISE EXCEPTION 'invalid mode';
  END IF;
  IF v_plan_hash IS NULL OR length(v_plan_hash) < 8 THEN
    RAISE EXCEPTION 'missing approved_plan_hash';
  END IF;
  IF v_ctype IS NULL THEN RAISE EXCEPTION 'missing content_type'; END IF;

  IF p_mode = 'commit' THEN
    SELECT b.id INTO v_existing_batch
      FROM public.admin_import_batches b
     WHERE b.approved_plan_hash = v_plan_hash AND b.status = 'succeeded' AND b.mode = 'commit'
     LIMIT 1;
    IF v_existing_batch IS NOT NULL THEN
      RETURN jsonb_build_object('status','already_committed','batch_id', v_existing_batch);
    END IF;
  END IF;

  INSERT INTO public.admin_import_batches
    (admin_user_id, content_type, file_name, original_payload_hash, approved_plan_hash, mode, status, item_count, metadata)
  VALUES
    (v_uid, v_ctype, v_file, v_payload_hash, v_plan_hash, p_mode,
     CASE WHEN p_mode='commit' THEN 'committing' ELSE 'validating' END,
     jsonb_array_length(v_items),
     v_meta)
  RETURNING id INTO v_batch;

  BEGIN
    FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
      v_action := v_item->>'action';
      v_data := COALESCE(v_item->'data','{}'::jsonb);
      v_target_key := COALESCE(v_item->'target_key','{}'::jsonb);
      v_version_signal := v_item->>'version_signal';
      v_target := NULL; v_before := NULL; v_after := NULL; v_new_id := NULL; v_err := NULL;

      BEGIN
        IF v_action = 'skip' THEN
          v_skipped := v_skipped + 1;

        ELSIF v_ctype = 'encyclopedia' THEN
          v_slug := v_target_key->>'slug';
          v_etype := v_target_key->>'entity_type';

          IF v_action IN ('update','alias') THEN
            SELECT id, to_jsonb(t.*), COALESCE(to_jsonb(t.*)->>'updated_at', to_jsonb(t.*)->>'created_at')
              INTO v_target, v_before, v_current_version
              FROM public.encyclopedia_entities t
             WHERE entity_type = v_etype AND slug = v_slug
             LIMIT 1;
            IF v_target IS NULL THEN
              RAISE EXCEPTION 'target not found: %/%', v_etype, v_slug;
            END IF;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              RAISE EXCEPTION 'stale: content changed since preview' USING ERRCODE = 'P0004';
            END IF;
          END IF;

          IF v_action = 'new' THEN
            INSERT INTO public.encyclopedia_entities
              (entity_type, slug, title, subtitle, summary, body, metadata, enabled,
               timeline_year, timeline_start_year, timeline_end_year, timeline_hijri,
               timeline_order, timeline_category, timeline_tone, timeline_glyph)
            VALUES
              (v_data->>'entity_type', v_data->>'slug', v_data->>'title',
               NULLIF(v_data->>'subtitle',''), NULLIF(v_data->>'summary',''),
               COALESCE(v_data->'body','{}'::jsonb), COALESCE(v_data->'metadata','{}'::jsonb),
               COALESCE((v_data->>'enabled')::boolean, true),
               NULLIF(v_data->>'timeline_year','')::int,
               NULLIF(v_data->>'timeline_start_year','')::int,
               NULLIF(v_data->>'timeline_end_year','')::int,
               NULLIF(v_data->>'timeline_hijri',''),
               NULLIF(v_data->>'timeline_order','')::int,
               NULLIF(v_data->>'timeline_category',''),
               NULLIF(v_data->>'timeline_tone',''),
               NULLIF(v_data->>'timeline_glyph',''))
            RETURNING id, to_jsonb(encyclopedia_entities.*) INTO v_new_id, v_after;
            v_target := v_new_id; v_created := v_created + 1;

          ELSIF v_action = 'update' THEN
            UPDATE public.encyclopedia_entities SET
              title = v_data->>'title',
              subtitle = NULLIF(v_data->>'subtitle',''),
              summary = NULLIF(v_data->>'summary',''),
              body = COALESCE(v_data->'body','{}'::jsonb),
              metadata = COALESCE(v_data->'metadata','{}'::jsonb),
              enabled = COALESCE((v_data->>'enabled')::boolean, true),
              timeline_year = NULLIF(v_data->>'timeline_year','')::int,
              timeline_start_year = NULLIF(v_data->>'timeline_start_year','')::int,
              timeline_end_year = NULLIF(v_data->>'timeline_end_year','')::int,
              timeline_hijri = NULLIF(v_data->>'timeline_hijri',''),
              timeline_order = NULLIF(v_data->>'timeline_order','')::int,
              timeline_category = NULLIF(v_data->>'timeline_category',''),
              timeline_tone = NULLIF(v_data->>'timeline_tone',''),
              timeline_glyph = NULLIF(v_data->>'timeline_glyph','')
            WHERE id = v_target
            RETURNING to_jsonb(encyclopedia_entities.*) INTO v_after;
            v_updated := v_updated + 1;

          ELSIF v_action = 'alias' THEN
            UPDATE public.encyclopedia_entities
               SET metadata = jsonb_set(
                     COALESCE(metadata,'{}'::jsonb),
                     '{aliases}',
                     COALESCE(v_data->'metadata'->'aliases','[]'::jsonb))
             WHERE id = v_target
             RETURNING to_jsonb(encyclopedia_entities.*) INTO v_after;
            v_aliased := v_aliased + 1;
          END IF;

        ELSIF v_ctype = 'investigations' THEN
          IF v_action = 'update' THEN
            v_target := NULLIF(v_target_key->>'id','')::uuid;
            IF v_target IS NULL THEN
              RAISE EXCEPTION 'update requires target_key.id for investigations';
            END IF;
            SELECT to_jsonb(t.*), COALESCE(to_jsonb(t.*)->>'updated_at', to_jsonb(t.*)->>'created_at')
              INTO v_before, v_current_version
              FROM public.investigations t WHERE id = v_target LIMIT 1;
            IF v_before IS NULL THEN RAISE EXCEPTION 'target not found: %', v_target; END IF;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              RAISE EXCEPTION 'stale: content changed since preview' USING ERRCODE = 'P0004';
            END IF;
            v_data := public.admin_merge_investigation_stable_ids(v_data, v_before);
          ELSIF v_action = 'new' THEN
            v_data := public.admin_merge_investigation_stable_ids(v_data, NULL);
          END IF;

          IF v_action IN ('new','update') THEN
            PERFORM public.admin_validate_investigation_payload(v_data, v_before, v_allow_removals);
          END IF;

          IF v_action = 'new' THEN
            INSERT INTO public.investigations
              (slug, title, subtitle, description, difficulty, reward, steps, related_entities, enabled)
            VALUES
              (v_data->>'slug', v_data->>'title',
               NULLIF(v_data->>'subtitle',''), NULLIF(v_data->>'description',''),
               COALESCE(v_data->>'difficulty','easy'),
               COALESCE(v_data->'reward','{}'::jsonb),
               COALESCE(v_data->'steps','[]'::jsonb),
               COALESCE(v_data->'related_entities','[]'::jsonb),
               COALESCE((v_data->>'enabled')::boolean, true))
            RETURNING id, to_jsonb(investigations.*) INTO v_new_id, v_after;
            v_target := v_new_id; v_created := v_created + 1;
          ELSIF v_action = 'update' THEN
            UPDATE public.investigations SET
              slug = COALESCE(v_data->>'slug', slug),
              title = COALESCE(v_data->>'title', title),
              subtitle = NULLIF(v_data->>'subtitle',''),
              description = NULLIF(v_data->>'description',''),
              difficulty = COALESCE(v_data->>'difficulty', difficulty),
              reward = COALESCE(v_data->'reward','{}'::jsonb),
              steps = COALESCE(v_data->'steps','[]'::jsonb),
              related_entities = COALESCE(v_data->'related_entities','[]'::jsonb),
              enabled = COALESCE((v_data->>'enabled')::boolean, enabled)
            WHERE id = v_target
            RETURNING to_jsonb(investigations.*) INTO v_after;
            v_updated := v_updated + 1;
          ELSE
            RAISE EXCEPTION 'action % not supported for investigations', v_action;
          END IF;

        ELSIF v_ctype IN ('daily_facts','today_in_history_events','notifications') THEN
          v_table := public.admin_import_content_table(v_ctype);
          v_cols := (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_data - 'id') k);
          IF v_cols IS NULL OR v_cols = '' THEN
            RAISE EXCEPTION 'no columns supplied for % item %', v_ctype, v_item->>'index';
          END IF;
          IF v_action = 'new' THEN
            EXECUTE format(
              'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING id, to_jsonb(%I.*)',
              v_table, v_cols, v_cols, v_table, v_table)
              INTO v_new_id, v_after USING v_data;
            v_target := v_new_id; v_created := v_created + 1;
          ELSIF v_action = 'update' THEN
            v_target := NULLIF(v_target_key->>'id','')::uuid;
            IF v_target IS NULL THEN
              RAISE EXCEPTION 'update requires target_key.id for %', v_ctype;
            END IF;
            EXECUTE format(
              'SELECT to_jsonb(t.*), COALESCE(to_jsonb(t.*)->>''updated_at'', to_jsonb(t.*)->>''created_at'', md5(to_jsonb(t.*)::text)) FROM public.%I t WHERE id = $1',
              v_table)
              INTO v_before, v_current_version USING v_target;
            IF v_before IS NULL THEN RAISE EXCEPTION 'target not found: %', v_target; END IF;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              RAISE EXCEPTION 'stale: content changed since preview' USING ERRCODE = 'P0004';
            END IF;
            EXECUTE format(
              'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2 RETURNING to_jsonb(%I.*)',
              v_table, v_cols, v_cols, v_table, v_table)
              INTO v_after USING v_data, v_target;
            v_updated := v_updated + 1;
          ELSE
            RAISE EXCEPTION 'action % not supported for %', v_action, v_ctype;
          END IF;

        ELSE
          RAISE EXCEPTION 'content_type % not supported by transactional importer', v_ctype;
        END IF;

        v_this_result := jsonb_build_object(
          'index', (v_item->>'index')::int,
          'action', v_action,
          'target_record_id', v_target,
          'result', CASE v_action
            WHEN 'new' THEN 'inserted' WHEN 'update' THEN 'updated'
            WHEN 'alias' THEN 'aliased' ELSE 'skipped' END,
          'before_snapshot', v_before,
          'after_snapshot', v_after,
          'accepted_repairs', v_item->'accepted_repairs',
          'issues', v_item->'issues',
          'classification', v_item->>'classification',
          'incoming_id', v_item->>'incoming_id',
          'incoming_slug', v_item->>'incoming_slug'
        );
        v_item_results := v_item_results || v_this_result;

      EXCEPTION
        WHEN sqlstate 'P0004' THEN
          v_conflict := v_conflict + 1;
          v_failed := v_failed + 1;
          v_err := SQLERRM;
          IF v_first_err IS NULL THEN v_first_err := v_err; END IF;
          v_item_results := v_item_results || jsonb_build_object(
            'index', (v_item->>'index')::int, 'action', v_action,
            'result', 'stale_conflict', 'error', v_err,
            'accepted_repairs', v_item->'accepted_repairs',
            'issues', v_item->'issues',
            'classification', v_item->>'classification',
            'incoming_id', v_item->>'incoming_id',
            'incoming_slug', v_item->>'incoming_slug'
          );
        WHEN OTHERS THEN
          v_err := SQLERRM;
          v_failed := v_failed + 1;
          IF v_first_err IS NULL THEN v_first_err := v_err; END IF;
          v_item_results := v_item_results || jsonb_build_object(
            'index', (v_item->>'index')::int, 'action', v_action,
            'result', 'failed', 'error', v_err,
            'accepted_repairs', v_item->'accepted_repairs',
            'issues', v_item->'issues',
            'classification', v_item->>'classification',
            'incoming_id', v_item->>'incoming_id',
            'incoming_slug', v_item->>'incoming_slug'
          );
      END;
    END LOOP;

    IF v_failed > 0 OR v_conflict > 0 THEN
      RAISE EXCEPTION 'batch_failed: %', COALESCE(v_first_err, 'items failed')
        USING ERRCODE = 'P0003';
    END IF;

    IF p_mode = 'dry_run' THEN
      RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING ERRCODE = 'P0001';
    END IF;

  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      NULL;
    WHEN sqlstate 'P0003' THEN
      UPDATE public.admin_import_batches
         SET status='failed', error_summary=COALESCE(v_first_err,'batch failed'),
             completed_at=now(),
             create_count=0, update_count=0, alias_count=0, skip_count=v_skipped
       WHERE id = v_batch;
      INSERT INTO public.admin_audit_log(actor_id, action, detail)
      VALUES (v_uid, 'import.failed',
              jsonb_build_object('batch_id', v_batch, 'content_type', v_ctype,
                                 'error', COALESCE(v_first_err,'batch failed'),
                                 'failed', v_failed, 'conflicts', v_conflict));
      RETURN jsonb_build_object(
        'status','failed', 'batch_id',v_batch,
        'error',COALESCE(v_first_err,'batch failed'),
        'created', 0, 'updated', 0, 'aliased', 0, 'skipped', v_skipped,
        'failed', v_failed, 'conflicts', v_conflict,
        'items', v_item_results
      );
    WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE public.admin_import_batches
         SET status='failed', error_summary=v_err, completed_at=now()
       WHERE id = v_batch;
      INSERT INTO public.admin_audit_log(actor_id, action, detail)
      VALUES (v_uid, 'import.failed',
              jsonb_build_object('batch_id', v_batch, 'content_type', v_ctype, 'error', v_err));
      RETURN jsonb_build_object('status','failed','batch_id',v_batch,'error',v_err,
                                'created', 0, 'updated', 0, 'aliased', 0, 'skipped', 0,
                                'failed', GREATEST(v_failed,1), 'conflicts', v_conflict,
                                'items', v_item_results);
  END;

  INSERT INTO public.admin_import_items
    (batch_id, item_index, incoming_id, incoming_slug, content_type,
     classification, action, target_record_id, before_snapshot, after_snapshot,
     accepted_repairs, issues, result, error_message)
  SELECT
    v_batch, COALESCE((r->>'index')::int, 0),
    r->>'incoming_id', r->>'incoming_slug', v_ctype,
    r->>'classification', r->>'action',
    NULLIF(r->>'target_record_id','')::uuid,
    r->'before_snapshot', r->'after_snapshot',
    r->'accepted_repairs', r->'issues',
    COALESCE(r->>'result','planned'), r->>'error'
  FROM jsonb_array_elements(v_item_results) r;

  UPDATE public.admin_import_batches
     SET status = CASE WHEN p_mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
         completed_at = now(),
         create_count = v_created, update_count = v_updated,
         alias_count = v_aliased, skip_count = v_skipped
   WHERE id = v_batch;

  INSERT INTO public.admin_audit_log(actor_id, action, detail)
  VALUES (v_uid,
          CASE WHEN p_mode='dry_run' THEN 'import.dry_run' ELSE 'import.committed' END,
          jsonb_build_object('batch_id', v_batch, 'content_type', v_ctype,
                             'created', v_created, 'updated', v_updated,
                             'aliased', v_aliased, 'skipped', v_skipped));

  RETURN jsonb_build_object(
    'status', CASE WHEN p_mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
    'batch_id', v_batch,
    'created', v_created, 'updated', v_updated, 'aliased', v_aliased, 'skipped', v_skipped,
    'failed', 0, 'conflicts', 0,
    'items', v_item_results
  );
END;
$$;