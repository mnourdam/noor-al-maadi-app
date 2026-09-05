-- ============================================================
-- V17-07A — Encyclopedia comment hearts
-- Scope: comment hearts only. No replies.
-- Authored against LIVE definitions read on 2026-09-05.
-- ============================================================

-- 1) First-heart notice ledger (comment hearts only) ---------
CREATE TABLE IF NOT EXISTS public.comment_heart_notices (
  comment_id   uuid        NOT NULL,
  actor_id     uuid        NOT NULL,
  recipient_id uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, actor_id)
);

-- Access is RPC-only through SECURITY DEFINER functions, matching the
-- social_comments / personal_notifications pattern. anon and authenticated
-- deliberately receive no privileges.
GRANT ALL ON public.comment_heart_notices TO service_role;
ALTER TABLE public.comment_heart_notices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS comment_heart_notices_recipient_idx
  ON public.comment_heart_notices (recipient_id, created_at DESC);

-- 2) helpful_count maintained transactionally ----------------
-- Extends the LIVE trigger with a 'comment' branch. The 'story' branch is
-- byte-identical to the live definition.
CREATE OR REPLACE FUNCTION public.social_reactions_sync_counter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_anchor public.social_anchor_type; v_id text; v_delta int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_anchor := NEW.anchor_type; v_id := NEW.anchor_id; v_delta := 1;
  ELSIF TG_OP = 'DELETE' THEN
    v_anchor := OLD.anchor_type; v_id := OLD.anchor_id; v_delta := -1;
  ELSE RETURN NULL;
  END IF;
  IF v_anchor = 'story' THEN
    UPDATE public.stories
       SET reaction_count = GREATEST(0, COALESCE(reaction_count, 0) + v_delta)
     WHERE id = v_id;
  ELSIF v_anchor = 'comment' THEN
    UPDATE public.social_comments
       SET helpful_count = GREATEST(0, COALESCE(helpful_count, 0) + v_delta)
     WHERE id::text = v_id;
  END IF;
  RETURN NULL;
END $function$;

-- 3) Backfill helpful_count from the source of truth ---------
UPDATE public.social_comments sc
   SET helpful_count = COALESCE(t.c, 0)
  FROM (
    SELECT sc2.id,
           (SELECT COUNT(*)::int FROM public.social_reactions r
             WHERE r.anchor_type = 'comment' AND r.anchor_id = sc2.id::text) AS c
      FROM public.social_comments sc2
  ) t
 WHERE sc.id = t.id
   AND sc.helpful_count IS DISTINCT FROM COALESCE(t.c, 0);

-- 4) Rebuild tool now repairs comments too -------------------
CREATE OR REPLACE FUNCTION public.rebuild_reaction_counters()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stories INTEGER;
  v_comments INTEGER;
BEGIN
  WITH truth AS (
    SELECT anchor_id, COUNT(*)::INT AS c
      FROM public.social_reactions
     WHERE anchor_type = 'story'
     GROUP BY anchor_id
  )
  UPDATE public.stories s
     SET reaction_count = COALESCE(t.c, 0)
    FROM (
      SELECT s2.id, COALESCE(truth.c, 0) AS c
        FROM public.stories s2
        LEFT JOIN truth ON truth.anchor_id = s2.id
    ) AS t
   WHERE s.id = t.id
     AND s.reaction_count IS DISTINCT FROM t.c;

  GET DIAGNOSTICS v_stories = ROW_COUNT;

  WITH ctruth AS (
    SELECT anchor_id, COUNT(*)::INT AS c
      FROM public.social_reactions
     WHERE anchor_type = 'comment'
     GROUP BY anchor_id
  )
  UPDATE public.social_comments sc
     SET helpful_count = COALESCE(t.c, 0)
    FROM (
      SELECT sc2.id, COALESCE(ctruth.c, 0) AS c
        FROM public.social_comments sc2
        LEFT JOIN ctruth ON ctruth.anchor_id = sc2.id::text
    ) AS t
   WHERE sc.id = t.id
     AND sc.helpful_count IS DISTINCT FROM t.c;

  GET DIAGNOSTICS v_comments = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'stories_updated', v_stories,
                            'comments_updated', v_comments);
END;
$function$;

