CREATE OR REPLACE FUNCTION public._story_validate_v2_one(p_in jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF COALESCE((p_in->>'schema_version')::int, 2) <> 2 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','wrong_schema_version','value',p_in->>'schema_version'));
  END IF;

  -- Unlock spec: validate the SAME normalized value that apply writes.
  IF v_unlock IS NOT NULL AND jsonb_typeof(v_unlock) <> 'null' THEN
    v_unlock_report := public.validate_unlock_spec_v2(public._story_normalize_unlock_v2(v_unlock));
    IF NOT COALESCE((v_unlock_report->>'ok')::boolean, false) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code','invalid_unlock_spec',
        'detail',v_unlock_report,
        'errors', COALESCE(v_unlock_report->'errors','[]'::jsonb),
        'message', (
          SELECT string_agg(COALESCE(e->>'path','$') || ': ' || COALESCE(e->>'message', e->>'code'), ' | ')
            FROM jsonb_array_elements(COALESCE(v_unlock_report->'errors','[]'::jsonb)) e
        ),
        'normalized', public._story_normalize_unlock_v2(v_unlock)
      ));
    END IF;
  END IF;

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

  IF NULLIF(p_in->>'story_collection_id','') IS NOT NULL THEN
    PERFORM 1 FROM public.story_collections WHERE id = p_in->>'story_collection_id';
    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','unknown_collection','id',p_in->>'story_collection_id'));
    END IF;
  END IF;

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
END; $function$;