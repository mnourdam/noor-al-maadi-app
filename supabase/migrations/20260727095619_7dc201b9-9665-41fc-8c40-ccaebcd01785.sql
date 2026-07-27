-- ============================================================
-- Canonical unified reflections source.
-- Every reflection kind (encyclopedia/story comments, campaign &
-- story private reflections, and any future kind) projects into
-- ONE row shape here. Adding a new kind = adding a UNION branch,
-- never a new client query.
-- ============================================================
CREATE OR REPLACE VIEW public.reflections_unified_v1 AS
  SELECT
    c.id::text                                   AS id,
    'comment'::text                              AS source,
    c.author_id                                  AS author_id,
    c.anchor_type::text                          AS anchor_type,
    c.anchor_id                                  AS anchor_id,
    c.body_text                                  AS body,
    COALESCE(c.helpful_count, 0)                 AS likes,
    (SELECT count(*)::int FROM public.social_comments r
      WHERE r.anchor_type = 'comment'
        AND r.anchor_id = c.id::text
        AND r.status = 'visible')                AS replies,
    c.status                                     AS status,
    c.created_at                                 AS created_at,
    c.updated_at                                 AS updated_at
    FROM public.social_comments c
   WHERE c.status <> 'removed'
     AND c.anchor_type <> 'comment'
     AND COALESCE(NULLIF(btrim(c.body_text), ''), '') <> ''
  UNION ALL
  SELECT
    r.id::text                                   AS id,
    'reflection'::text                           AS source,
    r.user_id                                    AS author_id,
    COALESCE(NULLIF(r.source_type, ''), 'campaign')::text AS anchor_type,
    COALESCE(NULLIF(r.source_id, ''), r.campaign_id)      AS anchor_id,
    COALESCE(NULLIF(btrim(r.note), ''), NULLIF(btrim(r.choice_value), ''), '') AS body,
    0                                            AS likes,
    0                                            AS replies,
    'visible'::text                              AS status,
    r.created_at                                 AS created_at,
    r.updated_at                                 AS updated_at
    FROM public.user_reflections r
   WHERE COALESCE(NULLIF(btrim(r.note), ''), NULLIF(btrim(r.choice_value), ''), '') <> '';

REVOKE ALL ON public.reflections_unified_v1 FROM anon, authenticated;

-- ============================================================
-- Personal archive feed — one source, author-scoped.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_my_reflections_v1(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  SELECT count(*)::int INTO v_total
    FROM public.reflections_unified_v1 u
   WHERE u.author_id = uid;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT p.*,
        CASE p.anchor_type
          WHEN 'entity' THEN (SELECT e.title FROM public.encyclopedia_entities e
                               WHERE e.id::text = p.anchor_id OR e.slug = p.anchor_id LIMIT 1)
          WHEN 'story'  THEN (SELECT s.title_ar FROM public.stories s
                               WHERE s.id::text = p.anchor_id OR s.slug = p.anchor_id LIMIT 1)
          WHEN 'campaign' THEN (SELECT ac.title FROM public.admin_campaigns ac
                                 WHERE ac.id::text = p.anchor_id OR ac.slug = p.anchor_id LIMIT 1)
          ELSE NULL
        END AS anchor_title
        FROM (
          SELECT u.* FROM public.reflections_unified_v1 u
           WHERE u.author_id = uid
           ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC
           LIMIT v_limit OFFSET v_offset
        ) p
    ) t;

  RETURN jsonb_build_object('ok', true, 'items', v_items, 'total', v_total,
                            'has_more', (v_offset + v_limit) < v_total);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.list_my_reflections_v1(integer, integer) TO authenticated;

-- ============================================================
-- Public reflection lists now carry the author display name only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_comments_v2(
  p_anchor_type social_anchor_type,
  p_anchor_id text,
  p_sort text DEFAULT 'editors_helpful_new',
  p_cursor text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_limit int := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_uid uuid := auth.uid();
  v_editors jsonb := '[]'::jsonb; v_items jsonb := '[]'::jsonb;
  v_next text := NULL; v_cursor jsonb; v_rows jsonb; v_has_more boolean; v_last jsonb;
BEGIN
  IF p_sort NOT IN ('editors_helpful_new','newest') THEN p_sort := 'editors_helpful_new'; END IF;
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    BEGIN v_cursor := convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN v_cursor := NULL; END;
  END IF;

  IF p_sort = 'editors_helpful_new' AND v_cursor IS NULL THEN
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.editors_note_rank NULLS LAST, t.created_at DESC), '[]'::jsonb)
      INTO v_editors
      FROM (
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id
           AND sc.status = 'visible' AND sc.editors_note = TRUE
         ORDER BY sc.editors_note_rank NULLS LAST, sc.created_at DESC LIMIT 3) t;
  END IF;

  IF p_sort = 'editors_helpful_new' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY (p.helpful_count) DESC, p.created_at DESC, p.id DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id
           AND sc.status = 'visible' AND sc.editors_note = FALSE
           AND ( v_cursor IS NULL OR (sc.helpful_count, sc.created_at, sc.id) < (
                   (v_cursor->>'hc')::int, (v_cursor->>'ts')::timestamptz, (v_cursor->>'id')::uuid))
         ORDER BY sc.helpful_count DESC, sc.created_at DESC, sc.id DESC LIMIT v_limit + 1) p;
    v_has_more := jsonb_array_length(v_rows) > v_limit;
    IF v_has_more THEN
      v_items := (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS a(elem, ord) ORDER BY ord LIMIT v_limit) s);
      v_last := v_items->(v_limit - 1);
      v_next := encode(convert_to(jsonb_build_object(
        'hc', (v_last->>'helpful_count')::int, 'ts', v_last->>'created_at', 'id', v_last->>'id')::text, 'UTF8'), 'base64');
    ELSE v_items := v_rows; END IF;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id AND sc.status = 'visible'
           AND ( v_cursor IS NULL OR (sc.created_at, sc.id) < (
                   (v_cursor->>'ts')::timestamptz, (v_cursor->>'id')::uuid))
         ORDER BY sc.created_at DESC, sc.id DESC LIMIT v_limit + 1) p;
    v_has_more := jsonb_array_length(v_rows) > v_limit;
    IF v_has_more THEN
      v_items := (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS a(elem, ord) ORDER BY ord LIMIT v_limit) s);
      v_last := v_items->(v_limit - 1);
      v_next := encode(convert_to(jsonb_build_object('ts', v_last->>'created_at', 'id', v_last->>'id')::text, 'UTF8'), 'base64');
    ELSE v_items := v_rows; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'sort', p_sort,
    'editors_notes', v_editors, 'items', v_items, 'next_cursor', v_next,
    'total_visible', (SELECT COUNT(*) FROM public.social_comments
       WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND status = 'visible'));
END
$fn$;

GRANT EXECUTE ON FUNCTION public.list_comments_v2(social_anchor_type, text, text, text, integer) TO anon, authenticated;