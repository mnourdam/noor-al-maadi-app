
-- ============================================================
-- Stories M4 — Importer v2 / Exporter v2 (additive; M1/M2/M3 untouched)
-- ------------------------------------------------------------
-- Adds three new SECURITY DEFINER RPCs. No schema, enum, column,
-- trigger, constraint, RLS, grant, or existing function is modified.
-- Frozen M1/M2/M3 contracts are reused exactly.
-- ============================================================

-- ---------------------------------------------------------
-- Internal helper: canonical per-story deterministic jsonb.
-- Used by export, preview (baseline diff), and apply (idempotency).
-- Ordering: scenes by scene_index; relations by (role,target_type,target_id,display_order,id);
-- sources by (source_key,id); tags sorted alphabetically.
-- Timestamps (created_at/updated_at/published_at/verified_at) and mutable
-- housekeeping (previous_draft*, reaction_count, content_version) are excluded
-- so the shape is stable across environments and immune to autosave churn.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._story_export_v2_one(p_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'schema_version', s.schema_version,
    'title_ar', s.title_ar,
    'title_en', s.title_en,
    'summary_ar', s.summary_ar,
    'summary_en', s.summary_en,
    'world_slug', s.world_slug,
    'era', s.era,
    'display_order', s.display_order,
    'status', s.status,
    'unlock_spec', s.unlock_spec,
    'cover_media_id', s.cover_media_id,
    'xp_reward', s.xp_reward,
    'dinar_reward', s.dinar_reward,
    'metadata', s.metadata,
    'category', s.category::text,
    'rarity', s.rarity::text,
    'production_status', s.production_status::text,
    'lock_visibility', s.lock_visibility::text,
    'historical_confidence', s.historical_confidence::text,
    'hijri_start_year', s.hijri_start_year,
    'hijri_start_month', s.hijri_start_month,
    'hijri_start_day', s.hijri_start_day,
    'hijri_end_year', s.hijri_end_year,
    'hijri_end_month', s.hijri_end_month,
    'hijri_end_day', s.hijri_end_day,
    'gregorian_start', s.gregorian_start,
    'gregorian_end', s.gregorian_end,
    'story_collection_id', s.story_collection_id,
    'collection_order', s.collection_order,
    'time_precision', s.time_precision::text,
    'length_class', s.length_class::text,
    'tags', COALESCE((SELECT jsonb_agg(t ORDER BY t) FROM unnest(s.tags) t), '[]'::jsonb),
    'snapshot_tier', s.snapshot_tier::text,
    'scenes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sc.id,
        'scene_index', sc.scene_index,
        'scene_type', sc.scene_type,
        'schema_version', sc.schema_version,
        'title_ar', sc.title_ar,
        'title_en', sc.title_en,
        'payload', sc.payload,
        'primary_media_id', sc.primary_media_id
      ) ORDER BY sc.scene_index)
      FROM public.story_scenes sc WHERE sc.story_id = s.id
    ), '[]'::jsonb),
    'relations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'target_type', r.target_type::text,
        'target_id', r.target_id,
        'target_extra', r.target_extra,
        'role', r.role::text,
        'notes', r.notes,
        'display_order', r.display_order,
        'metadata', r.metadata
      ) ORDER BY r.role::text, r.target_type::text, r.target_id, r.display_order, r.id)
      FROM public.story_relations r WHERE r.story_id = s.id
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', src.id,
        'source_key', src.source_key,
        'kind', src.kind::text,
        'citation', src.citation,
        'title', src.title,
        'author', src.author,
        'year', src.year,
        'page', src.page,
        'url', src.url,
        'weight', src.weight,
        'notes', src.notes,
        'display_order', src.display_order
      ) ORDER BY src.source_key, src.id)
      FROM public.story_sources src WHERE src.story_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.stories s WHERE s.id = p_id;
$$;

