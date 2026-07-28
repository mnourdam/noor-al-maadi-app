CREATE OR REPLACE FUNCTION public.admin_export_campaigns(p_ids text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
  v_total int;
BEGIN
  IF NOT public.is_user_manager() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO v_total
    FROM public.admin_campaigns c
   WHERE p_ids IS NULL OR c.id = ANY(p_ids);

  SELECT COALESCE(jsonb_agg(row_json ORDER BY ord), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      row_number() OVER (
        ORDER BY
          COALESCE((c.data->>'chronological_order')::numeric, 1e9),
          c.title ASC,
          c.id ASC
      ) AS ord,
      jsonb_build_object(
        'id',                      c.id,
        'slug',                    c.slug,
        'title',                   c.title,
        'status',                  c.status,
        'content_version',         c.content_version,
        'published_at',            c.published_at,
        'has_unpublished_changes', c.has_unpublished_changes,
        'updated_by',              c.updated_by,
        'last_editor_email',       c.last_editor_email,
        'created_at',              c.created_at,
        'updated_at',              c.updated_at,
        'key_art', jsonb_build_object(
          'path',        c.key_art_path,
          'square_path', c.key_art_square_path,
          'credit',      c.key_art_credit,
          'source',      c.key_art_source
        ),
        -- verbatim, lossless content documents
        'data',       c.data,
        'draft_data', c.draft_data,
        'versions_count', (
          SELECT count(*)::int FROM public.admin_campaign_versions v
           WHERE v.campaign_id = c.id
        ),
        'inbound_story_relations', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',            r.id,
            'story_id',      r.story_id,
            'target_type',   r.target_type,
            'target_id',     r.target_id,
            'target_extra',  r.target_extra,
            'role',          r.role,
            'notes',         r.notes,
            'display_order', r.display_order,
            'metadata',      r.metadata
          ) ORDER BY r.display_order, r.id), '[]'::jsonb)
          FROM public.story_relations r
          WHERE r.target_type = 'campaign'
            AND (r.target_id = c.id OR r.target_id = c.slug)
        )
      ) AS row_json
    FROM public.admin_campaigns c
    WHERE p_ids IS NULL OR c.id = ANY(p_ids)
  ) q;

  RETURN jsonb_build_object(
    'total', v_total,
    'rows',  v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_export_campaigns(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_campaigns(text[]) TO authenticated, service_role;