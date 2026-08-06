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
  v_read_back_val TEXT;
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
              (slug, title, subtitle, description, difficulty, reward, steps, related_entities, enabled, world_slug)
            VALUES
              (v_data->>'slug', v_data->>'title',
               NULLIF(v_data->>'subtitle',''), NULLIF(v_data->>'description',''),
               COALESCE(v_data->>'difficulty','easy'),
               COALESCE(v_data->'reward','{}'::jsonb),
               COALESCE(v_data->'steps','[]'::jsonb),
               COALESCE(v_data->'related_entities','[]'::jsonb),
               COALESCE((v_data->>'enabled')::boolean, true),
               v_data->>'world_slug')
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
              enabled = COALESCE((v_data->>'enabled')::boolean, enabled),
              world_slug = COALESCE(v_data->>'world_slug', world_slug)
            WHERE id = v_target
            RETURNING to_jsonb(investigations.*) INTO v_after;
            v_updated := v_updated + 1;
            
            -- Read-back verification for world_slug
            IF v_data ? 'world_slug' AND v_data->>'world_slug' IS NOT NULL THEN
              SELECT world_slug INTO v_read_back_val FROM public.investigations WHERE id = v_target;
              IF v_read_back_val IS DISTINCT FROM v_data->>'world_slug' THEN
                RAISE EXCEPTION 'read-back mismatch for world_slug: expected %, got %', v_data->>'world_slug', v_read_back_val;
              END IF;
            END IF;
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
          'incoming_slug', v_item->>'incoming_slug',
          'received_world_slug', v_data->>'world_slug',
          'stored_world_slug', v_after->>'world_slug'
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