-- 5) toggle_reaction_v2 — first-heart notification dedupe ----
-- Every branch below is identical to the LIVE definition except the
-- comment-heart notification block, which now emits only once per
-- (comment, actor).
CREATE OR REPLACE FUNCTION public.toggle_reaction_v2(p_anchor_type social_anchor_type, p_anchor_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_existed boolean; v_count int; v_active boolean;
  v_comment public.social_comments; v_story record; v_entity record;
  v_at text := p_anchor_type::text;
  v_first_notice int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;

  IF v_at = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;
  ELSIF v_at = 'entity' THEN
    IF NOT EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id::text = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;
  ELSIF v_at = 'comment' THEN
    SELECT * INTO v_comment FROM public.social_comments WHERE id::text = p_anchor_id;
    IF NOT FOUND OR v_comment.status <> 'visible' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;
  ELSE RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_anchor');
  END IF;

  DELETE FROM public.social_reactions
   WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND user_id = v_uid
   RETURNING TRUE INTO v_existed;

  IF v_existed IS NOT TRUE THEN
    INSERT INTO public.social_reactions (anchor_type, anchor_id, user_id)
    VALUES (p_anchor_type, p_anchor_id, v_uid);
    v_active := TRUE;
  ELSE v_active := FALSE; END IF;

  SELECT COUNT(*) INTO v_count FROM public.social_reactions
   WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id;

  IF v_active AND v_at = 'comment' AND v_comment.author_id <> v_uid THEN
    -- Notify only on the FIRST heart this actor ever gives this comment.
    INSERT INTO public.comment_heart_notices (comment_id, actor_id, recipient_id)
    VALUES (v_comment.id, v_uid, v_comment.author_id)
    ON CONFLICT (comment_id, actor_id) DO NOTHING;
    GET DIAGNOSTICS v_first_notice = ROW_COUNT;

    IF v_first_notice = 1 THEN
      IF v_comment.anchor_type::text = 'entity' THEN
        SELECT e.id::text AS id, COALESCE(e.title, '') AS title_ar INTO v_entity
          FROM public.encyclopedia_entities e WHERE e.id::text = v_comment.anchor_id;
        PERFORM public._emit_personal_notification(
          v_comment.author_id, 'story_reaction_on_comment',
          'comment'::public.social_anchor_type, v_comment.id::text,
          'reactions', v_uid,
          jsonb_build_object('anchor_type','entity','anchor_id',v_comment.anchor_id,
            'anchor_title', COALESCE(v_entity.title_ar,''),
            'comment_id', v_comment.id::text,
            'comment_preview', LEFT(v_comment.body_text,120)), TRUE);
      ELSE
        SELECT s.id AS story_id, s.title_ar INTO v_story
          FROM public.stories s WHERE s.id = v_comment.anchor_id;
        PERFORM public._emit_personal_notification(
          v_comment.author_id, 'story_reaction_on_comment',
          'comment'::public.social_anchor_type, v_comment.id::text,
          'reactions', v_uid,
          jsonb_build_object('anchor_type','story','anchor_id',v_comment.anchor_id,
            'anchor_title', COALESCE(v_story.title_ar,''),
            'story_id', v_comment.anchor_id,
            'story_title', COALESCE(v_story.title_ar,''),
            'comment_id', v_comment.id::text,
            'comment_preview', LEFT(v_comment.body_text,120)), TRUE);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', v_active, 'count', v_count);
END $function$;

-- 6) Close the direct-write bypass ---------------------------
-- Preflight proved no client or server code writes social_reactions
-- directly; every mutation goes through toggle_reaction_v2 (SECURITY
-- DEFINER). Reads stay untouched.
DROP POLICY IF EXISTS reactions_insert_own ON public.social_reactions;
DROP POLICY IF EXISTS reactions_delete_own ON public.social_reactions;
REVOKE INSERT, UPDATE, DELETE ON public.social_reactions FROM authenticated;

-- 7) list_comments_v2 — viewer heart state -------------------
-- Identical to LIVE except each item gains `my_heart`. Ordering, keyset
-- cursor, moderation filter, editor's notes, author metadata and the
-- response envelope are unchanged.
CREATE OR REPLACE FUNCTION public.list_comments_v2(p_anchor_type social_anchor_type, p_anchor_id text, p_sort text DEFAULT 'editors_helpful_new'::text, p_cursor text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
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
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
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
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
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
$function$;

-- Supporting index for the viewer-heart EXISTS probe and count reads.
CREATE INDEX IF NOT EXISTS social_reactions_comment_anchor_user_idx
  ON public.social_reactions (anchor_id, user_id)
  WHERE anchor_type = 'comment';
