CREATE OR REPLACE FUNCTION public.admin_export_investigations(
  p_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total INT;
  v_rows JSONB;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::INT INTO v_total
    FROM public.investigations i
   WHERE p_ids IS NULL OR i.id = ANY(p_ids);

  SELECT COALESCE(jsonb_agg(row_json ORDER BY ord), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      row_number() OVER (ORDER BY i.slug ASC, i.id ASC) AS ord,
      jsonb_build_object(
        'id',                      i.id,
        'slug',                    i.slug,
        'title',                   i.title,
        'title_ar',                i.title,
        'title_en',               NULL,
        'subtitle',                i.subtitle,
        'description',             i.description,
        'difficulty',              i.difficulty,
        'enabled',                 i.enabled,
        'status',                  CASE WHEN i.enabled THEN 'enabled' ELSE 'disabled' END,
        'reward',                  COALESCE(i.reward, '{}'::jsonb),
        'steps',                   COALESCE(i.steps, '[]'::jsonb),
        'related_entities',        COALESCE(i.related_entities, '[]'::jsonb),
        'draft_data',              i.draft_data,
        'content_version',         i.content_version,
        'published_at',            i.published_at,
        'has_unpublished_changes', i.has_unpublished_changes,
        'last_editor_email',       i.last_editor_email,
        'last_draft_saved_at',     i.last_draft_saved_at,
        'updated_by',              i.updated_by,
        'created_at',              i.created_at,
        'updated_at',              i.updated_at
      ) AS row_json
      FROM public.investigations i
     WHERE p_ids IS NULL OR i.id = ANY(p_ids)
     ORDER BY i.slug ASC, i.id ASC
     LIMIT v_limit OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_export_investigations(uuid[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_export_investigations(uuid[], integer, integer) TO authenticated;