CREATE OR REPLACE FUNCTION public.list_moderator_queue_v2(
  p_status TEXT DEFAULT 'open',
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_lim INT  := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_items JSONB;
  v_next  TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_status NOT IN ('open','actioned','dismissed','all') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  WITH scoped AS (
    SELECT r.*
      FROM public.social_comment_reports r
     WHERE (p_status = 'all' OR r.status = p_status)
       AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ),
  grouped AS (
    SELECT
      s.comment_id,
      MAX(s.created_at)                                   AS last_report_at,
      COUNT(*)                                            AS report_count,
      (ARRAY_AGG(s.reason ORDER BY s.created_at DESC))[1] AS top_reason,
      MAX(s.status)                                       AS any_status
    FROM scoped s
    GROUP BY s.comment_id
    ORDER BY MAX(s.created_at) DESC
    LIMIT v_lim + 1
  ),
  enriched AS (
    SELECT
      g.*,
      c.author_id,
      c.anchor_type,
      c.anchor_id,
      c.status AS comment_status,
      c.body_text,
      c.created_at AS comment_created_at,
      c.editors_note,
      c.moderated_at,
      c.moderated_by,
      row_number() OVER (ORDER BY g.last_report_at DESC, g.comment_id DESC) AS rn
    FROM grouped g
    LEFT JOIN public.social_comments c ON c.id = g.comment_id
  ),
  page_rows AS (
    SELECT * FROM enriched WHERE rn <= v_lim
  ),
  next_row AS (
    SELECT last_report_at FROM enriched WHERE rn = v_lim + 1 LIMIT 1
  )
  SELECT
    (SELECT jsonb_agg(to_jsonb(p.*) - 'rn' ORDER BY p.last_report_at DESC, p.comment_id DESC) FROM page_rows p),
    (SELECT n.last_report_at FROM next_row n)
    INTO v_items, v_next;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb),
    'next_cursor', v_next
  );
END
$function$;

REVOKE ALL ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) TO service_role;