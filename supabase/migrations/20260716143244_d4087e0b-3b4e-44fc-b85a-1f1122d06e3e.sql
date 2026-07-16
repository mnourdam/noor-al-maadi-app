
CREATE OR REPLACE FUNCTION public.admin_rollback_import_batch(p_batch UUID, p_force BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_item RECORD;
  v_ctype TEXT;
  v_table TEXT;
  v_current JSONB;
  v_rolled INT := 0;
  v_conflicts INT := 0;
  v_missing INT := 0;
  v_err TEXT;
  v_conflict_items JSONB := '[]'::jsonb;
  v_changed BOOLEAN;
  v_cur_hash TEXT;
  v_snap_hash TEXT;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'owner')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_batch FROM public.admin_import_batches WHERE id = p_batch;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF v_batch.status <> 'succeeded' THEN
    RAISE EXCEPTION 'only succeeded batches can be rolled back (status=%)', v_batch.status;
  END IF;
  v_ctype := v_batch.content_type;
  v_table := public.admin_import_content_table(v_ctype);
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'unknown content_type %', v_ctype;
  END IF;

  BEGIN
    FOR v_item IN
      SELECT * FROM public.admin_import_items
      WHERE batch_id = p_batch AND result IN ('inserted','updated','aliased')
      ORDER BY item_index DESC
    LOOP
      EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id = $1', v_table)
        INTO v_current USING v_item.target_record_id;

      IF v_current IS NULL THEN
        v_missing := v_missing + 1;
        UPDATE public.admin_import_items SET result='rollback_conflict', error_message='missing' WHERE id = v_item.id;
        v_conflict_items := v_conflict_items || jsonb_build_object('item_index', v_item.item_index, 'reason','missing');
        CONTINUE;
      END IF;

      IF v_item.after_snapshot IS NOT NULL AND NOT p_force THEN
        -- Primary: compare updated_at when present.
        IF (v_current ? 'updated_at') AND (v_item.after_snapshot ? 'updated_at') THEN
          v_changed := (v_current->>'updated_at') IS DISTINCT FROM (v_item.after_snapshot->>'updated_at');
        ELSE
          v_changed := false;
        END IF;
        -- Fallback: always cross-check the row content hash. This catches
        -- concurrent edits that landed in the same transaction as the
        -- original import (identical updated_at) or tables that share a
        -- transaction-time timestamp across statements.
        IF NOT v_changed THEN
          v_cur_hash  := md5(((v_current       - 'id') - 'updated_at')::text);
          v_snap_hash := md5(((v_item.after_snapshot - 'id') - 'updated_at')::text);
          v_changed   := v_cur_hash <> v_snap_hash;
        END IF;
        IF v_changed THEN
          v_conflicts := v_conflicts + 1;
          v_conflict_items := v_conflict_items || jsonb_build_object(
            'item_index', v_item.item_index,
            'target_id', v_item.target_record_id,
            'reason','changed_after_import');
          CONTINUE;
        END IF;
      END IF;

      IF v_item.result = 'inserted' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING v_item.target_record_id;
      ELSE
        IF v_item.before_snapshot IS NULL THEN
          UPDATE public.admin_import_items SET result='rollback_conflict', error_message='no_snapshot' WHERE id = v_item.id;
          v_conflict_items := v_conflict_items || jsonb_build_object('item_index',v_item.item_index,'reason','no_snapshot');
          CONTINUE;
        END IF;
        EXECUTE format(
          'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2',
          v_table,
          (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_item.before_snapshot - 'id') k),
          (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_item.before_snapshot - 'id') k),
          v_table)
        USING v_item.before_snapshot, v_item.target_record_id;
      END IF;
      UPDATE public.admin_import_items SET result='rolled_back' WHERE id = v_item.id;
      v_rolled := v_rolled + 1;
    END LOOP;

    IF v_conflicts > 0 AND NOT p_force THEN
      RAISE EXCEPTION 'rollback_conflicts' USING ERRCODE = 'P0002';
    END IF;

  EXCEPTION
    WHEN sqlstate 'P0002' THEN
      RETURN jsonb_build_object('status','conflict','batch_id',p_batch,
                                'conflicts',v_conflicts,'items',v_conflict_items);
    WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE public.admin_import_batches SET status='rollback_failed', error_summary=v_err WHERE id = p_batch;
      INSERT INTO public.admin_audit_log(actor_id, action, detail)
      VALUES (v_uid, 'import.rollback_failed',
              jsonb_build_object('batch_id', p_batch, 'error', v_err));
      RAISE;
  END;

  UPDATE public.admin_import_batches SET status='rolled_back', completed_at=now() WHERE id = p_batch;
  INSERT INTO public.admin_audit_log(actor_id, action, detail)
  VALUES (v_uid, 'import.rolled_back',
          jsonb_build_object('batch_id', p_batch, 'rolled', v_rolled, 'conflicts', v_conflicts, 'missing', v_missing));
  RETURN jsonb_build_object('status','rolled_back','batch_id',p_batch,'rolled',v_rolled,
                            'conflicts',v_conflicts,'missing',v_missing);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_rollback_import_batch(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rollback_import_batch(UUID, BOOLEAN) TO authenticated;
