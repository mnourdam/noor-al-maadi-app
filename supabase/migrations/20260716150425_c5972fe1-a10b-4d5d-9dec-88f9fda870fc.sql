
-- Rewrite the two RPCs to use the actual admin_audit_log columns:
-- (actor_id, action, detail) — no separate target_type/target_id/metadata.

CREATE OR REPLACE FUNCTION public.admin_run_campaign_batch(plan JSONB, p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_plan_hash TEXT := plan->>'approved_plan_hash';
  v_payload_hash TEXT := plan->>'original_payload_hash';
  v_file TEXT := plan->>'file_name';
  v_publish BOOLEAN := COALESCE((plan->>'publish')::boolean, false);
  v_allow_removals BOOLEAN := COALESCE((plan->'metadata'->>'allow_removals')::boolean, false);
  v_items JSONB := COALESCE(plan->'items','[]'::jsonb);
  v_batch UUID;
  v_existing_batch UUID;
  v_item JSONB;
  v_action TEXT;
  v_data JSONB;
  v_target_key JSONB;
  v_version_signal TEXT;
  v_campaign_id TEXT;
  v_existing RECORD;
  v_existing_data JSONB;
  v_merged JSONB;
  v_validation JSONB;
  v_progress_impact JSONB;
  v_before JSONB; v_after JSONB;
  v_created INT := 0; v_updated INT := 0; v_skipped INT := 0; v_failed INT := 0;
  v_item_results JSONB := '[]'::jsonb;
  v_this_result JSONB;
  v_err TEXT;
  v_first_err TEXT := NULL;
  v_current_version TEXT;
  v_new_version INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'owner')) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('dry_run','commit') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  IF v_plan_hash IS NULL OR length(v_plan_hash) < 8 THEN RAISE EXCEPTION 'missing approved_plan_hash'; END IF;

  IF p_mode = 'commit' THEN
    SELECT b.id INTO v_existing_batch FROM public.admin_import_batches b
     WHERE b.approved_plan_hash = v_plan_hash AND b.status='succeeded' AND b.mode='commit' LIMIT 1;
    IF v_existing_batch IS NOT NULL THEN
      RETURN jsonb_build_object('status','already_committed','batch_id',v_existing_batch);
    END IF;
  END IF;

  INSERT INTO public.admin_import_batches
    (admin_user_id, content_type, file_name, original_payload_hash, approved_plan_hash, mode, status, item_count, metadata)
  VALUES
    (v_uid,'campaigns',v_file,v_payload_hash,v_plan_hash,p_mode,
     CASE WHEN p_mode='commit' THEN 'committing' ELSE 'validating' END,
     jsonb_array_length(v_items),
     COALESCE(plan->'metadata','{}'::jsonb))
  RETURNING id INTO v_batch;

  BEGIN
    FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
      v_action := v_item->>'action';
      v_data := COALESCE(v_item->'data','{}'::jsonb);
      v_target_key := COALESCE(v_item->'target_key','{}'::jsonb);
      v_version_signal := v_item->>'version_signal';
      v_campaign_id := COALESCE(NULLIF(v_target_key->>'id',''), v_data->>'id');
      v_before := NULL; v_after := NULL; v_err := NULL; v_progress_impact := NULL;

      BEGIN
        IF v_action = 'skip' THEN
          v_skipped := v_skipped + 1;
        ELSE
          IF v_campaign_id IS NULL OR v_campaign_id = '' THEN
            RAISE EXCEPTION 'campaign_id missing';
          END IF;
          SELECT * INTO v_existing FROM public.admin_campaigns WHERE id = v_campaign_id;
          v_existing_data := CASE WHEN v_existing.id IS NULL THEN NULL ELSE v_existing.data END;

          IF v_action = 'update' THEN
            IF v_existing.id IS NULL THEN RAISE EXCEPTION 'target campaign not found: %', v_campaign_id; END IF;
            v_current_version := v_existing.updated_at::text;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              RAISE EXCEPTION 'stale campaign changed since preview';
            END IF;
            v_before := to_jsonb(v_existing);
          END IF;

          v_merged := public.admin_merge_campaign_stable_ids(v_existing_data, v_data);
          v_validation := public.admin_validate_campaign_payload(v_merged);
          IF NOT (v_validation->>'ok')::boolean THEN
            RAISE EXCEPTION 'campaign validation failed';
          END IF;

          IF v_action = 'update' THEN
            v_progress_impact := public.admin_campaign_progress_impact(v_campaign_id, v_merged);
            IF jsonb_array_length(v_progress_impact->'removed_chapters_with_progress') > 0
               AND NOT v_allow_removals THEN
              RAISE EXCEPTION 'removal blocked chapters with player progress would be lost';
            END IF;
          END IF;

          IF v_action = 'new' THEN
            IF v_publish THEN
              INSERT INTO public.admin_campaigns(id,slug,title,status,data,draft_data,content_version,has_unpublished_changes,published_at,updated_by)
              VALUES (v_campaign_id, v_merged->>'slug', v_merged->>'title','published',v_merged,NULL,1,false,now(),v_uid);
              INSERT INTO public.admin_campaign_versions(campaign_id,version,title,slug,status,data,editor_id,note)
              VALUES (v_campaign_id,1,v_merged->>'title',v_merged->>'slug','published',v_merged,v_uid,'import.publish');
            ELSE
              INSERT INTO public.admin_campaigns(id,slug,title,status,data,draft_data,content_version,has_unpublished_changes,updated_by)
              VALUES (v_campaign_id, v_merged->>'slug', v_merged->>'title','draft','{}'::jsonb,v_merged,0,true,v_uid);
            END IF;
            SELECT to_jsonb(c) INTO v_after FROM public.admin_campaigns c WHERE id=v_campaign_id;
            v_created := v_created + 1;
          ELSIF v_action = 'update' THEN
            IF v_publish THEN
              v_new_version := COALESCE(v_existing.content_version,0) + 1;
              UPDATE public.admin_campaigns SET
                title=v_merged->>'title', slug=v_merged->>'slug',
                data=v_merged, draft_data=NULL, status='published',
                content_version=v_new_version, has_unpublished_changes=false,
                published_at=now(), updated_at=now(), updated_by=v_uid
              WHERE id=v_campaign_id;
              INSERT INTO public.admin_campaign_versions(campaign_id,version,title,slug,status,data,editor_id,note)
              VALUES (v_campaign_id,v_new_version,v_merged->>'title',v_merged->>'slug','published',v_merged,v_uid,'import.publish');
            ELSE
              UPDATE public.admin_campaigns SET
                draft_data=v_merged, has_unpublished_changes=true,
                updated_at=now(), updated_by=v_uid
              WHERE id=v_campaign_id;
            END IF;
            SELECT to_jsonb(c) INTO v_after FROM public.admin_campaigns c WHERE id=v_campaign_id;
            v_updated := v_updated + 1;
          ELSE
            RAISE EXCEPTION 'action not supported for campaigns';
          END IF;
        END IF;

        v_this_result := jsonb_build_object(
          'index',(v_item->>'index')::int,'action',v_action,'campaign_id',v_campaign_id,
          'result', CASE v_action WHEN 'new' THEN 'inserted' WHEN 'update' THEN 'updated' ELSE 'skipped' END,
          'before_snapshot',v_before,'after_snapshot',v_after,
          'validation',v_validation,'progress_impact',v_progress_impact,
          'issues',v_item->'issues','classification',v_item->>'classification','incoming_id',v_campaign_id);
        v_item_results := v_item_results || v_this_result;
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM; v_failed := v_failed + 1;
        IF v_first_err IS NULL THEN v_first_err := v_err; END IF;
        v_item_results := v_item_results || jsonb_build_object(
          'index',(v_item->>'index')::int,'action',v_action,'campaign_id',v_campaign_id,
          'result','failed','error',v_err);
        RAISE;
      END;
    END LOOP;

    IF p_mode='dry_run' THEN RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING ERRCODE='P0001'; END IF;

  EXCEPTION
    WHEN sqlstate 'P0001' THEN NULL;
    WHEN OTHERS THEN
      v_err := SQLERRM;
      INSERT INTO public.admin_import_items
        (batch_id,item_index,incoming_id,content_type,action,result,error_message,issues)
      SELECT v_batch, COALESCE((r->>'index')::int,0), r->>'campaign_id','campaigns',
             COALESCE(r->>'action','unknown'), COALESCE(r->>'result','failed'),
             r->>'error', r->'issues'
      FROM jsonb_array_elements(v_item_results) r;
      UPDATE public.admin_import_batches SET status='failed',
             error_summary=COALESCE(v_first_err,v_err), completed_at=now()
       WHERE id=v_batch;
      INSERT INTO public.admin_audit_log(actor_id, action, detail)
      VALUES (v_uid,'import.failed',
              jsonb_build_object('content_type','campaigns','batch_id',v_batch,'error',COALESCE(v_first_err,v_err)));
      RETURN jsonb_build_object('status','failed','batch_id',v_batch,
                                'error',COALESCE(v_first_err,v_err),
                                'created',0,'updated',0,'skipped',0,'failed',v_failed,
                                'items',v_item_results);
  END;

  INSERT INTO public.admin_import_items
    (batch_id,item_index,incoming_id,content_type,action,before_snapshot,after_snapshot,result,issues)
  SELECT v_batch, COALESCE((r->>'index')::int,0), r->>'campaign_id','campaigns',
         r->>'action', r->'before_snapshot', r->'after_snapshot',
         COALESCE(r->>'result','planned'), r->'issues'
  FROM jsonb_array_elements(v_item_results) r;

  UPDATE public.admin_import_batches
     SET status = CASE WHEN p_mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
         completed_at = now(),
         create_count = v_created, update_count = v_updated, skip_count = v_skipped
   WHERE id = v_batch;

  INSERT INTO public.admin_audit_log(actor_id, action, detail)
  VALUES (v_uid,
          CASE WHEN p_mode='dry_run' THEN 'import.dry_run' ELSE 'import.committed' END,
          jsonb_build_object('content_type','campaigns','batch_id',v_batch,
                             'created',v_created,'updated',v_updated,'skipped',v_skipped));

  RETURN jsonb_build_object(
    'status', CASE WHEN p_mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
    'batch_id', v_batch,
    'created',v_created,'updated',v_updated,'skipped',v_skipped,'failed',0,
    'items',v_item_results);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_rollback_campaign_batch(p_batch UUID, p_force BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_item RECORD;
  v_current JSONB;
  v_cid TEXT;
  v_rolled INT := 0;
  v_conflicts INT := 0;
  v_missing INT := 0;
  v_cur_hash TEXT; v_snap_hash TEXT;
  v_changed BOOLEAN;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'owner')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_batch FROM public.admin_import_batches WHERE id = p_batch;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF v_batch.content_type <> 'campaigns' THEN
    RAISE EXCEPTION 'not a campaign batch';
  END IF;
  IF v_batch.status <> 'succeeded' THEN
    RAISE EXCEPTION 'only succeeded batches can be rolled back';
  END IF;

  BEGIN
    FOR v_item IN
      SELECT * FROM public.admin_import_items
       WHERE batch_id = p_batch AND result IN ('inserted','updated')
       ORDER BY item_index DESC
    LOOP
      v_cid := COALESCE(v_item.after_snapshot->>'id', v_item.before_snapshot->>'id', v_item.incoming_id);
      IF v_cid IS NULL THEN v_missing := v_missing+1; CONTINUE; END IF;
      SELECT to_jsonb(c) INTO v_current FROM public.admin_campaigns c WHERE id = v_cid;
      IF v_current IS NULL THEN
        v_missing := v_missing+1;
        UPDATE public.admin_import_items SET result='rollback_conflict', error_message='missing' WHERE id=v_item.id;
        CONTINUE;
      END IF;
      IF v_item.after_snapshot IS NOT NULL AND NOT p_force THEN
        v_cur_hash  := md5(((v_current              - 'updated_at') - 'id')::text);
        v_snap_hash := md5(((v_item.after_snapshot  - 'updated_at') - 'id')::text);
        v_changed := v_cur_hash <> v_snap_hash;
        IF v_changed THEN
          v_conflicts := v_conflicts + 1;
          UPDATE public.admin_import_items SET result='rollback_conflict', error_message='changed_after_import' WHERE id=v_item.id;
          CONTINUE;
        END IF;
      END IF;
      IF v_item.result = 'inserted' THEN
        DELETE FROM public.admin_campaign_versions WHERE campaign_id = v_cid;
        DELETE FROM public.admin_campaigns WHERE id = v_cid;
      ELSE
        UPDATE public.admin_campaigns SET
          slug = v_item.before_snapshot->>'slug',
          title = v_item.before_snapshot->>'title',
          status = v_item.before_snapshot->>'status',
          data = COALESCE(v_item.before_snapshot->'data','{}'::jsonb),
          draft_data = v_item.before_snapshot->'draft_data',
          content_version = COALESCE((v_item.before_snapshot->>'content_version')::int, 0),
          has_unpublished_changes = COALESCE((v_item.before_snapshot->>'has_unpublished_changes')::boolean,false),
          published_at = NULLIF(v_item.before_snapshot->>'published_at','')::timestamptz,
          updated_at = now(),
          updated_by = v_uid
        WHERE id = v_cid;
      END IF;
      UPDATE public.admin_import_items SET result='rolled_back' WHERE id=v_item.id;
      v_rolled := v_rolled + 1;
    END LOOP;

    IF v_conflicts > 0 AND NOT p_force THEN
      RAISE EXCEPTION 'rollback conflict changed after import';
    END IF;

    UPDATE public.admin_import_batches SET status='rolled_back', completed_at=now(),
       error_summary = CASE WHEN v_conflicts>0 THEN 'partial: '||v_conflicts||' conflicts' ELSE NULL END
     WHERE id = p_batch;

    INSERT INTO public.admin_audit_log(actor_id, action, detail)
    VALUES (v_uid,'import.rolled_back',
            jsonb_build_object('content_type','campaigns','batch_id',p_batch,
                               'rolled',v_rolled,'conflicts',v_conflicts,'missing',v_missing));
    RETURN jsonb_build_object('status','rolled_back','rolled',v_rolled,'conflicts',v_conflicts,'missing',v_missing);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.admin_import_batches SET status='rollback_failed', error_summary=SQLERRM WHERE id=p_batch;
    RETURN jsonb_build_object('status','rollback_failed','error',SQLERRM,'conflicts',v_conflicts);
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_run_campaign_batch(JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_run_campaign_batch(JSONB,TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_rollback_campaign_batch(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rollback_campaign_batch(UUID,BOOLEAN) TO authenticated;
