DO $mig$
DECLARE
  v_def text;
  v_marker text;
BEGIN
  -- 1) Preview: a collection defined in the same envelope counts as existing.
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname='admin_import_stories_v2_preview';
  v_marker := 'v_issues := public._story_validate_v2_one(v_canon);';
  IF position(v_marker in v_def) = 0 THEN
    RAISE EXCEPTION 'preview marker not found';
  END IF;
  v_def := replace(v_def, v_marker, v_marker || '
    v_issues := COALESCE((
      SELECT jsonb_agg(i)
      FROM jsonb_array_elements(v_issues) i
      WHERE NOT (
        i->>''code'' = ''unknown_collection''
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->''collections'',''[]''::jsonb)) c
          WHERE c->>''id'' = i->>''id''
            AND COALESCE(c->>''slug'','''') <> ''''
            AND COALESCE(c->>''title_ar'','''') <> ''''
        )
      )
    ), ''[]''::jsonb);
');
  EXECUTE v_def;

  -- 2) Apply: upsert envelope collections before any story write (same transaction).
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname='admin_import_stories_v2_apply';
  v_marker := '-- Apply per story in stable order (id asc)';
  IF position(v_marker in v_def) = 0 THEN
    RAISE EXCEPTION 'apply marker not found';
  END IF;
  v_def := replace(v_def, v_marker, '-- Upsert collections declared in the envelope first, so stories can
  -- reference a brand-new series inside the very same transaction.
  INSERT INTO public.story_collections AS col (
    id, slug, title_ar, title_en, summary_ar, summary_en,
    cover_media_id, display_order, metadata
  )
  SELECT
    c->>''id'',
    c->>''slug'',
    c->>''title_ar'',
    c->>''title_en'',
    c->>''summary_ar'',
    c->>''summary_en'',
    NULLIF(c->>''cover_media_id'','''')::uuid,
    COALESCE((c->>''display_order'')::int, 0),
    COALESCE(c->''metadata'', ''{}''::jsonb)
  FROM jsonb_array_elements(COALESCE(p_payload->''collections'',''[]''::jsonb)) c
  WHERE COALESCE(c->>''id'','''') <> ''''
    AND COALESCE(c->>''slug'','''') <> ''''
    AND COALESCE(c->>''title_ar'','''') <> ''''
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    title_ar = EXCLUDED.title_ar,
    title_en = EXCLUDED.title_en,
    summary_ar = EXCLUDED.summary_ar,
    summary_en = EXCLUDED.summary_en,
    cover_media_id = EXCLUDED.cover_media_id,
    display_order = EXCLUDED.display_order,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  ' || v_marker);
  EXECUTE v_def;
END $mig$;