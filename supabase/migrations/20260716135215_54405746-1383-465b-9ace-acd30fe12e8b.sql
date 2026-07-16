-- Phase 5 — Transactional Import System
-- New admin tables to record every dry-run and commit, plus the server-side
-- RPCs that authorize the caller, run the whole batch inside one transaction
-- (with a savepoint so dry-runs still hit real DB constraints), and support
-- evidence-based rollback.

-- ============================================================
-- 1) Import batch + item tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL,
  file_name TEXT,
  original_payload_hash TEXT,
  approved_plan_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run','commit')),
  status TEXT NOT NULL DEFAULT 'validating'
    CHECK (status IN ('validating','ready','committing','succeeded','failed','rolled_back','rollback_failed')),
  item_count INT NOT NULL DEFAULT 0,
  create_count INT NOT NULL DEFAULT 0,
  update_count INT NOT NULL DEFAULT 0,
  skip_count INT NOT NULL DEFAULT 0,
  alias_count INT NOT NULL DEFAULT 0,
  draft_count INT NOT NULL DEFAULT 0,
  blocker_count INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  relation_remap_count INT NOT NULL DEFAULT 0,
  quality_average NUMERIC,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_import_batches TO authenticated;
GRANT ALL ON public.admin_import_batches TO service_role;
ALTER TABLE public.admin_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read batches" ON public.admin_import_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "admins insert batches" ON public.admin_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "admins update batches" ON public.admin_import_batches
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE INDEX IF NOT EXISTS idx_batches_admin_started ON public.admin_import_batches(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_type_status ON public.admin_import_batches(content_type, status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_committed_hash
  ON public.admin_import_batches(approved_plan_hash)
  WHERE status = 'succeeded' AND mode = 'commit';


CREATE TABLE IF NOT EXISTS public.admin_import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.admin_import_batches(id) ON DELETE CASCADE,
  item_index INT NOT NULL,
  incoming_id TEXT,
  incoming_slug TEXT,
  content_type TEXT NOT NULL,
  classification TEXT,
  action TEXT NOT NULL CHECK (action IN ('new','update','skip','alias')),
  target_record_id UUID,
  before_snapshot JSONB,
  after_snapshot JSONB,
  accepted_repairs JSONB,
  issues JSONB,
  result TEXT NOT NULL DEFAULT 'planned'
    CHECK (result IN ('planned','inserted','updated','aliased','skipped','failed','rolled_back','rollback_conflict','rollback_failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_import_items TO authenticated;
GRANT ALL ON public.admin_import_items TO service_role;
ALTER TABLE public.admin_import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read items" ON public.admin_import_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "admins write items" ON public.admin_import_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "admins update items" ON public.admin_import_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE INDEX IF NOT EXISTS idx_items_batch ON public.admin_import_items(batch_id, item_index);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_batches_updated_at ON public.admin_import_batches;
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON public.admin_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2) Server-side transactional import RPC
--
-- The caller submits an approved plan:
--   { content_type, file_name, original_payload_hash, approved_plan_hash,
--     overwrite, publish,
--     items: [ { index, action, data, target_key, version_signal,
--                accepted_repairs, classification, issues, incoming_id,
--                incoming_slug } ] }
-- Mode is 'dry_run' or 'commit'.
--
-- Content types supported for full transactional writes:
--   encyclopedia, daily_facts, today_in_history_events,
--   notifications, investigations.
-- Campaigns retain their existing multi-step import path for now
-- (documented limitation) and go through the same envelope but
-- return status='unsupported_transactional'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_run_import_batch(plan JSONB, mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ctype TEXT := plan->>'content_type';
  v_plan_hash TEXT := plan->>'approved_plan_hash';
  v_payload_hash TEXT := plan->>'original_payload_hash';
  v_file TEXT := plan->>'file_name';
  v_items JSONB := COALESCE(plan->'items','[]'::jsonb);
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
  v_created INT := 0;
  v_updated INT := 0;
  v_aliased INT := 0;
  v_skipped INT := 0;
  v_failed INT := 0;
  v_conflict INT := 0;
  v_item_results JSONB := '[]'::jsonb;
  v_this_result JSONB;
  v_err TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'owner')) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  IF mode NOT IN ('dry_run','commit') THEN
    RAISE EXCEPTION 'invalid mode';
  END IF;
  IF v_plan_hash IS NULL OR length(v_plan_hash) < 8 THEN
    RAISE EXCEPTION 'missing approved_plan_hash';
  END IF;
  IF v_ctype IS NULL THEN RAISE EXCEPTION 'missing content_type'; END IF;

  -- Idempotency guard for commits.
  IF mode = 'commit' THEN
    SELECT id INTO v_existing_batch
      FROM public.admin_import_batches
     WHERE approved_plan_hash = v_plan_hash AND status = 'succeeded' AND mode = 'commit'
     LIMIT 1;
    IF v_existing_batch IS NOT NULL THEN
      RETURN jsonb_build_object('status','already_committed','batch_id', v_existing_batch);
    END IF;
  END IF;

  INSERT INTO public.admin_import_batches
    (admin_user_id, content_type, file_name, original_payload_hash, approved_plan_hash, mode, status, item_count, metadata)
  VALUES
    (v_uid, v_ctype, v_file, v_payload_hash, v_plan_hash, mode,
     CASE WHEN mode='commit' THEN 'committing' ELSE 'validating' END,
     jsonb_array_length(v_items),
     COALESCE(plan->'metadata','{}'::jsonb))
  RETURNING id INTO v_batch;

  -- Nested subtransaction so dry_run can roll back all content writes but
  -- keep the batch row + accumulator (v_item_results) intact.
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
            SELECT id, to_jsonb(t.*), updated_at::text
              INTO v_target, v_before, v_current_version
              FROM public.encyclopedia_entities t
             WHERE entity_type = v_etype AND slug = v_slug
             LIMIT 1;
            IF v_target IS NULL THEN
              RAISE EXCEPTION 'target not found: %/%', v_etype, v_slug;
            END IF;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              v_conflict := v_conflict + 1;
              RAISE EXCEPTION 'stale: content changed since preview';
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

        ELSIF v_ctype IN ('daily_facts','today_in_history_events','notifications','investigations') THEN
          -- Simple types: match by (item_index) target_key {id?} or slug/title.
          IF v_action = 'new' THEN
            EXECUTE format(
              'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING id, to_jsonb(%I.*)',
              v_ctype, v_ctype, v_ctype)
              INTO v_new_id, v_after
              USING v_data;
            v_target := v_new_id; v_created := v_created + 1;

          ELSIF v_action = 'update' THEN
            v_target := NULLIF(v_target_key->>'id','')::uuid;
            IF v_target IS NULL THEN
              RAISE EXCEPTION 'update requires target_key.id for %', v_ctype;
            END IF;
            EXECUTE format('SELECT to_jsonb(t.*), updated_at::text FROM public.%I t WHERE id = $1', v_ctype)
              INTO v_before, v_current_version USING v_target;
            IF v_before IS NULL THEN RAISE EXCEPTION 'target not found: %', v_target; END IF;
            IF v_version_signal IS NOT NULL AND v_version_signal <> v_current_version THEN
              v_conflict := v_conflict + 1;
              RAISE EXCEPTION 'stale: content changed since preview';
            END IF;
            EXECUTE format(
              'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2 RETURNING to_jsonb(%I.*)',
              v_ctype,
              (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_data - 'id') k),
              (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_data - 'id') k),
              v_ctype, v_ctype)
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

      EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        v_failed := v_failed + 1;
        v_item_results := v_item_results || jsonb_build_object(
          'index', (v_item->>'index')::int,
          'action', v_action,
          'result', 'failed',
          'error', v_err,
          'accepted_repairs', v_item->'accepted_repairs',
          'issues', v_item->'issues',
          'classification', v_item->>'classification',
          'incoming_id', v_item->>'incoming_id',
          'incoming_slug', v_item->>'incoming_slug'
        );
        -- Re-raise so the outer subtxn rolls back the whole batch on commit.
        RAISE;
      END;
    END LOOP;

    IF mode = 'dry_run' THEN
      -- Force rollback of ALL content writes but keep v_item_results in memory.
      RAISE EXCEPTION 'DRY_RUN_ROLLBACK' USING ERRCODE = 'P0001';
    END IF;

  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      -- Expected: dry-run rollback. Fall through, batch row survives.
      NULL;
    WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE public.admin_import_batches
         SET status='failed', error_summary=v_err, completed_at=now()
       WHERE id = v_batch;
      -- Log audit
      INSERT INTO public.admin_audit_log(actor_user_id, action, target_type, target_id, metadata)
      VALUES (v_uid, 'import.failed', 'admin_import_batches', v_batch,
              jsonb_build_object('content_type', v_ctype, 'error', v_err));
      RETURN jsonb_build_object('status','failed','batch_id',v_batch,'error',v_err,
                                'items', v_item_results);
  END;

  -- Persist per-item audit rows (after subtxn commit or dry-run rollback).
  INSERT INTO public.admin_import_items
    (batch_id, item_index, incoming_id, incoming_slug, content_type,
     classification, action, target_record_id, before_snapshot, after_snapshot,
     accepted_repairs, issues, result, error_message)
  SELECT
    v_batch,
    COALESCE((r->>'index')::int, 0),
    r->>'incoming_id',
    r->>'incoming_slug',
    v_ctype,
    r->>'classification',
    r->>'action',
    NULLIF(r->>'target_record_id','')::uuid,
    r->'before_snapshot',
    r->'after_snapshot',
    r->'accepted_repairs',
    r->'issues',
    COALESCE(r->>'result','planned'),
    r->>'error'
  FROM jsonb_array_elements(v_item_results) r;

  UPDATE public.admin_import_batches
     SET status = CASE WHEN mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
         completed_at = now(),
         create_count = v_created,
         update_count = v_updated,
         alias_count = v_aliased,
         skip_count = v_skipped
   WHERE id = v_batch;

  INSERT INTO public.admin_audit_log(actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_uid,
          CASE WHEN mode='dry_run' THEN 'import.dry_run' ELSE 'import.committed' END,
          'admin_import_batches', v_batch,
          jsonb_build_object('content_type', v_ctype,
                             'created', v_created, 'updated', v_updated,
                             'aliased', v_aliased, 'skipped', v_skipped));

  RETURN jsonb_build_object(
    'status', CASE WHEN mode='dry_run' THEN 'ready' ELSE 'succeeded' END,
    'batch_id', v_batch,
    'created', v_created,
    'updated', v_updated,
    'aliased', v_aliased,
    'skipped', v_skipped,
    'failed', v_failed,
    'conflicts', v_conflict,
    'items', v_item_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_run_import_batch(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_run_import_batch(JSONB, TEXT) TO authenticated;


-- ============================================================
-- 3) Rollback RPC — evidence-based
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_rollback_import_batch(p_batch UUID, p_force BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_item RECORD;
  v_ctype TEXT;
  v_current JSONB;
  v_rolled INT := 0;
  v_conflicts INT := 0;
  v_already INT := 0;
  v_missing INT := 0;
  v_err TEXT;
  v_conflict_items JSONB := '[]'::jsonb;
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

  BEGIN
    FOR v_item IN
      SELECT * FROM public.admin_import_items
      WHERE batch_id = p_batch AND result IN ('inserted','updated','aliased')
      ORDER BY item_index DESC
    LOOP
      -- Fetch current record via dynamic SQL.
      EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id = $1', v_ctype)
        INTO v_current USING v_item.target_record_id;

      IF v_current IS NULL THEN
        v_missing := v_missing + 1;
        UPDATE public.admin_import_items SET result='rollback_conflict', error_message='missing' WHERE id = v_item.id;
        v_conflict_items := v_conflict_items || jsonb_build_object('item_index', v_item.item_index, 'reason','missing');
        CONTINUE;
      END IF;

      -- Was the row changed after import? Compare with our after_snapshot.
      IF v_item.after_snapshot IS NOT NULL AND NOT p_force
         AND (v_current->>'updated_at') IS DISTINCT FROM (v_item.after_snapshot->>'updated_at') THEN
        v_conflicts := v_conflicts + 1;
        v_conflict_items := v_conflict_items || jsonb_build_object(
          'item_index', v_item.item_index,
          'target_id', v_item.target_record_id,
          'reason','changed_after_import');
        CONTINUE;
      END IF;

      IF v_item.result = 'inserted' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_ctype) USING v_item.target_record_id;
      ELSE
        -- Restore from before_snapshot (updates + aliases).
        IF v_item.before_snapshot IS NULL THEN
          UPDATE public.admin_import_items SET result='rollback_conflict', error_message='no_snapshot' WHERE id = v_item.id;
          v_conflict_items := v_conflict_items || jsonb_build_object('item_index',v_item.item_index,'reason','no_snapshot');
          CONTINUE;
        END IF;
        EXECUTE format(
          'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2',
          v_ctype,
          (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_item.before_snapshot - 'id') k),
          (SELECT string_agg(quote_ident(k),',') FROM jsonb_object_keys(v_item.before_snapshot - 'id') k),
          v_ctype)
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
      INSERT INTO public.admin_audit_log(actor_user_id, action, target_type, target_id, metadata)
      VALUES (v_uid, 'import.rollback_failed', 'admin_import_batches', p_batch,
              jsonb_build_object('error', v_err));
      RAISE;
  END;

  UPDATE public.admin_import_batches SET status='rolled_back', completed_at=now() WHERE id = p_batch;
  INSERT INTO public.admin_audit_log(actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_uid, 'import.rolled_back', 'admin_import_batches', p_batch,
          jsonb_build_object('rolled', v_rolled, 'conflicts', v_conflicts, 'missing', v_missing));
  RETURN jsonb_build_object('status','rolled_back','batch_id',p_batch,'rolled',v_rolled,
                            'conflicts',v_conflicts,'missing',v_missing);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rollback_import_batch(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rollback_import_batch(UUID, BOOLEAN) TO authenticated;