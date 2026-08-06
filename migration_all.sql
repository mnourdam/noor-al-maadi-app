CREATE OR REPLACE FUNCTION public.admin_import_investigations_v2(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode            text := lower(COALESCE(p_options->>'mode', 'dry_run'));
  v_allow_removals  boolean := COALESCE((p_options->>'allow_removals')::boolean, false);
  v_items           jsonb;
  v_item            jsonb;
  v_before          jsonb;
  v_merged          jsonb;
  v_target          uuid;
  v_incoming_id     uuid;
  v_slug            text;
  v_match_by        text;
  v_updated_fields  jsonb;
  v_warnings        jsonb;
  v_errors          jsonb;
  v_added           jsonb;
  v_removed         jsonb;
  v_results         jsonb := '[]'::jsonb;
  v_action          text;
  v_created         int := 0;
  v_updated_cnt     int := 0;
  v_blocked         int := 0;
  v_noop            int := 0;
  v_steps           jsonb;
  v_before_steps    jsonb;
  v_step            jsonb;
  v_step_id         text;
  v_prev_step       jsonb;
  v_seen_ids        text[];
  v_removed_steps   text[];
  v_added_steps     text[];
  v_before_rel      text[];
  v_after_rel       text[];
  v_added_rel       text[];
  v_removed_rel     text[];
  v_col             text;
  v_new_id          uuid;
  v_msg             text;
  v_dirty           boolean;
BEGIN
  IF NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden: content editor role required' USING ERRCODE = '42501';
  END IF;
  IF v_mode NOT IN ('dry_run', 'commit') THEN
    RAISE EXCEPTION 'invalid mode: %', v_mode;
  END IF;

  IF jsonb_typeof(p_payload) = 'array' THEN
    v_items := p_payload;
  ELSIF p_payload ? 'investigations' AND jsonb_typeof(p_payload->'investigations') = 'array' THEN
    v_items := p_payload->'investigations';
  ELSIF p_payload ? 'investigation' THEN
    v_items := jsonb_build_array(p_payload->'investigation');
  ELSIF jsonb_typeof(p_payload) = 'object' THEN
    v_items := jsonb_build_array(p_payload);
  ELSE
    RAISE EXCEPTION 'unsupported payload shape';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'payload contains no investigations';
  END IF;
  IF jsonb_array_length(v_items) > 500 THEN
    RAISE EXCEPTION 'payload too large (max 500 investigations)';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
    v_before := NULL; v_target := NULL; v_match_by := NULL;
    v_updated_fields := '[]'::jsonb;
    v_warnings := '[]'::jsonb;
    v_errors := '[]'::jsonb;
    v_added := '{}'::jsonb;
    v_removed := '{}'::jsonb;
    v_added_steps := ARRAY[]::text[];
    v_removed_steps := ARRAY[]::text[];
    v_added_rel := ARRAY[]::text[];
    v_removed_rel := ARRAY[]::text[];

    IF jsonb_typeof(v_item) <> 'object' THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'action','blocked','slug',NULL,'id',NULL,'title',NULL,
        'errors', jsonb_build_array('item is not an object')));
      v_blocked := v_blocked + 1;
      CONTINUE;
    END IF;

    v_incoming_id := NULL;
    BEGIN
      v_incoming_id := NULLIF(v_item->>'id','')::uuid;
    EXCEPTION WHEN others THEN
      v_incoming_id := NULL;
      v_warnings := v_warnings || jsonb_build_array('المعرّف (id) في الملف غير صالح — تم تجاهله.');
    END;
    v_slug := NULLIF(v_item->>'slug','');

    IF v_incoming_id IS NOT NULL THEN
      SELECT to_jsonb(t.*) INTO v_before FROM public.investigations t WHERE t.id = v_incoming_id;
      IF v_before IS NOT NULL THEN v_match_by := 'id'; v_target := v_incoming_id; END IF;
    END IF;
    IF v_before IS NULL AND v_slug IS NOT NULL THEN
      SELECT to_jsonb(t.*) INTO v_before FROM public.investigations t WHERE t.slug = v_slug;
      IF v_before IS NOT NULL THEN
        v_match_by := 'slug';
        v_target := (v_before->>'id')::uuid;
        IF v_incoming_id IS NOT NULL THEN
          v_warnings := v_warnings || jsonb_build_array(
            'المعرّف في الملف غير موجود؛ تمت المطابقة بالـslug مع التحقيق القائم ' || v_target::text || '.');
        END IF;
      END IF;
    END IF;

    v_action := CASE WHEN v_before IS NULL THEN 'create' ELSE 'update' END;

    IF v_before IS NULL THEN
      v_merged := jsonb_build_object(
        'slug', v_slug,
        'title', v_item->>'title',
        'subtitle', v_item->>'subtitle',
        'description', v_item->>'description',
        'difficulty', COALESCE(v_item->>'difficulty','easy'),
        'reward', COALESCE(v_item->'reward','{}'::jsonb),
        'steps', COALESCE(v_item->'steps','[]'::jsonb),
        'related_entities', COALESCE(v_item->'related_entities','[]'::jsonb),
        'enabled', COALESCE((v_item->>'enabled')::boolean, true),
        'world_slug', v_item->>'world_slug'
      );
      IF v_slug IS NULL OR v_item->>'title' IS NULL THEN
        v_errors := v_errors || jsonb_build_array('تحقيق جديد يحتاج slug وعنوان.');
      END IF;
    ELSE
      v_merged := jsonb_build_object(
        'slug', v_before->>'slug',
        'title', v_before->>'title',
        'subtitle', v_before->>'subtitle',
        'description', v_before->>'description',
        'difficulty', v_before->>'difficulty',
        'reward', COALESCE(v_before->'reward','{}'::jsonb),
        'steps', COALESCE(v_before->'steps','[]'::jsonb),
        'related_entities', COALESCE(v_before->'related_entities','[]'::jsonb),
        'enabled', COALESCE((v_before->>'enabled')::boolean, true),
        'world_slug', v_before->>'world_slug'
      );

      FOREACH v_col IN ARRAY ARRAY['slug','title','subtitle','description','difficulty','world_slug'] LOOP
        IF v_item ? v_col THEN
          v_merged := jsonb_set(v_merged, ARRAY[v_col],
            CASE WHEN v_item->>v_col IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_item->>v_col) END);
        END IF;
      END LOOP;

      IF v_item ? 'enabled' AND v_item->>'enabled' IS NOT NULL THEN
        v_merged := jsonb_set(v_merged, ARRAY['enabled'], to_jsonb((v_item->>'enabled')::boolean));
      END IF;

      IF v_item ? 'reward' AND jsonb_typeof(v_item->'reward') = 'object' THEN
        v_merged := jsonb_set(v_merged, ARRAY['reward'],
          COALESCE(v_before->'reward','{}'::jsonb) || (v_item->'reward'));
      END IF;
    END IF;

    IF v_item ? 'steps' AND jsonb_typeof(v_item->'steps') = 'array' THEN
      v_before_steps := COALESCE(v_before->'steps','[]'::jsonb);
      v_steps := '[]'::jsonb;
      v_seen_ids := ARRAY[]::text[];

      FOR v_step IN SELECT jsonb_array_elements(v_item->'steps') LOOP
        v_step_id := NULLIF(v_step->>'id','');
        v_prev_step := NULL;
        IF v_step_id IS NOT NULL THEN
          SELECT s INTO v_prev_step
            FROM jsonb_array_elements(v_before_steps) s
           WHERE s->>'id' = v_step_id
           LIMIT 1;
          IF v_step_id = ANY(v_seen_ids) THEN
            v_errors := v_errors || jsonb_build_array('معرّف خطوة مكرّر في الملف: ' || v_step_id);
          END IF;
          v_seen_ids := v_seen_ids || v_step_id;
        END IF;
        IF v_prev_step IS NULL THEN
          IF v_step_id IS NOT NULL THEN v_added_steps := v_added_steps || v_step_id; END IF;
          v_steps := v_steps || jsonb_build_array(v_step);
        ELSE
          v_steps := v_steps || jsonb_build_array(v_prev_step || v_step);
        END IF;
      END LOOP;

      SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::text[]) INTO v_removed_steps
        FROM jsonb_array_elements(v_before_steps) s
       WHERE s->>'id' IS NOT NULL
         AND NOT (s->>'id' = ANY(v_seen_ids));

      IF array_length(v_removed_steps,1) > 0 AND NOT v_allow_removals THEN
        v_errors := v_errors || jsonb_build_array(
          'الاستيراد يحذف ' || array_length(v_removed_steps,1)::text ||
          ' خطوة/خطوات — يلزم تفعيل "السماح بالحذف".');
      END IF;

      v_merged := jsonb_set(v_merged, ARRAY['steps'], v_steps);
    END IF;

    IF v_item ? 'related_entities' AND jsonb_typeof(v_item->'related_entities') = 'array' THEN
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_before_rel
        FROM jsonb_array_elements(COALESCE(v_before->'related_entities','[]'::jsonb)) e,
             LATERAL (SELECT COALESCE(e #>> '{}', e->>'id', e->>'slug', e->>'entity_id') AS x) q
       WHERE x IS NOT NULL;
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_after_rel
        FROM jsonb_array_elements(v_item->'related_entities') e,
             LATERAL (SELECT COALESCE(e #>> '{}', e->>'id', e->>'slug', e->>'entity_id') AS x) q
       WHERE x IS NOT NULL;
      SELECT COALESCE(array_agg(a), ARRAY[]::text[]) INTO v_added_rel
        FROM unnest(v_after_rel) a WHERE NOT (a = ANY(COALESCE(v_before_rel, ARRAY[]::text[])));
      SELECT COALESCE(array_agg(b), ARRAY[]::text[]) INTO v_removed_rel
        FROM unnest(COALESCE(v_before_rel, ARRAY[]::text[])) b WHERE NOT (b = ANY(v_after_rel));
      v_merged := jsonb_set(v_merged, ARRAY['related_entities'], v_item->'related_entities');
    END IF;

    IF v_target IS NOT NULL THEN
      v_merged := jsonb_set(v_merged, ARRAY['id'], to_jsonb(v_target::text));
    END IF;

    BEGIN
      v_merged := public.admin_merge_investigation_stable_ids(v_merged, v_before);
      PERFORM public.admin_validate_investigation_payload(v_merged, v_before, v_allow_removals);
    EXCEPTION WHEN others THEN
      v_msg := SQLERRM;
      v_errors := v_errors || jsonb_build_array(v_msg);
    END;

    IF v_before IS NOT NULL AND NOT (v_item ? 'steps')
       AND COALESCE(v_merged->'steps','[]'::jsonb) IS DISTINCT FROM COALESCE(v_before->'steps','[]'::jsonb) THEN
      v_warnings := v_warnings || jsonb_build_array('تمت إضافة معرّفات ثابتة مفقودة لخطوات التحقيق (تطبيع تلقائي).');
    END IF;

    IF v_merged->>'slug' IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.investigations t
       WHERE t.slug = v_merged->>'slug'
         AND (v_target IS NULL OR t.id <> v_target)
    ) THEN
      v_errors := v_errors || jsonb_build_array('المعرّف slug مأخوذ بالفعل: ' || (v_merged->>'slug'));
    END IF;

    IF v_before IS NOT NULL THEN
      FOREACH v_col IN ARRAY ARRAY['slug','title','subtitle','description','difficulty','enabled','reward','steps','related_entities','world_slug'] LOOP
        IF COALESCE(v_merged->v_col,'null'::jsonb) IS DISTINCT FROM
           COALESCE(v_before->v_col,'null'::jsonb) THEN
          v_updated_fields := v_updated_fields || jsonb_build_array(v_col);
        END IF;
      END LOOP;
    END IF;

    v_dirty := (v_before IS NULL) OR jsonb_array_length(v_updated_fields) > 0;

    v_added := jsonb_build_object('steps', to_jsonb(v_added_steps), 'related_entities', to_jsonb(v_added_rel));
    v_removed := jsonb_build_object('steps', to_jsonb(v_removed_steps), 'related_entities', to_jsonb(v_removed_rel));

    IF jsonb_array_length(v_errors) > 0 THEN
      IF v_mode = 'commit' THEN
        RAISE EXCEPTION 'import blocked for %: %',
          COALESCE(v_merged->>'slug', v_slug, '(unknown)'), v_errors::text;
      END IF;
      v_action := 'blocked';
      v_blocked := v_blocked + 1;
    ELSIF NOT v_dirty THEN
      v_action := 'noop';
      v_noop := v_noop + 1;
    ELSIF v_mode = 'commit' THEN
      PERFORM set_config('irth.publish_source', 'import_v2', true);
      IF v_before IS NULL THEN
        INSERT INTO public.investigations
          (slug, title, subtitle, description, difficulty, reward, steps, related_entities, enabled, world_slug)
        VALUES (
          v_merged->>'slug', v_merged->>'title',
          NULLIF(v_merged->>'subtitle',''), NULLIF(v_merged->>'description',''),
          COALESCE(v_merged->>'difficulty','easy'),
          COALESCE(v_merged->'reward','{}'::jsonb),
          COALESCE(v_merged->'steps','[]'::jsonb),
          COALESCE(v_merged->'related_entities','[]'::jsonb),
          COALESCE((v_merged->>'enabled')::boolean, true),
          v_merged->>'world_slug')
        RETURNING id INTO v_new_id;
        v_target := v_new_id;
        v_created := v_created + 1;
      ELSE
        UPDATE public.investigations SET
          slug = v_merged->>'slug',
          title = v_merged->>'title',
          subtitle = NULLIF(v_merged->>'subtitle',''),
          description = NULLIF(v_merged->>'description',''),
          difficulty = COALESCE(v_merged->>'difficulty', difficulty),
          reward = COALESCE(v_merged->'reward','{}'::jsonb),
          steps = COALESCE(v_merged->'steps','[]'::jsonb),
          related_entities = COALESCE(v_merged->'related_entities','[]'::jsonb),
          enabled = COALESCE((v_merged->>'enabled')::boolean, enabled),
          world_slug = v_merged->>'world_slug',
          content_version = content_version + 1,
          published_at = COALESCE(published_at, now())
        WHERE id = v_target;
        v_updated_cnt := v_updated_cnt + 1;
      END IF;
    ELSE
      IF v_before IS NULL THEN v_created := v_created + 1;
      ELSE v_updated_cnt := v_updated_cnt + 1; END IF;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'action', v_action,
      'id', v_target,
      'slug', v_merged->>'slug',
      'title', v_merged->>'title',
      'matched_by', v_match_by,
      'updated_fields', v_updated_fields,
      'added', v_added,
      'removed', v_removed,
      'warnings', v_warnings,
      'errors', v_errors,
      'counts', jsonb_build_object(
        'steps', COALESCE(jsonb_array_length(v_merged->'steps'),0),
        'related_entities', COALESCE(jsonb_array_length(v_merged->'related_entities'),0))
    ));
  END LOOP;

  IF v_mode = 'commit' AND v_updated_cnt = 0 AND v_created = 0 THEN
    RAISE EXCEPTION 'import_failed: no rows were updated or created';
  END IF;

  RETURN jsonb_build_object(
    'ok', v_blocked = 0,
    'mode', v_mode,
    'allow_removals', v_allow_removals,
    'totals', jsonb_build_object(
      'items', jsonb_array_length(v_items),
      'created', v_created,
      'updated', v_updated_cnt,
      'unchanged', v_noop,
      'blocked', v_blocked),
    'items', v_results
  );
END;
$fn$;
-- Update save draft to include world_slug
CREATE OR REPLACE FUNCTION public.admin_save_investigation_draft(
  p_id              uuid,
  p_draft           jsonb,
  p_version_signal  text DEFAULT NULL,
  p_allow_removals  boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row record;
  v_current text;
  v_data jsonb := p_draft;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'missing id'; END IF;
  IF p_draft IS NULL THEN RAISE EXCEPTION 'missing draft'; END IF;

  SELECT * INTO v_row FROM public.investigations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'investigation not found'; END IF;

  v_current := COALESCE(to_jsonb(v_row.*)->>'updated_at', to_jsonb(v_row.*)->>'created_at');
  IF p_version_signal IS NOT NULL AND p_version_signal <> v_current THEN
    RAISE EXCEPTION 'stale: content changed since editor loaded' USING ERRCODE = 'P0004';
  END IF;

  -- Force immutable slug: slug rename is out of scope for Phase D.
  v_data := jsonb_set(v_data, '{slug}', to_jsonb(v_row.slug), true);
  v_data := public.admin_merge_investigation_stable_ids(
              v_data,
              COALESCE(v_row.draft_data, to_jsonb(v_row.*))
            );

  -- Full validation
  PERFORM public.admin_validate_investigation_payload(
            v_data,
            to_jsonb(v_row.*),
            p_allow_removals);

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  UPDATE public.investigations
     SET draft_data              = v_data,
         world_slug              = v_data->>'world_slug', -- Persist world_slug during draft save too
         has_unpublished_changes = true,
         updated_by              = v_uid,
         last_editor_email       = v_email,
         last_draft_saved_at     = now()
   WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'draft',
    'has_unpublished_changes', true,
    'last_draft_saved_at', now()
  );
END $$;

-- Update admin_get_investigation_full to expose world_slug
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

  BEGIN v_uuid := p_id_or_slug::uuid;
  EXCEPTION WHEN OTHERS THEN v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL THEN
    SELECT * INTO v_row FROM public.investigations WHERE id = v_uuid;
  ELSE
    SELECT * INTO v_row FROM public.investigations WHERE slug = p_id_or_slug;
  END IF;

  IF NOT FOUND THEN RETURN NULL; END IF;

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
    'updated_at',        v_row.updated_at,
    'world_slug',        v_row.world_slug,
    -- lifecycle metadata
    'draft_data',              v_row.draft_data,
    'content_version',         v_row.content_version,
    'published_at',            v_row.published_at,
    'has_unpublished_changes', v_row.has_unpublished_changes,
    'last_editor_email',       v_row.last_editor_email,
    'last_draft_saved_at',     v_row.last_draft_saved_at
  );
END $$;