REVOKE ALL ON FUNCTION public._story_export_v2_one(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._story_export_v2_one(text) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Internal helper: canonicalize an incoming story payload into
-- the exact shape produced by _story_export_v2_one, applying the
-- same key set, same ordering, and same defaults. Enables byte
-- comparison for idempotency. Does NOT touch the database.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._story_canonicalize_incoming_v2(p_in jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_scenes jsonb;
  v_relations jsonb;
  v_sources jsonb;
  v_tags jsonb;
BEGIN
  IF p_in IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t), '[]'::jsonb) INTO v_tags
  FROM jsonb_array_elements_text(COALESCE(p_in->'tags','[]'::jsonb)) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x->>'id',
    'scene_index', COALESCE((x->>'scene_index')::int, 0),
    'scene_type', COALESCE(x->>'scene_type','reading'),
    'schema_version', COALESCE((x->>'schema_version')::int, 2),
    'title_ar', NULLIF(x->>'title_ar',''),
    'title_en', NULLIF(x->>'title_en',''),
    'payload', COALESCE(x->'payload', '{}'::jsonb),
    'primary_media_id', CASE WHEN NULLIF(x->>'primary_media_id','') IS NULL THEN NULL ELSE (x->>'primary_media_id')::uuid END
  ) ORDER BY COALESCE((x->>'scene_index')::int, 0)), '[]'::jsonb)
  INTO v_scenes
  FROM jsonb_array_elements(COALESCE(p_in->'scenes','[]'::jsonb)) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x->>'id',
    'target_type', x->>'target_type',
    'target_id', x->>'target_id',
    'target_extra', COALESCE(x->'target_extra','{}'::jsonb),
    'role', x->>'role',
    'notes', NULLIF(x->>'notes',''),
    'display_order', COALESCE((x->>'display_order')::int, 0),
    'metadata', COALESCE(x->'metadata','{}'::jsonb)
  ) ORDER BY x->>'role', x->>'target_type', x->>'target_id', COALESCE((x->>'display_order')::int,0), x->>'id'), '[]'::jsonb)
  INTO v_relations
  FROM jsonb_array_elements(COALESCE(p_in->'relations','[]'::jsonb)) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x->>'id',
    'source_key', x->>'source_key',
    'kind', x->>'kind',
    'citation', COALESCE(x->>'citation',''),
    'title', NULLIF(x->>'title',''),
    'author', NULLIF(x->>'author',''),
    'year', NULLIF(x->>'year',''),
    'page', NULLIF(x->>'page',''),
    'url', NULLIF(x->>'url',''),
    'weight', CASE WHEN x->>'weight' IS NULL OR x->>'weight'='' THEN NULL ELSE (x->>'weight')::int END,
    'notes', NULLIF(x->>'notes',''),
    'display_order', COALESCE((x->>'display_order')::int, 0)
  ) ORDER BY x->>'source_key', x->>'id'), '[]'::jsonb)
  INTO v_sources
  FROM jsonb_array_elements(COALESCE(p_in->'sources','[]'::jsonb)) x;

  RETURN jsonb_build_object(
    'id', p_in->>'id',
    'slug', p_in->>'slug',
    'schema_version', COALESCE((p_in->>'schema_version')::int, 2),
    'title_ar', COALESCE(p_in->>'title_ar',''),
    'title_en', NULLIF(p_in->>'title_en',''),
    'summary_ar', NULLIF(p_in->>'summary_ar',''),
    'summary_en', NULLIF(p_in->>'summary_en',''),
    'world_slug', NULLIF(p_in->>'world_slug',''),
    'era', NULLIF(p_in->>'era',''),
    'display_order', COALESCE((p_in->>'display_order')::int, 0),
    'status', COALESCE(p_in->>'status','draft'),
    'unlock_spec', COALESCE(p_in->'unlock_spec', '{"type":"always"}'::jsonb),
    'cover_media_id', CASE WHEN NULLIF(p_in->>'cover_media_id','') IS NULL THEN NULL ELSE (p_in->>'cover_media_id')::uuid END,
    'xp_reward', COALESCE((p_in->>'xp_reward')::int, 0),
    'dinar_reward', COALESCE((p_in->>'dinar_reward')::int, 0),
    'metadata', COALESCE(p_in->'metadata', '{}'::jsonb),
    'category', COALESCE(p_in->>'category','event'),
    'rarity', COALESCE(p_in->>'rarity','standard'),
    'production_status', COALESCE(p_in->>'production_status','idea'),
    'lock_visibility', COALESCE(p_in->>'lock_visibility','visible'),
    'historical_confidence', COALESCE(p_in->>'historical_confidence','established'),
    'hijri_start_year',  CASE WHEN p_in->>'hijri_start_year'  IS NULL THEN NULL ELSE (p_in->>'hijri_start_year')::int  END,
    'hijri_start_month', CASE WHEN p_in->>'hijri_start_month' IS NULL THEN NULL ELSE (p_in->>'hijri_start_month')::int END,
    'hijri_start_day',   CASE WHEN p_in->>'hijri_start_day'   IS NULL THEN NULL ELSE (p_in->>'hijri_start_day')::int   END,
    'hijri_end_year',    CASE WHEN p_in->>'hijri_end_year'    IS NULL THEN NULL ELSE (p_in->>'hijri_end_year')::int    END,
    'hijri_end_month',   CASE WHEN p_in->>'hijri_end_month'   IS NULL THEN NULL ELSE (p_in->>'hijri_end_month')::int   END,
    'hijri_end_day',     CASE WHEN p_in->>'hijri_end_day'     IS NULL THEN NULL ELSE (p_in->>'hijri_end_day')::int     END,
    'gregorian_start', CASE WHEN NULLIF(p_in->>'gregorian_start','') IS NULL THEN NULL ELSE (p_in->>'gregorian_start')::date END,
    'gregorian_end',   CASE WHEN NULLIF(p_in->>'gregorian_end','')   IS NULL THEN NULL ELSE (p_in->>'gregorian_end')::date   END,
    'story_collection_id', NULLIF(p_in->>'story_collection_id',''),
    'collection_order', CASE WHEN p_in->>'collection_order' IS NULL OR p_in->>'collection_order'='' THEN NULL ELSE (p_in->>'collection_order')::int END,
    'time_precision', COALESCE(p_in->>'time_precision','unknown'),
    'length_class', COALESCE(p_in->>'length_class','standard'),
    'tags', v_tags,
    'snapshot_tier', COALESCE(p_in->>'snapshot_tier','standard'),
    'scenes', v_scenes,
    'relations', v_relations,
    'sources', v_sources
  );
