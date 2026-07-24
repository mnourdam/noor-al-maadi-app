-- Widen story_sources.weight to numeric to accept fractional weights (e.g. 0.9)
-- and update the incoming canonicalizer to preserve numeric precision.
-- Frozen contract adjustment authorized by user for Golden Template import.

ALTER TABLE public.story_sources ALTER COLUMN weight TYPE numeric USING weight::numeric;

CREATE OR REPLACE FUNCTION public._story_canonicalize_incoming_v2(p_in jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_scenes jsonb;
  v_relations jsonb;
  v_sources jsonb;
BEGIN
  v_scenes := (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', x->>'id',
      'scene_index', (x->>'scene_index')::int,
      'scene_type', x->>'scene_type',
      'schema_version', COALESCE((x->>'schema_version')::int, 2),
      'title_ar', NULLIF(x->>'title_ar',''),
      'title_en', NULLIF(x->>'title_en',''),
      'payload', COALESCE(x->'payload', '{}'::jsonb),
      'primary_media_id', NULLIF(x->>'primary_media_id','')
    ) ORDER BY (x->>'scene_index')::int), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(p_in->'scenes','[]'::jsonb)) x
  );

  v_relations := (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', x->>'id',
      'target_type', x->>'target_type',
      'target_id', x->>'target_id',
      'target_extra', COALESCE(x->'target_extra', '{}'::jsonb),
      'role', x->>'role',
      'notes', NULLIF(x->>'notes',''),
      'display_order', COALESCE((x->>'display_order')::int, 0),
      'metadata', COALESCE(x->'metadata', '{}'::jsonb)
    ) ORDER BY x->>'target_type', x->>'target_id', x->>'role', x->>'id'), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(p_in->'relations','[]'::jsonb)) x
  );

  v_sources := (
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
      'weight', CASE WHEN x->>'weight' IS NULL OR x->>'weight'='' THEN NULL ELSE (x->>'weight')::numeric END,
      'notes', NULLIF(x->>'notes',''),
      'display_order', COALESCE((x->>'display_order')::int, 0)
    ) ORDER BY x->>'source_key', x->>'id'), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(p_in->'sources','[]'::jsonb)) x
  );

  RETURN jsonb_build_object(
    'id', p_in->>'id',
    'slug', p_in->>'slug',
    'schema_version', COALESCE((p_in->>'schema_version')::int, 2),
    'title_ar', p_in->>'title_ar',
    'title_en', NULLIF(p_in->>'title_en',''),
    'summary_ar', NULLIF(p_in->>'summary_ar',''),
    'summary_en', NULLIF(p_in->>'summary_en',''),
    'world_slug', NULLIF(p_in->>'world_slug',''),
    'era', NULLIF(p_in->>'era',''),
    'display_order', COALESCE((p_in->>'display_order')::int, 0),
    'status', COALESCE(p_in->>'status','draft'),
    'unlock_spec', COALESCE(p_in->'unlock_spec', jsonb_build_object('version',2,'expr',jsonb_build_object('type','always'))),
    'cover_media_id', NULLIF(p_in->>'cover_media_id',''),
    'xp_reward', COALESCE((p_in->>'xp_reward')::int, 0),
    'dinar_reward', COALESCE((p_in->>'dinar_reward')::int, 0),
    'metadata', COALESCE(p_in->'metadata', '{}'::jsonb),
    'category', COALESCE(p_in->>'category','event'),
    'rarity', COALESCE(p_in->>'rarity','standard'),
    'production_status', COALESCE(p_in->>'production_status','idea'),
    'lock_visibility', COALESCE(p_in->>'lock_visibility','visible'),
    'historical_confidence', COALESCE(p_in->>'historical_confidence','established'),
    'hijri_start_year',  CASE WHEN p_in->>'hijri_start_year'  IS NULL OR p_in->>'hijri_start_year'  ='' THEN NULL ELSE (p_in->>'hijri_start_year')::int  END,
    'hijri_start_month', CASE WHEN p_in->>'hijri_start_month' IS NULL OR p_in->>'hijri_start_month' ='' THEN NULL ELSE (p_in->>'hijri_start_month')::int END,
    'hijri_start_day',   CASE WHEN p_in->>'hijri_start_day'   IS NULL OR p_in->>'hijri_start_day'   ='' THEN NULL ELSE (p_in->>'hijri_start_day')::int   END,
    'hijri_end_year',    CASE WHEN p_in->>'hijri_end_year'    IS NULL OR p_in->>'hijri_end_year'    ='' THEN NULL ELSE (p_in->>'hijri_end_year')::int    END,
    'hijri_end_month',   CASE WHEN p_in->>'hijri_end_month'   IS NULL OR p_in->>'hijri_end_month'   ='' THEN NULL ELSE (p_in->>'hijri_end_month')::int   END,
    'hijri_end_day',     CASE WHEN p_in->>'hijri_end_day'     IS NULL OR p_in->>'hijri_end_day'     ='' THEN NULL ELSE (p_in->>'hijri_end_day')::int     END,
    'gregorian_start', NULLIF(p_in->>'gregorian_start',''),
    'gregorian_end',   NULLIF(p_in->>'gregorian_end',''),
    'story_collection_id', NULLIF(p_in->>'story_collection_id',''),
    'collection_order',    CASE WHEN p_in->>'collection_order' IS NULL OR p_in->>'collection_order'='' THEN NULL ELSE (p_in->>'collection_order')::int END,
    'time_precision', COALESCE(p_in->>'time_precision','unknown'),
    'length_class',   COALESCE(p_in->>'length_class','standard'),
    'tags', COALESCE(p_in->'tags', '[]'::jsonb),
    'snapshot_tier', COALESCE(p_in->>'snapshot_tier','standard'),
    'scenes', v_scenes,
    'relations', v_relations,
    'sources', v_sources
  );
END;
$fn$;