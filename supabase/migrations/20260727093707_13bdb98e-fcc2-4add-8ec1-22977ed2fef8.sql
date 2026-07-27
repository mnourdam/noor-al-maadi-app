CREATE OR REPLACE FUNCTION public.list_my_reflections_v1(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_items jsonb;
  v_total int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH mine AS (
    SELECT
      c.id::text                AS id,
      'comment'::text           AS source,
      c.anchor_type::text       AS anchor_type,
      c.anchor_id               AS anchor_id,
      c.body_text               AS body,
      c.created_at              AS created_at,
      c.updated_at              AS updated_at,
      COALESCE(c.helpful_count, 0) AS likes,
      (SELECT count(*) FROM public.social_comments r
        WHERE r.anchor_type = 'comment' AND r.anchor_id = c.id::text AND r.status = 'visible')::int AS replies,
      c.status                  AS status
      FROM public.social_comments c
     WHERE c.author_id = uid
       AND c.status <> 'removed'
    UNION ALL
    SELECT
      r.id::text                AS id,
      'reflection'::text        AS source,
      COALESCE(r.kind, 'campaign')::text AS anchor_type,
      COALESCE(r.source_id, r.campaign_id) AS anchor_id,
      COALESCE(NULLIF(r.text, ''), r.choice_value, '') AS body,
      r.created_at              AS created_at,
      r.updated_at              AS updated_at,
      0                         AS likes,
      0                         AS replies,
      'visible'::text           AS status
      FROM public.user_reflections r
     WHERE r.user_id = uid
       AND COALESCE(NULLIF(r.text, ''), r.choice_value, '') <> ''
  ),
  page AS (
    SELECT * FROM mine ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT v_limit OFFSET v_offset
  ),
  titled AS (
    SELECT p.*,
      COALESCE(
        CASE WHEN p.anchor_type = 'entity'
          THEN (SELECT e.title FROM public.encyclopedia_entities e
                 WHERE e.id::text = p.anchor_id OR e.slug = p.anchor_id LIMIT 1) END,
        CASE WHEN p.anchor_type = 'story'
          THEN (SELECT s.title_ar FROM public.stories s
                 WHERE s.id::text = p.anchor_id OR s.slug = p.anchor_id LIMIT 1) END,
        CASE WHEN p.anchor_type = 'campaign'
          THEN (SELECT ac.title FROM public.admin_campaigns ac
                 WHERE ac.id::text = p.anchor_id OR ac.slug = p.anchor_id LIMIT 1) END
      ) AS anchor_title
      FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC), '[]'::jsonb),
    (SELECT count(*)::int FROM mine)
    INTO v_items, v_total
  FROM titled t;

  RETURN jsonb_build_object('ok', true, 'items', v_items, 'total', v_total,
                            'has_more', (v_offset + v_limit) < v_total);
END $$;

REVOKE ALL ON FUNCTION public.list_my_reflections_v1(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_my_reflections_v1(integer, integer) TO authenticated;