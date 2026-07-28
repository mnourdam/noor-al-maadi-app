CREATE OR REPLACE FUNCTION public.admin_import_campaigns_v2(p_payload jsonb, p_options jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_mode text := COALESCE(p_options->>'mode', 'dry_run');
  v_allow_removals boolean := COALESCE((p_options->>'allow_removals')::boolean, false);
  v_write_mode text := COALESCE(p_options->>'write_mode', 'draft');
  uid uuid := auth.uid();
  uemail text;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_created int := 0; v_updated int := 0; v_unchanged int := 0; v_blocked int := 0; v_total int := 0;
  v_ok boolean := true;

  v_id text; v_slug text; v_title text; v_status text; v_data jsonb;
  v_existing record;
  v_action text;
  v_matched_by text;
  v_errors text[]; v_warnings text[]; v_fields text[];
  v_old_ch text[]; v_new_ch text[]; v_old_act text[]; v_new_act text[];
  v_removed_ch text[]; v_added_ch text[]; v_removed_act text[]; v_added_act text[];
  v_ka jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_mode NOT IN ('dry_run','commit') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  IF v_write_mode NOT IN ('draft','publish') THEN RAISE EXCEPTION 'invalid write_mode'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload->'campaigns') <> 'array' THEN
    RAISE EXCEPTION 'payload must contain a campaigns array';
  END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'campaigns') LOOP
    v_total := v_total + 1;
    v_errors := '{}'; v_warnings := '{}'; v_fields := '{}';
    v_removed_ch := '{}'; v_added_ch := '{}'; v_removed_act := '{}'; v_added_act := '{}';
    v_matched_by := NULL;

    v_id    := NULLIF(btrim(COALESCE(v_item->>'id','')), '');
    v_slug  := NULLIF(btrim(COALESCE(v_item->>'slug','')), '');
    v_title := NULLIF(btrim(COALESCE(v_item->>'title','')), '');
    v_status := NULLIF(btrim(COALESCE(v_item->>'status','')), '');
    v_data  := CASE WHEN jsonb_typeof(v_item->'data') = 'object' THEN v_item->'data'
                    WHEN jsonb_typeof(v_item->'draft_data') = 'object' THEN v_item->'draft_data'
                    ELSE NULL END;
    v_ka    := CASE WHEN jsonb_typeof(v_item->'key_art') = 'object' THEN v_item->'key_art' ELSE NULL END;

    IF v_id IS NULL AND v_slug IS NULL THEN
      v_errors := v_errors || 'العنصر لا يحتوي id ولا slug.';
    END IF;
    IF v_data IS NULL THEN
      v_errors := v_errors || 'الحقل data مفقود أو ليس كائنًا.';
    ELSIF jsonb_typeof(v_data->'chapters') <> 'array' THEN
      v_errors := v_errors || 'data.chapters يجب أن يكون مصفوفة.';
    END IF;
    IF v_id IS NOT NULL AND v_id LIKE 'div\_%' THEN
      v_errors := v_errors || 'الفواصل التنظيمية (div_*) لا تُستورد.';
    END IF;

    v_existing := NULL;
    IF v_id IS NOT NULL THEN
      SELECT * INTO v_existing FROM public.admin_campaigns WHERE id = v_id;
      IF FOUND THEN v_matched_by := 'id'; END IF;
    END IF;
    IF v_matched_by IS NULL AND v_slug IS NOT NULL THEN
      SELECT * INTO v_existing FROM public.admin_campaigns WHERE slug = v_slug;
      IF FOUND THEN v_matched_by := 'slug'; v_id := COALESCE(v_id, v_existing.id); END IF;
    END IF;

    IF v_matched_by IS NULL AND v_title IS NULL THEN
      v_errors := v_errors || 'حملة جديدة بدون عنوان.';
    END IF;

    -- structural diff (against the live published document)
    IF v_existing.id IS NOT NULL AND v_data IS NOT NULL AND jsonb_typeof(v_data->'chapters') = 'array' THEN
      SELECT COALESCE(array_agg(ch->>'id'), '{}') INTO v_old_ch
        FROM jsonb_array_elements(COALESCE(v_existing.data->'chapters','[]'::jsonb)) ch
       WHERE ch->>'id' IS NOT NULL;
      SELECT COALESCE(array_agg(ch->>'id'), '{}') INTO v_new_ch
        FROM jsonb_array_elements(v_data->'chapters') ch
       WHERE ch->>'id' IS NOT NULL;
      SELECT COALESCE(array_agg(a->>'id'), '{}') INTO v_old_act
        FROM jsonb_array_elements(COALESCE(v_existing.data->'chapters','[]'::jsonb)) ch,
             jsonb_array_elements(COALESCE(ch->'activities','[]'::jsonb)) a
       WHERE a->>'id' IS NOT NULL;
      SELECT COALESCE(array_agg(a->>'id'), '{}') INTO v_new_act
        FROM jsonb_array_elements(v_data->'chapters') ch,
             jsonb_array_elements(COALESCE(ch->'activities','[]'::jsonb)) a
       WHERE a->>'id' IS NOT NULL;

      SELECT COALESCE(array_agg(x), '{}') INTO v_removed_ch FROM unnest(v_old_ch) x WHERE NOT (x = ANY(v_new_ch));
      SELECT COALESCE(array_agg(x), '{}') INTO v_added_ch   FROM unnest(v_new_ch) x WHERE NOT (x = ANY(v_old_ch));
      SELECT COALESCE(array_agg(x), '{}') INTO v_removed_act FROM unnest(v_old_act) x WHERE NOT (x = ANY(v_new_act));
      SELECT COALESCE(array_agg(x), '{}') INTO v_added_act   FROM unnest(v_new_act) x WHERE NOT (x = ANY(v_old_act));

      IF array_length(v_removed_ch,1) > 0 OR array_length(v_removed_act,1) > 0 THEN
        IF v_allow_removals THEN
          v_warnings := v_warnings || format('سيتم حذف %s فصلًا و%s نشاطًا.',
            COALESCE(array_length(v_removed_ch,1),0), COALESCE(array_length(v_removed_act,1),0));
        ELSE
          v_errors := v_errors || format('الملف يحذف %s فصلًا و%s نشاطًا — فعّل السماح بالحذف للمتابعة.',
            COALESCE(array_length(v_removed_ch,1),0), COALESCE(array_length(v_removed_act,1),0));
        END IF;
      END IF;
    END IF;

    -- field diff
    IF v_existing.id IS NOT NULL THEN
      IF v_title IS NOT NULL AND v_title IS DISTINCT FROM v_existing.title THEN v_fields := v_fields || 'title'; END IF;
      IF v_slug  IS NOT NULL AND v_slug  IS DISTINCT FROM v_existing.slug  THEN v_fields := v_fields || 'slug'; END IF;
      IF v_status IS NOT NULL AND v_write_mode = 'publish' AND v_status IS DISTINCT FROM v_existing.status THEN
        v_fields := v_fields || 'status';
      END IF;
      IF v_data IS NOT NULL AND v_data IS DISTINCT FROM
         (CASE WHEN v_write_mode = 'publish' THEN v_existing.data ELSE COALESCE(v_existing.draft_data, v_existing.data) END)
      THEN v_fields := v_fields || 'data'; END IF;
      IF v_ka IS NOT NULL AND (
           COALESCE(v_ka->>'path','')        IS DISTINCT FROM COALESCE(v_existing.key_art_path,'') OR
           COALESCE(v_ka->>'square_path','') IS DISTINCT FROM COALESCE(v_existing.key_art_square_path,'') OR
           COALESCE(v_ka->>'credit','')      IS DISTINCT FROM COALESCE(v_existing.key_art_credit,'') OR
           COALESCE(v_ka->>'source','')      IS DISTINCT FROM COALESCE(v_existing.key_art_source,'')
         ) THEN v_fields := v_fields || 'key_art'; END IF;
    END IF;

    IF array_length(v_errors,1) > 0 THEN
      v_action := 'blocked'; v_blocked := v_blocked + 1; v_ok := false;
    ELSIF v_existing.id IS NULL THEN
      v_action := 'create'; v_created := v_created + 1;
    ELSIF array_length(v_fields,1) > 0 THEN
      v_action := 'update'; v_updated := v_updated + 1;
    ELSE
      v_action := 'noop'; v_unchanged := v_unchanged + 1;
    END IF;

    v_items := v_items || jsonb_build_object(
      'action', v_action,
      'id', COALESCE(v_id, v_existing.id),
      'slug', COALESCE(v_slug, v_existing.slug),
      'title', COALESCE(v_title, v_existing.title),
      'matched_by', v_matched_by,
      'updated_fields', to_jsonb(v_fields),
      'added',   jsonb_build_object('chapters', to_jsonb(v_added_ch),   'activities', to_jsonb(v_added_act)),
      'removed', jsonb_build_object('chapters', to_jsonb(v_removed_ch), 'activities', to_jsonb(v_removed_act)),
      'counts', jsonb_build_object(
        'chapters', COALESCE(jsonb_array_length(v_data->'chapters'), 0),
        'activities', COALESCE((
          SELECT count(*)::int FROM jsonb_array_elements(COALESCE(v_data->'chapters','[]'::jsonb)) ch,
                 jsonb_array_elements(COALESCE(ch->'activities','[]'::jsonb))), 0)
      ),
      'warnings', to_jsonb(v_warnings),
      'errors', to_jsonb(v_errors)
    );
  END LOOP;

  IF v_mode = 'commit' AND NOT v_ok THEN
    RAISE EXCEPTION 'import blocked: % item(s) have errors', v_blocked;
  END IF;

  IF v_mode = 'commit' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'campaigns') LOOP
      v_id    := NULLIF(btrim(COALESCE(v_item->>'id','')), '');
      v_slug  := NULLIF(btrim(COALESCE(v_item->>'slug','')), '');
      v_title := NULLIF(btrim(COALESCE(v_item->>'title','')), '');
      v_status := NULLIF(btrim(COALESCE(v_item->>'status','')), '');
      v_data  := CASE WHEN jsonb_typeof(v_item->'data') = 'object' THEN v_item->'data'
                      WHEN jsonb_typeof(v_item->'draft_data') = 'object' THEN v_item->'draft_data'
                      ELSE NULL END;
      v_ka    := CASE WHEN jsonb_typeof(v_item->'key_art') = 'object' THEN v_item->'key_art' ELSE NULL END;

      v_existing := NULL; v_matched_by := NULL;
      IF v_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.admin_campaigns WHERE id = v_id;
        IF FOUND THEN v_matched_by := 'id'; END IF;
      END IF;
      IF v_matched_by IS NULL AND v_slug IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.admin_campaigns WHERE slug = v_slug;
        IF FOUND THEN v_matched_by := 'slug'; v_id := v_existing.id; END IF;
      END IF;

      IF v_existing.id IS NULL THEN
        INSERT INTO public.admin_campaigns (
          id, slug, title, status, data, draft_data,
          key_art_path, key_art_square_path, key_art_credit, key_art_source,
          updated_by, last_editor_email, has_unpublished_changes, published_at
        ) VALUES (
          COALESCE(v_id, gen_random_uuid()::text), v_slug, v_title,
          CASE WHEN v_write_mode = 'publish' THEN COALESCE(v_status,'draft') ELSE 'draft' END,
          v_data, v_data,
          v_ka->>'path', v_ka->>'square_path', v_ka->>'credit', v_ka->>'source',
          uid, uemail, v_write_mode <> 'publish',
          CASE WHEN v_write_mode = 'publish' AND COALESCE(v_status,'draft') = 'published' THEN now() ELSE NULL END
        );
      ELSE
        IF v_write_mode = 'publish' THEN
          INSERT INTO public.admin_campaign_versions (campaign_id, version, title, slug, status, data, editor_id, editor_email, note)
          VALUES (v_existing.id, v_existing.content_version, v_existing.title, v_existing.slug, v_existing.status,
                  v_existing.data, uid, uemail, 'snapshot before import');

          UPDATE public.admin_campaigns
             SET title = COALESCE(v_title, title),
                 slug  = COALESCE(v_slug, slug),
                 status = COALESCE(v_status, status),
                 data = COALESCE(v_data, data),
                 draft_data = COALESCE(v_data, draft_data),
                 key_art_path        = COALESCE(NULLIF(v_ka->>'path',''), key_art_path),
                 key_art_square_path = COALESCE(NULLIF(v_ka->>'square_path',''), key_art_square_path),
                 key_art_credit      = COALESCE(NULLIF(v_ka->>'credit',''), key_art_credit),
                 key_art_source      = COALESCE(NULLIF(v_ka->>'source',''), key_art_source),
                 content_version = content_version + 1,
                 has_unpublished_changes = false,
                 published_at = CASE WHEN COALESCE(v_status, status) = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
                 updated_by = uid, last_editor_email = uemail, updated_at = now()
           WHERE id = v_existing.id;
        ELSE
          UPDATE public.admin_campaigns
             SET title = COALESCE(v_title, title),
                 slug  = COALESCE(v_slug, slug),
                 draft_data = COALESCE(v_data, draft_data),
                 key_art_path        = COALESCE(NULLIF(v_ka->>'path',''), key_art_path),
                 key_art_square_path = COALESCE(NULLIF(v_ka->>'square_path',''), key_art_square_path),
                 key_art_credit      = COALESCE(NULLIF(v_ka->>'credit',''), key_art_credit),
                 key_art_source      = COALESCE(NULLIF(v_ka->>'source',''), key_art_source),
                 has_unpublished_changes = true,
                 updated_by = uid, last_editor_email = uemail, updated_at = now()
           WHERE id = v_existing.id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', v_ok,
    'mode', v_mode,
    'write_mode', v_write_mode,
    'allow_removals', v_allow_removals,
    'totals', jsonb_build_object(
      'items', v_total, 'created', v_created, 'updated', v_updated,
      'unchanged', v_unchanged, 'blocked', v_blocked
    ),
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_import_campaigns_v2(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_campaigns_v2(jsonb, jsonb) TO authenticated;