END; $$;

REVOKE ALL ON FUNCTION public._story_canonicalize_incoming_v2(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._story_canonicalize_incoming_v2(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Internal helper: validation issues for one canonicalized story.
-- Never writes. Returns jsonb array of issue codes with details.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public._story_validate_v2_one(p_in jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_issues jsonb := '[]'::jsonb;
  v_id text := p_in->>'id';
  v_slug text := p_in->>'slug';
  v_unlock jsonb := p_in->'unlock_spec';
  v_unlock_report jsonb;
  v_x jsonb;
  v_seen_scene_ids text[] := ARRAY[]::text[];
  v_seen_scene_idx int[] := ARRAY[]::int[];
  v_scene_id text;
  v_scene_idx int;
  v_missing text[] := ARRAY[]::text[];
  v_media_ref text;
BEGIN
  IF v_id IS NULL OR v_id !~ '^[a-z0-9_-]{3,80}$' THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_id','id',v_id));
  END IF;
  IF v_slug IS NULL OR v_slug = '' THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','missing_slug'));
  END IF;
  IF COALESCE(p_in->>'title_ar','') = '' THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','missing_title_ar'));
  END IF;

  -- schema_version must be exactly 2 (frozen scene contract also v2)
  IF COALESCE((p_in->>'schema_version')::int, 2) <> 2 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','wrong_schema_version','value',p_in->>'schema_version'));
  END IF;

  -- Unlock spec — frozen M3 validator is SoT
  IF v_unlock IS NOT NULL THEN
    v_unlock_report := public.validate_unlock_spec_v2(v_unlock);
    IF NOT COALESCE((v_unlock_report->>'ok')::boolean, false) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_unlock_spec','detail',v_unlock_report));
    END IF;
  END IF;

  -- Enum sanity (best-effort; DB will re-check on write)
  BEGIN PERFORM (p_in->>'category')::public.story_category;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','category','value',p_in->>'category')); END;
  BEGIN PERFORM (p_in->>'rarity')::public.story_rarity;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','rarity','value',p_in->>'rarity')); END;
  BEGIN PERFORM (p_in->>'production_status')::public.story_production_status;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','production_status','value',p_in->>'production_status')); END;
  BEGIN PERFORM (p_in->>'lock_visibility')::public.story_lock_visibility;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','lock_visibility','value',p_in->>'lock_visibility')); END;
  BEGIN PERFORM (p_in->>'historical_confidence')::public.story_historical_confidence;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','historical_confidence','value',p_in->>'historical_confidence')); END;
  BEGIN PERFORM (p_in->>'time_precision')::public.story_time_precision;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','time_precision','value',p_in->>'time_precision')); END;
  BEGIN PERFORM (p_in->>'length_class')::public.story_length_class;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','length_class','value',p_in->>'length_class')); END;
  BEGIN PERFORM (p_in->>'snapshot_tier')::public.story_snapshot_tier;
  EXCEPTION WHEN OTHERS THEN v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_enum','field','snapshot_tier','value',p_in->>'snapshot_tier')); END;

  -- Scene sanity
  FOR v_x IN SELECT * FROM jsonb_array_elements(COALESCE(p_in->'scenes','[]'::jsonb)) LOOP
    v_scene_id := v_x->>'id';
    v_scene_idx := COALESCE((v_x->>'scene_index')::int, -1);
    IF v_scene_id IS NULL OR v_scene_id !~ '^[a-z0-9_-]{1,120}$' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_scene_id','id',v_scene_id));
    ELSIF v_scene_id = ANY(v_seen_scene_ids) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','duplicate_scene_id','id',v_scene_id));
    ELSE
      v_seen_scene_ids := array_append(v_seen_scene_ids, v_scene_id);
    END IF;
    IF v_scene_idx < 0 THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','invalid_scene_index','id',v_scene_id));
    ELSIF v_scene_idx = ANY(v_seen_scene_idx) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','duplicate_scene_index','index',v_scene_idx));
    ELSE
      v_seen_scene_idx := array_append(v_seen_scene_idx, v_scene_idx);
    END IF;
    IF COALESCE((v_x->>'schema_version')::int, 2) <> 2 THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','wrong_scene_schema_version','id',v_scene_id));
    END IF;
  END LOOP;

  -- Collection existence (if referenced)
  IF NULLIF(p_in->>'story_collection_id','') IS NOT NULL THEN
    PERFORM 1 FROM public.story_collections WHERE id = p_in->>'story_collection_id';
    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','unknown_collection','id',p_in->>'story_collection_id'));
    END IF;
  END IF;

  -- Missing media (report only; apply requires the media rows to already exist)
  FOR v_media_ref IN
    SELECT DISTINCT ref FROM (
      SELECT NULLIF(p_in->>'cover_media_id','') AS ref
      UNION ALL
      SELECT NULLIF(sc->>'primary_media_id','')
        FROM jsonb_array_elements(COALESCE(p_in->'scenes','[]'::jsonb)) sc
    ) t WHERE ref IS NOT NULL
  LOOP
    PERFORM 1 FROM public.story_media WHERE id::text = v_media_ref;
    IF NOT FOUND THEN
      v_missing := array_append(v_missing, v_media_ref);
    END IF;
  END LOOP;
  IF array_length(v_missing,1) IS NOT NULL THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','missing_media','ids',to_jsonb(v_missing)));
  END IF;

  RETURN v_issues;
END; $$;

REVOKE ALL ON FUNCTION public._story_validate_v2_one(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._story_validate_v2_one(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Public export v2 — deterministic envelope.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_export_stories_v2(p_ids text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_stories jsonb;
  v_collection_ids text[];
  v_media_ids uuid[];
  v_collections jsonb;
  v_media jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN
    SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.stories;
  ELSE
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_ids) x;
  END IF;
  IF v_ids IS NULL THEN v_ids := ARRAY[]::text[]; END IF;

  SELECT COALESCE(jsonb_agg(public._story_export_v2_one(id) ORDER BY id), '[]'::jsonb)
    INTO v_stories
  FROM unnest(v_ids) id;

  -- Referenced collections
  SELECT array_agg(DISTINCT story_collection_id) INTO v_collection_ids
    FROM public.stories WHERE id = ANY(v_ids) AND story_collection_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'slug', c.slug,
    'title_ar', c.title_ar, 'title_en', c.title_en,
    'summary_ar', c.summary_ar, 'summary_en', c.summary_en,
    'cover_media_id', c.cover_media_id,
    'display_order', c.display_order,
    'metadata', c.metadata
  ) ORDER BY c.id), '[]'::jsonb) INTO v_collections
  FROM public.story_collections c
  WHERE v_collection_ids IS NOT NULL AND c.id = ANY(v_collection_ids);

  -- Referenced media (union of story-owned, cover, scene primary)
  SELECT array_agg(DISTINCT m) INTO v_media_ids FROM (
    SELECT m.id AS m FROM public.story_media m WHERE m.story_id = ANY(v_ids)
    UNION
    SELECT s.cover_media_id FROM public.stories s WHERE s.id = ANY(v_ids) AND s.cover_media_id IS NOT NULL
    UNION
    SELECT sc.primary_media_id FROM public.story_scenes sc WHERE sc.story_id = ANY(v_ids) AND sc.primary_media_id IS NOT NULL
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'story_id', m.story_id,
    'owner_scope', m.owner_scope, 'collection_id', m.collection_id,
    'kind', m.kind,
    'storage_bucket', m.storage_bucket, 'storage_path', m.storage_path,
    'mime_type', m.mime_type, 'byte_size', m.byte_size,
    'width', m.width, 'height', m.height,
    'checksum_sha256', m.checksum_sha256,
    'preset', m.preset, 'processing_version', m.processing_version,
    'metadata', m.metadata
  ) ORDER BY m.id::text), '[]'::jsonb) INTO v_media
  FROM public.story_media m
  WHERE v_media_ids IS NOT NULL AND m.id = ANY(v_media_ids);

  RETURN jsonb_build_object(
    'envelope_version', 2,
    'generator', 'irth-m4',
    'exported_at', to_jsonb(now()),
    'story_ids', to_jsonb(COALESCE(v_ids, ARRAY[]::text[])),
    'stories', v_stories,
    'collections', v_collections,
    'media', v_media
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_export_stories_v2(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_export_stories_v2(text[]) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Public preview v2 — never writes.
-- Reports per-story kind (create/update/unchanged/conflict/invalid),
-- validation issues, missing media, and (with allow_deletes=true) the
-- child rows apply would delete.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_import_stories_v2_preview(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allow_deletes boolean := COALESCE((p_options->>'allow_deletes')::boolean, false);
  v_items jsonb := '[]'::jsonb;
  v_in jsonb;
  v_canon jsonb;
  v_current jsonb;
  v_issues jsonb;
  v_kind text;
  v_id text;
  v_slug text;
  v_existing_id text;
  v_scene_deletes text[];
  v_relation_deletes text[];
  v_source_deletes text[];
  v_totals jsonb := jsonb_build_object('create',0,'update',0,'unchanged',0,'conflict',0,'invalid',0);
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((p_payload->>'envelope_version')::int, 0) <> 2 THEN
    RAISE EXCEPTION 'envelope_version_mismatch' USING ERRCODE = '22023';
  END IF;

  FOR v_in IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'stories','[]'::jsonb)) LOOP
    v_canon := public._story_canonicalize_incoming_v2(v_in);
    v_issues := public._story_validate_v2_one(v_canon);
    v_id := v_canon->>'id';
    v_slug := v_canon->>'slug';
    v_scene_deletes := ARRAY[]::text[];
    v_relation_deletes := ARRAY[]::text[];
    v_source_deletes := ARRAY[]::text[];

    IF jsonb_array_length(v_issues) > 0 THEN
      v_kind := 'invalid';
    ELSE
      SELECT id INTO v_existing_id FROM public.stories WHERE id = v_id;
      IF v_existing_id IS NULL THEN
        PERFORM 1 FROM public.stories WHERE slug = v_slug;
        IF FOUND THEN
          v_kind := 'conflict';
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','slug_taken','slug',v_slug));
        ELSE
          v_kind := 'create';
        END IF;
      ELSE
        v_current := public._story_export_v2_one(v_existing_id);
        IF v_current = v_canon THEN
          v_kind := 'unchanged';
        ELSE
          v_kind := 'update';
          -- Compute planned deletes
          SELECT COALESCE(array_agg(sc.id), ARRAY[]::text[]) INTO v_scene_deletes
          FROM public.story_scenes sc
          WHERE sc.story_id = v_id
            AND sc.id NOT IN (SELECT x->>'id' FROM jsonb_array_elements(v_canon->'scenes') x);
          SELECT COALESCE(array_agg(r.id), ARRAY[]::text[]) INTO v_relation_deletes
          FROM public.story_relations r
          WHERE r.story_id = v_id
            AND r.id NOT IN (SELECT x->>'id' FROM jsonb_array_elements(v_canon->'relations') x);
          SELECT COALESCE(array_agg(s.id), ARRAY[]::text[]) INTO v_source_deletes
          FROM public.story_sources s
          WHERE s.story_id = v_id
            AND s.id NOT IN (SELECT x->>'id' FROM jsonb_array_elements(v_canon->'sources') x);
          IF (array_length(v_scene_deletes,1) IS NOT NULL
              OR array_length(v_relation_deletes,1) IS NOT NULL
              OR array_length(v_source_deletes,1) IS NOT NULL)
             AND NOT v_allow_deletes THEN
            v_issues := v_issues || jsonb_build_array(jsonb_build_object(
              'code','deletes_required',
              'scene_ids', to_jsonb(v_scene_deletes),
              'relation_ids', to_jsonb(v_relation_deletes),
              'source_ids', to_jsonb(v_source_deletes)
            ));
            v_kind := 'invalid';
          END IF;
        END IF;
      END IF;
    END IF;

    v_totals := jsonb_set(v_totals, ARRAY[v_kind], to_jsonb(COALESCE((v_totals->>v_kind)::int,0)+1));

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'title_ar', v_canon->>'title_ar',
      'kind', v_kind,
      'issues', v_issues,
      'scene_count', jsonb_array_length(v_canon->'scenes'),
      'relation_count', jsonb_array_length(v_canon->'relations'),
      'source_count', jsonb_array_length(v_canon->'sources'),
      'scene_deletes', to_jsonb(v_scene_deletes),
      'relation_deletes', to_jsonb(v_relation_deletes),
      'source_deletes', to_jsonb(v_source_deletes)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (v_totals->>'invalid')::int = 0 AND (v_totals->>'conflict')::int = 0,
    'envelope_version', 2,
    'totals', v_totals,
    'items', v_items,
    'options', jsonb_build_object('allow_deletes', v_allow_deletes)
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_import_stories_v2_preview(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_v2_preview(jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Public apply v2 — transactional (whole batch, all-or-nothing).
-- Validates first; if any story invalid, returns ok:false with the
-- preview report and performs zero writes. Otherwise applies every
-- story; any unexpected write failure raises and rolls the whole
-- function call back at the caller-transaction level.
--
-- Idempotency: identical canonical → no writes for that story.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_import_stories_v2_apply(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allow_deletes boolean := COALESCE((p_options->>'allow_deletes')::boolean, false);
  v_preview jsonb;
  v_item jsonb;
  v_in jsonb;
  v_canon jsonb;
  v_current jsonb;
  v_id text;
  v_existing text;
  v_kept_scenes text[];
  v_kept_relations text[];
  v_kept_sources text[];
  v_scene jsonb;
  v_relation jsonb;
  v_source jsonb;
  v_results jsonb := '[]'::jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Pre-flight: re-run preview inside the same call. If any invalid or
  -- conflict, abort BEFORE any write. No rollback needed because we've
  -- performed no writes yet.
  v_preview := public.admin_import_stories_v2_preview(p_payload, p_options);
  IF NOT COALESCE((v_preview->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'phase', 'validate',
      'preview', v_preview
    );
  END IF;

  -- Apply per story in stable order (id asc)
  FOR v_in IN
    SELECT x FROM jsonb_array_elements(COALESCE(p_payload->'stories','[]'::jsonb)) x
    ORDER BY x->>'id'
  LOOP
    v_canon := public._story_canonicalize_incoming_v2(v_in);
    v_id := v_canon->>'id';

    SELECT id INTO v_existing FROM public.stories WHERE id = v_id;
    IF v_existing IS NOT NULL THEN
      v_current := public._story_export_v2_one(v_existing);
      IF v_current = v_canon THEN
        v_unchanged := v_unchanged + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'ok', true, 'action', 'unchanged'
        ));
        CONTINUE;
      END IF;
    END IF;

    -- Upsert story row
    INSERT INTO public.stories AS s (
      id, slug, schema_version,
      title_ar, title_en, summary_ar, summary_en,
      world_slug, era, display_order, status,
      unlock_spec, cover_media_id,
      xp_reward, dinar_reward, metadata,
      category, rarity, production_status,
      lock_visibility, historical_confidence,
      hijri_start_year, hijri_start_month, hijri_start_day,
      hijri_end_year, hijri_end_month, hijri_end_day,
      gregorian_start, gregorian_end,
      story_collection_id, collection_order,
      time_precision, length_class, tags, snapshot_tier
    ) VALUES (
      v_id,
      v_canon->>'slug',
      (v_canon->>'schema_version')::int,
      v_canon->>'title_ar',
      v_canon->>'title_en',
      v_canon->>'summary_ar',
      v_canon->>'summary_en',
      v_canon->>'world_slug',
      v_canon->>'era',
      (v_canon->>'display_order')::int,
      v_canon->>'status',
      v_canon->'unlock_spec',
      NULLIF(v_canon->>'cover_media_id','')::uuid,
      (v_canon->>'xp_reward')::int,
      (v_canon->>'dinar_reward')::int,
      v_canon->'metadata',
      (v_canon->>'category')::public.story_category,
      (v_canon->>'rarity')::public.story_rarity,
      (v_canon->>'production_status')::public.story_production_status,
      (v_canon->>'lock_visibility')::public.story_lock_visibility,
      (v_canon->>'historical_confidence')::public.story_historical_confidence,
      CASE WHEN v_canon->>'hijri_start_year'  IS NULL THEN NULL ELSE (v_canon->>'hijri_start_year')::smallint  END,
      CASE WHEN v_canon->>'hijri_start_month' IS NULL THEN NULL ELSE (v_canon->>'hijri_start_month')::smallint END,
      CASE WHEN v_canon->>'hijri_start_day'   IS NULL THEN NULL ELSE (v_canon->>'hijri_start_day')::smallint   END,
      CASE WHEN v_canon->>'hijri_end_year'    IS NULL THEN NULL ELSE (v_canon->>'hijri_end_year')::smallint    END,
      CASE WHEN v_canon->>'hijri_end_month'   IS NULL THEN NULL ELSE (v_canon->>'hijri_end_month')::smallint   END,
      CASE WHEN v_canon->>'hijri_end_day'     IS NULL THEN NULL ELSE (v_canon->>'hijri_end_day')::smallint     END,
      CASE WHEN v_canon->>'gregorian_start' IS NULL THEN NULL ELSE (v_canon->>'gregorian_start')::date END,
      CASE WHEN v_canon->>'gregorian_end'   IS NULL THEN NULL ELSE (v_canon->>'gregorian_end')::date   END,
      NULLIF(v_canon->>'story_collection_id',''),
      CASE WHEN v_canon->>'collection_order' IS NULL THEN NULL ELSE (v_canon->>'collection_order')::int END,
      (v_canon->>'time_precision')::public.story_time_precision,
      (v_canon->>'length_class')::public.story_length_class,
      ARRAY(SELECT jsonb_array_elements_text(v_canon->'tags')),
      (v_canon->>'snapshot_tier')::public.story_snapshot_tier
    )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      schema_version = EXCLUDED.schema_version,
      title_ar = EXCLUDED.title_ar,
      title_en = EXCLUDED.title_en,
      summary_ar = EXCLUDED.summary_ar,
      summary_en = EXCLUDED.summary_en,
      world_slug = EXCLUDED.world_slug,
      era = EXCLUDED.era,
      display_order = EXCLUDED.display_order,
      status = EXCLUDED.status,
      unlock_spec = EXCLUDED.unlock_spec,
      cover_media_id = EXCLUDED.cover_media_id,
      xp_reward = EXCLUDED.xp_reward,
      dinar_reward = EXCLUDED.dinar_reward,
      metadata = EXCLUDED.metadata,
      category = EXCLUDED.category,
      rarity = EXCLUDED.rarity,
      production_status = EXCLUDED.production_status,
      lock_visibility = EXCLUDED.lock_visibility,
      historical_confidence = EXCLUDED.historical_confidence,
      hijri_start_year = EXCLUDED.hijri_start_year,
      hijri_start_month = EXCLUDED.hijri_start_month,
      hijri_start_day = EXCLUDED.hijri_start_day,
      hijri_end_year = EXCLUDED.hijri_end_year,
      hijri_end_month = EXCLUDED.hijri_end_month,
      hijri_end_day = EXCLUDED.hijri_end_day,
      gregorian_start = EXCLUDED.gregorian_start,
      gregorian_end = EXCLUDED.gregorian_end,
      story_collection_id = EXCLUDED.story_collection_id,
      collection_order = EXCLUDED.collection_order,
      time_precision = EXCLUDED.time_precision,
      length_class = EXCLUDED.length_class,
      tags = EXCLUDED.tags,
      snapshot_tier = EXCLUDED.snapshot_tier,
      updated_at = now();

    -- Scenes
    v_kept_scenes := ARRAY[]::text[];
    FOR v_scene IN SELECT * FROM jsonb_array_elements(v_canon->'scenes') LOOP
      v_kept_scenes := array_append(v_kept_scenes, v_scene->>'id');
      INSERT INTO public.story_scenes AS x (
        id, story_id, scene_index, scene_type, schema_version,
        title_ar, title_en, payload, primary_media_id
      ) VALUES (
        v_scene->>'id', v_id,
        (v_scene->>'scene_index')::int,
        v_scene->>'scene_type',
        (v_scene->>'schema_version')::int,
        NULLIF(v_scene->>'title_ar',''),
        NULLIF(v_scene->>'title_en',''),
        COALESCE(v_scene->'payload','{}'::jsonb),
        NULLIF(v_scene->>'primary_media_id','')::uuid
      )
      ON CONFLICT (id) DO UPDATE SET
        story_id = EXCLUDED.story_id,
        scene_index = EXCLUDED.scene_index,
        scene_type = EXCLUDED.scene_type,
        schema_version = EXCLUDED.schema_version,
        title_ar = EXCLUDED.title_ar,
        title_en = EXCLUDED.title_en,
        payload = EXCLUDED.payload,
        primary_media_id = EXCLUDED.primary_media_id,
        updated_at = now();
    END LOOP;
    IF v_allow_deletes THEN
      DELETE FROM public.story_scenes
       WHERE story_id = v_id AND NOT (id = ANY(v_kept_scenes));
    END IF;

    -- Relations
    v_kept_relations := ARRAY[]::text[];
    FOR v_relation IN SELECT * FROM jsonb_array_elements(v_canon->'relations') LOOP
      v_kept_relations := array_append(v_kept_relations, v_relation->>'id');
      INSERT INTO public.story_relations AS x (
        id, story_id, target_type, target_id, target_extra, role,
        notes, display_order, metadata
      ) VALUES (
        v_relation->>'id', v_id,
        (v_relation->>'target_type')::public.story_relation_target_type,
        v_relation->>'target_id',
        COALESCE(v_relation->'target_extra','{}'::jsonb),
        (v_relation->>'role')::public.story_relation_role,
        NULLIF(v_relation->>'notes',''),
        (v_relation->>'display_order')::int,
        COALESCE(v_relation->'metadata','{}'::jsonb)
      )
      ON CONFLICT (id) DO UPDATE SET
        story_id = EXCLUDED.story_id,
        target_type = EXCLUDED.target_type,
        target_id = EXCLUDED.target_id,
        target_extra = EXCLUDED.target_extra,
        role = EXCLUDED.role,
        notes = EXCLUDED.notes,
        display_order = EXCLUDED.display_order,
        metadata = EXCLUDED.metadata;
    END LOOP;
    IF v_allow_deletes THEN
      DELETE FROM public.story_relations
       WHERE story_id = v_id AND NOT (id = ANY(v_kept_relations));
    END IF;

    -- Sources
    v_kept_sources := ARRAY[]::text[];
    FOR v_source IN SELECT * FROM jsonb_array_elements(v_canon->'sources') LOOP
      v_kept_sources := array_append(v_kept_sources, v_source->>'id');
      INSERT INTO public.story_sources AS x (
        id, story_id, source_key, kind, citation, title, author, year, page, url, weight, notes, display_order
      ) VALUES (
        v_source->>'id', v_id,
        v_source->>'source_key',
        (v_source->>'kind')::public.story_source_kind,
        COALESCE(v_source->>'citation',''),
        NULLIF(v_source->>'title',''),
        NULLIF(v_source->>'author',''),
        NULLIF(v_source->>'year',''),
        NULLIF(v_source->>'page',''),
        NULLIF(v_source->>'url',''),
        CASE WHEN v_source->>'weight' IS NULL THEN NULL ELSE (v_source->>'weight')::int END,
        NULLIF(v_source->>'notes',''),
        (v_source->>'display_order')::int
      )
      ON CONFLICT (id) DO UPDATE SET
        story_id = EXCLUDED.story_id,
        source_key = EXCLUDED.source_key,
        kind = EXCLUDED.kind,
        citation = EXCLUDED.citation,
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        year = EXCLUDED.year,
        page = EXCLUDED.page,
        url = EXCLUDED.url,
        weight = EXCLUDED.weight,
        notes = EXCLUDED.notes,
        display_order = EXCLUDED.display_order;
    END LOOP;
    IF v_allow_deletes THEN
      DELETE FROM public.story_sources
       WHERE story_id = v_id AND NOT (id = ANY(v_kept_sources));
    END IF;

    IF v_existing IS NULL THEN
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'ok', true, 'action', 'created'
      ));
    ELSE
      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'ok', true, 'action', 'updated'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'phase', 'apply',
    'envelope_version', 2,
    'totals', jsonb_build_object(
      'created', v_created,
      'updated', v_updated,
      'unchanged', v_unchanged
    ),
    'items', v_results
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_import_stories_v2_apply(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_v2_apply(jsonb, jsonb) TO authenticated, service_role;
