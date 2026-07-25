-- 1) Unlock spec normalizer: accept both { version, expr } and a bare node.
CREATE OR REPLACE FUNCTION public._story_normalize_unlock_v2(p_in jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_in IS NULL OR jsonb_typeof(p_in) <> 'object'
      THEN jsonb_build_object('version', 2, 'expr', jsonb_build_object('type','always'))
    WHEN p_in ? 'expr'
      THEN jsonb_build_object('version', 2, 'expr', p_in->'expr')
    WHEN p_in ? 'type'
      THEN jsonb_build_object('version', 2, 'expr', p_in)
    ELSE jsonb_build_object('version', 2, 'expr', jsonb_build_object('type','always'))
  END
$$;

DO $mig$
DECLARE
  src text;
  out text;
BEGIN
  ------------------------------------------------------------------
  -- 2) Canonicalizer: normalize unlock_spec envelope
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='_story_canonicalize_incoming_v2';

  out := replace(src,
    E'''unlock_spec'', COALESCE(p_in->''unlock_spec'', jsonb_build_object(''version'',2,''expr'',jsonb_build_object(''type'',''always''))),',
    E'''unlock_spec'', public._story_normalize_unlock_v2(p_in->''unlock_spec''),');
  IF out = src THEN RAISE EXCEPTION 'canonicalize patch anchor not found'; END IF;
  EXECUTE out;

  ------------------------------------------------------------------
  -- 3) Preview: media declared in the same envelope is not "missing"
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='admin_import_stories_v2_preview';

  out := replace(src,
    E'    ), ''[]''::jsonb);\n\n    v_id := v_canon->>''id'';',
    E'    ), ''[]''::jsonb);\n\n'
    || E'    -- Media rows declared inside this very envelope will be upserted by\n'
    || E'    -- apply() before the stories, so they must not count as missing.\n'
    || E'    v_issues := COALESCE((\n'
    || E'      SELECT jsonb_agg(\n'
    || E'        CASE WHEN i->>''code'' = ''missing_media'' THEN\n'
    || E'          jsonb_build_object(''code'',''missing_media'',''ids'', (\n'
    || E'            SELECT COALESCE(jsonb_agg(to_jsonb(m)), ''[]''::jsonb)\n'
    || E'            FROM jsonb_array_elements_text(i->''ids'') m\n'
    || E'            WHERE NOT EXISTS (\n'
    || E'              SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->''media'',''[]''::jsonb)) pm\n'
    || E'              WHERE pm->>''id'' = m)\n'
    || E'          ))\n'
    || E'        ELSE i END)\n'
    || E'      FROM jsonb_array_elements(v_issues) i\n'
    || E'      WHERE i->>''code'' <> ''missing_media''\n'
    || E'         OR EXISTS (\n'
    || E'           SELECT 1 FROM jsonb_array_elements_text(i->''ids'') m\n'
    || E'           WHERE NOT EXISTS (\n'
    || E'             SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->''media'',''[]''::jsonb)) pm\n'
    || E'             WHERE pm->>''id'' = m))\n'
    || E'    ), ''[]''::jsonb);\n\n'
    || E'    v_id := v_canon->>''id'';');
  IF out = src THEN RAISE EXCEPTION 'preview patch anchor not found'; END IF;
  EXECUTE out;

  ------------------------------------------------------------------
  -- 4) Apply: media upsert + media preservation
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='admin_import_stories_v2_apply';

  -- 4a) new declarations
  out := replace(src,
    E'  v_allow_deletes boolean := COALESCE((p_options->>''allow_deletes'')::boolean, false);',
    E'  v_allow_deletes boolean := COALESCE((p_options->>''allow_deletes'')::boolean, false);\n'
    || E'  v_clear_media boolean := COALESCE((p_options->>''clear_media'')::boolean, false);\n'
    || E'  v_media jsonb;');
  IF out = src THEN RAISE EXCEPTION 'apply decl anchor not found'; END IF;
  src := out;

  -- 4b) media upsert before collections/stories
  out := replace(src,
    E'  -- Upsert collections declared in the envelope first, so stories can',
    E'  -- Upsert media declared in the envelope first, so stories and scenes\n'
    || E'  -- can reference brand-new assets inside the very same transaction.\n'
    || E'  FOR v_media IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->''media'',''[]''::jsonb)) LOOP\n'
    || E'    CONTINUE WHEN NULLIF(v_media->>''id'','''') IS NULL\n'
    || E'      OR COALESCE(v_media->>''storage_path'','''') = ''''\n'
    || E'      OR COALESCE(v_media->>''checksum_sha256'','''') = '''';\n'
    || E'    INSERT INTO public.story_media AS m (\n'
    || E'      id, story_id, owner_scope, collection_id, kind,\n'
    || E'      storage_bucket, storage_path, mime_type, byte_size,\n'
    || E'      width, height, checksum_sha256, preset, processing_version, metadata\n'
    || E'    ) VALUES (\n'
    || E'      (v_media->>''id'')::uuid,\n'
    || E'      NULLIF(v_media->>''story_id'',''''),\n'
    || E'      COALESCE(NULLIF(v_media->>''owner_scope'',''''), ''story''),\n'
    || E'      NULLIF(v_media->>''collection_id'',''''),\n'
    || E'      COALESCE(NULLIF(v_media->>''kind'',''''), ''scene''),\n'
    || E'      COALESCE(NULLIF(v_media->>''storage_bucket'',''''), ''story-media''),\n'
    || E'      v_media->>''storage_path'',\n'
    || E'      COALESCE(NULLIF(v_media->>''mime_type'',''''), ''image/webp''),\n'
    || E'      COALESCE((v_media->>''byte_size'')::int, 0),\n'
    || E'      COALESCE((v_media->>''width'')::int, 0),\n'
    || E'      COALESCE((v_media->>''height'')::int, 0),\n'
    || E'      v_media->>''checksum_sha256'',\n'
    || E'      COALESCE(NULLIF(v_media->>''preset'',''''), ''original''),\n'
    || E'      COALESCE((v_media->>''processing_version'')::int, 1),\n'
    || E'      COALESCE(v_media->''metadata'', ''{}''::jsonb)\n'
    || E'    )\n'
    || E'    ON CONFLICT (id) DO UPDATE SET\n'
    || E'      story_id = EXCLUDED.story_id,\n'
    || E'      owner_scope = EXCLUDED.owner_scope,\n'
    || E'      collection_id = EXCLUDED.collection_id,\n'
    || E'      kind = EXCLUDED.kind,\n'
    || E'      storage_bucket = EXCLUDED.storage_bucket,\n'
    || E'      storage_path = EXCLUDED.storage_path,\n'
    || E'      mime_type = EXCLUDED.mime_type,\n'
    || E'      byte_size = EXCLUDED.byte_size,\n'
    || E'      width = EXCLUDED.width,\n'
    || E'      height = EXCLUDED.height,\n'
    || E'      checksum_sha256 = EXCLUDED.checksum_sha256,\n'
    || E'      preset = EXCLUDED.preset,\n'
    || E'      processing_version = EXCLUDED.processing_version,\n'
    || E'      metadata = EXCLUDED.metadata,\n'
    || E'      updated_at = now();\n'
    || E'  END LOOP;\n\n'
    || E'  -- Upsert collections declared in the envelope first, so stories can');
  IF out = src THEN RAISE EXCEPTION 'apply media anchor not found'; END IF;
  src := out;

  -- 4c) never drop an existing cover when the incoming value is null
  out := replace(src,
    E'      unlock_spec = EXCLUDED.unlock_spec,\n      cover_media_id = EXCLUDED.cover_media_id,',
    E'      unlock_spec = EXCLUDED.unlock_spec,\n'
    || E'      cover_media_id = CASE WHEN v_clear_media THEN EXCLUDED.cover_media_id\n'
    || E'                            ELSE COALESCE(EXCLUDED.cover_media_id, s.cover_media_id) END,');
  IF out = src THEN RAISE EXCEPTION 'apply cover anchor not found'; END IF;
  src := out;

  -- 4d) same for scene primary media
  out := replace(src,
    E'        payload = EXCLUDED.payload,\n        primary_media_id = EXCLUDED.primary_media_id,',
    E'        payload = EXCLUDED.payload,\n'
    || E'        primary_media_id = CASE WHEN v_clear_media THEN EXCLUDED.primary_media_id\n'
    || E'                                ELSE COALESCE(EXCLUDED.primary_media_id, x.primary_media_id) END,');
  IF out = src THEN RAISE EXCEPTION 'apply scene media anchor not found'; END IF;

  EXECUTE out;
END
$mig$;