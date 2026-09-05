-- ============================================================
-- V17-07B — One-level Encyclopedia comment replies
-- Every CREATE OR REPLACE below is derived from the CURRENT LIVE
-- definition; only the approved reply-related predicates differ.
-- ============================================================

-- 1. Schema -------------------------------------------------
ALTER TABLE public.social_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid NULL
    REFERENCES public.social_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS social_comments_parent_idx
  ON public.social_comments (parent_comment_id, created_at, id)
  WHERE status = 'visible' AND parent_comment_id IS NOT NULL;

-- 2. Heart-notice ledger gains a real FK (V17-07A debt) -----
DELETE FROM public.comment_heart_notices n
 WHERE NOT EXISTS (SELECT 1 FROM public.social_comments c WHERE c.id = n.comment_id);

ALTER TABLE public.comment_heart_notices
  DROP CONSTRAINT IF EXISTS comment_heart_notices_comment_id_fkey;
ALTER TABLE public.comment_heart_notices
  ADD CONSTRAINT comment_heart_notices_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES public.social_comments(id) ON DELETE CASCADE;

-- 3. Orphan reaction cleanup on physical comment deletion ---
CREATE OR REPLACE FUNCTION public.social_comments_cleanup_reactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.social_reactions
   WHERE anchor_type = 'comment' AND anchor_id = OLD.id::text;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS social_comments_cleanup_reactions_trg ON public.social_comments;
CREATE TRIGGER social_comments_cleanup_reactions_trg
AFTER DELETE ON public.social_comments
FOR EACH ROW EXECUTE FUNCTION public.social_comments_cleanup_reactions();

-- 4. Notification kind --------------------------------------
ALTER TABLE public.personal_notifications
  DROP CONSTRAINT IF EXISTS personal_notifications_kind_chk;
ALTER TABLE public.personal_notifications
  ADD CONSTRAINT personal_notifications_kind_chk CHECK (kind = ANY (ARRAY[
    'story_reaction_on_comment'::text,
    'comment_promoted_editor_note'::text,
    'comment_marked_contribution'::text,
    'comment_contribution_applied'::text,
    'comment_hidden'::text,
    'comment_restored'::text,
    'story_unlocked'::text,
    'comment_reply'::text
  ]));

-- 5. Shared reply-rendering helper --------------------------
CREATE OR REPLACE FUNCTION public._comment_replies_json_v1(
  p_parent uuid, p_uid uuid, p_limit int DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at ASC, t.id ASC), '[]'::jsonb)
    FROM (
      SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.parent_comment_id,
             sc.author_id, sc.body_text, sc.status,
             sc.helpful_count, sc.editors_note, sc.editors_note_rank,
             sc.edited_at, sc.created_at, sc.edit_deadline_at,
             (sc.author_id = p_uid) AS is_mine,
             (p_uid IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.social_reactions r
                 WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                   AND r.user_id = p_uid)) AS my_heart,
             COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name
        FROM public.social_comments sc
        LEFT JOIN public.profiles pr ON pr.id = sc.author_id
       WHERE sc.parent_comment_id = p_parent
         AND sc.status = 'visible'
       ORDER BY sc.created_at ASC, sc.id ASC
       LIMIT GREATEST(coalesce(p_limit, 3), 0)
    ) t
$function$;

-- 6. list_comments_v2 — LIVE body + top-level predicates + replies
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
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.parent_comment_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name,
               (SELECT COUNT(*) FROM public.social_comments rc
                 WHERE rc.parent_comment_id = sc.id AND rc.status = 'visible') AS reply_count,
               public._comment_replies_json_v1(sc.id, v_uid, 3) AS replies
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id
           AND sc.parent_comment_id IS NULL
           AND sc.status = 'visible' AND sc.editors_note = TRUE
         ORDER BY sc.editors_note_rank NULLS LAST, sc.created_at DESC LIMIT 3) t;
  END IF;

  IF p_sort = 'editors_helpful_new' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY (p.helpful_count) DESC, p.created_at DESC, p.id DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.parent_comment_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name,
               (SELECT COUNT(*) FROM public.social_comments rc
                 WHERE rc.parent_comment_id = sc.id AND rc.status = 'visible') AS reply_count,
               public._comment_replies_json_v1(sc.id, v_uid, 3) AS replies
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id
           AND sc.parent_comment_id IS NULL
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
        SELECT sc.id, sc.anchor_type, sc.anchor_id, sc.parent_comment_id, sc.author_id, sc.body_text, sc.status,
               sc.helpful_count, sc.editors_note, sc.editors_note_rank,
               sc.edited_at, sc.created_at, sc.edit_deadline_at,
               (sc.author_id = v_uid) AS is_mine,
               (v_uid IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.social_reactions r
                   WHERE r.anchor_type = 'comment' AND r.anchor_id = sc.id::text
                     AND r.user_id = v_uid)) AS my_heart,
               COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), '')) AS author_name,
               (SELECT COUNT(*) FROM public.social_comments rc
                 WHERE rc.parent_comment_id = sc.id AND rc.status = 'visible') AS reply_count,
               public._comment_replies_json_v1(sc.id, v_uid, 3) AS replies
          FROM public.social_comments sc
          LEFT JOIN public.profiles pr ON pr.id = sc.author_id
         WHERE sc.anchor_type = p_anchor_type AND sc.anchor_id = p_anchor_id AND sc.status = 'visible'
           AND sc.parent_comment_id IS NULL
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
       WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND status = 'visible'
         AND parent_comment_id IS NULL));
END
$function$;

-- 7. add_story_comment_v2 — LIVE body, cap counts top-level only
CREATE OR REPLACE FUNCTION public.add_story_comment_v2(p_anchor_type social_anchor_type, p_anchor_id text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid(); v_body text; v_count int; v_recent int;
  v_row public.social_comments; v_at text := p_anchor_type::text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  v_body := public._normalize_comment_body(p_body);
  IF v_body IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'empty'); END IF;
  IF char_length(v_body) > 300 THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_long'); END IF;

  IF v_at = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;
  ELSIF v_at = 'entity' THEN
    IF NOT EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id::text = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_anchor');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.social_comments
   WHERE author_id = v_uid AND anchor_type = p_anchor_type AND anchor_id = p_anchor_id
     AND parent_comment_id IS NULL
     AND status IN ('visible','pending');
  IF v_count >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'anchor_limit_reached'); END IF;

  SELECT COUNT(*) INTO v_recent FROM public.social_comments
   WHERE author_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  INSERT INTO public.social_comments (anchor_type, anchor_id, author_id, body_text)
  VALUES (p_anchor_type, p_anchor_id, v_uid, v_body) RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true,
    'comment', to_jsonb(v_row) - 'moderation_reason' - 'moderated_by');
END $function$;

-- 8. add_comment_reply_v1 -----------------------------------
CREATE OR REPLACE FUNCTION public.add_comment_reply_v1(p_parent_comment_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_body text;
  v_parent public.social_comments;
  v_row public.social_comments;
  v_recent int;
  v_mine int;
  v_entity record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;

  v_body := public._normalize_comment_body(p_body);
  IF v_body IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'empty'); END IF;
  IF char_length(v_body) > 300 THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_long'); END IF;

  SELECT * INTO v_parent FROM public.social_comments WHERE id = p_parent_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'parent_not_found'); END IF;
  IF v_parent.status <> 'visible' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'parent_not_available'); END IF;
  IF v_parent.parent_comment_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nested_reply_not_allowed'); END IF;
  IF v_parent.anchor_type::text <> 'entity' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_anchor'); END IF;

  SELECT e.id::text AS id, COALESCE(e.title, '') AS title_ar INTO v_entity
    FROM public.encyclopedia_entities e WHERE e.id::text = v_parent.anchor_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found'); END IF;

  SELECT COUNT(*) INTO v_recent FROM public.social_comments
   WHERE author_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  SELECT COUNT(*) INTO v_mine FROM public.social_comments
   WHERE author_id = v_uid AND parent_comment_id = v_parent.id
     AND status IN ('visible','pending');
  IF v_mine >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'reply_limit_reached'); END IF;

  INSERT INTO public.social_comments
    (anchor_type, anchor_id, author_id, body_text, parent_comment_id)
  VALUES (v_parent.anchor_type, v_parent.anchor_id, v_uid, v_body, v_parent.id)
  RETURNING * INTO v_row;

  -- One notification per reply, to the parent author. Self-reply is
  -- suppressed inside the helper (p_actor = p_user_id).
  PERFORM public._emit_personal_notification(
    v_parent.author_id, 'comment_reply',
    'comment'::public.social_anchor_type, v_parent.id::text,
    'reply:' || v_row.id::text, v_uid,
    jsonb_build_object(
      'anchor_type', 'entity',
      'anchor_id', v_parent.anchor_id,
      'anchor_title', COALESCE(v_entity.title_ar, ''),
      'parent_comment_id', v_parent.id::text,
      'reply_comment_id', v_row.id::text,
      'reply_preview', LEFT(v_row.body_text, 120)),
    TRUE);

  SELECT COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), ''))
    INTO v_name FROM public.profiles pr WHERE pr.id = v_uid;

  RETURN jsonb_build_object('ok', true,
    'comment', (to_jsonb(v_row) - 'moderation_reason' - 'moderated_by')
      || jsonb_build_object('is_mine', true, 'my_heart', false,
                            'author_name', v_name, 'reply_count', 0,
                            'replies', '[]'::jsonb));
END $function$;

-- 9. get_comment_thread_v1 ----------------------------------
CREATE OR REPLACE FUNCTION public.get_comment_thread_v1(p_parent_comment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_parent public.social_comments;
  v_replies jsonb;
  v_count int;
  v_title text;
  v_json jsonb;
BEGIN
  SELECT * INTO v_parent FROM public.social_comments WHERE id = p_parent_comment_id;
  IF NOT FOUND OR v_parent.parent_comment_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;
  IF v_parent.status NOT IN ('visible','removed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.social_comments
   WHERE parent_comment_id = v_parent.id AND status = 'visible';

  -- A soft-deleted (author-removed) parent is only reachable through this
  -- direct known-thread lookup, and only while it still holds live replies.
  -- It is never discoverable through the public feed, and its body is empty.
  IF v_parent.status = 'removed' AND v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  v_replies := public._comment_replies_json_v1(v_parent.id, v_uid, 200);

  IF v_parent.anchor_type::text = 'entity' THEN
    SELECT COALESCE(e.title, '') INTO v_title
      FROM public.encyclopedia_entities e WHERE e.id::text = v_parent.anchor_id;
  ELSE
    SELECT COALESCE(s.title_ar, '') INTO v_title
      FROM public.stories s WHERE s.id = v_parent.anchor_id;
  END IF;

  v_json := jsonb_build_object(
    'id', v_parent.id::text,
    'anchor_type', v_parent.anchor_type,
    'anchor_id', v_parent.anchor_id,
    'parent_comment_id', NULL,
    'author_id', CASE WHEN v_parent.status = 'removed' THEN NULL ELSE v_parent.author_id::text END,
    'body_text', CASE WHEN v_parent.status = 'removed' THEN '' ELSE v_parent.body_text END,
    'status', v_parent.status,
    'helpful_count', CASE WHEN v_parent.status = 'removed' THEN 0 ELSE v_parent.helpful_count END,
    'editors_note', v_parent.editors_note,
    'editors_note_rank', v_parent.editors_note_rank,
    'edited_at', v_parent.edited_at,
    'created_at', v_parent.created_at,
    'edit_deadline_at', v_parent.edit_deadline_at,
    'is_mine', (v_parent.status <> 'removed' AND v_parent.author_id = v_uid),
    'my_heart', (v_parent.status <> 'removed' AND v_uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.social_reactions r
         WHERE r.anchor_type = 'comment' AND r.anchor_id = v_parent.id::text
           AND r.user_id = v_uid)),
    'author_name', CASE WHEN v_parent.status = 'removed' THEN NULL ELSE
        (SELECT COALESCE(NULLIF(btrim(pr.display_name), ''), NULLIF(btrim(pr.username), ''))
           FROM public.profiles pr WHERE pr.id = v_parent.author_id) END,
    'reply_count', v_count,
    'replies', v_replies
  );

  RETURN jsonb_build_object('ok', true,
    'anchor_type', v_parent.anchor_type,
    'anchor_id', v_parent.anchor_id,
    'anchor_title', COALESCE(v_title, ''),
    'removed', (v_parent.status = 'removed'),
    'parent', v_json);
END $function$;

-- 10. moderate_comment_v2 — LIVE body + reply pin guard -----
CREATE OR REPLACE FUNCTION public.moderate_comment_v2(p_comment_id uuid, p_action text, p_reason text DEFAULT NULL::text, p_rank integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.social_comments;
  v_pinned INT;
  v_story RECORD;
  v_entity RECORD;
  v_payload JSONB;
  v_anchor_type_text TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  v_anchor_type_text := v_row.anchor_type::text;
  IF v_anchor_type_text = 'entity' THEN
    SELECT e.id, COALESCE(e.title, '') AS title_ar
      INTO v_entity
      FROM public.encyclopedia_entities e
     WHERE e.id = v_row.anchor_id;
    v_payload := jsonb_build_object(
      'anchor_type',  'entity',
      'anchor_id',    v_row.anchor_id,
      'anchor_title', COALESCE(v_entity.title_ar, ''),
      'comment_preview', LEFT(v_row.body_text, 120)
    );
  ELSE
    SELECT s.id AS story_id, s.title_ar INTO v_story FROM public.stories s WHERE s.id = v_row.anchor_id;
    v_payload := jsonb_build_object(
      'anchor_type',  'story',
      'anchor_id',    v_row.anchor_id,
      'anchor_title', COALESCE(v_story.title_ar, ''),
      'story_id',     v_row.anchor_id,
      'story_title',  COALESCE(v_story.title_ar, ''),
      'comment_preview', LEFT(v_row.body_text, 120)
    );
  END IF;

  IF p_action = 'hide' THEN
    UPDATE public.social_comments
       SET status='hidden', moderation_reason=p_reason, moderated_by=v_uid, moderated_at=now(),
           editors_note=FALSE, editors_note_rank=NULL
     WHERE id = p_comment_id;
    PERFORM public._emit_personal_notification(
      v_row.author_id, 'comment_hidden', 'comment',
      v_row.id, 'moderation', v_uid,
      v_payload || jsonb_build_object('reason', COALESCE(p_reason, '')),
      FALSE);
  ELSIF p_action = 'restore' THEN
    UPDATE public.social_comments
       SET status='visible', moderation_reason=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    PERFORM public._emit_personal_notification(
      v_row.author_id, 'comment_restored', 'comment',
      v_row.id, 'moderation', v_uid, v_payload, FALSE);
  ELSIF p_action = 'pin_note' THEN
    IF v_row.parent_comment_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cannot_pin_reply');
    END IF;
    IF v_row.status <> 'visible' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_visible');
    END IF;
    SELECT COUNT(*) INTO v_pinned FROM public.social_comments
     WHERE anchor_type=v_row.anchor_type AND anchor_id=v_row.anchor_id
       AND parent_comment_id IS NULL
       AND editors_note=TRUE AND status='visible' AND id <> p_comment_id;
    IF v_pinned >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'pin_cap_reached');
    END IF;
    IF v_row.editors_note IS NOT TRUE THEN
      UPDATE public.social_comments
         SET editors_note=TRUE, editors_note_rank=COALESCE(p_rank, v_pinned + 1),
             status='visible', moderated_by=v_uid, moderated_at=now()
       WHERE id = p_comment_id;
      PERFORM public._emit_personal_notification(
        v_row.author_id, 'comment_promoted_editor_note', 'comment',
        v_row.id, 'promotion', v_uid, v_payload, FALSE);
    ELSE
      UPDATE public.social_comments
         SET editors_note_rank=COALESCE(p_rank, editors_note_rank),
             moderated_by=v_uid, moderated_at=now()
       WHERE id = p_comment_id;
    END IF;
  ELSIF p_action = 'unpin_note' THEN
    UPDATE public.social_comments
       SET editors_note=FALSE, editors_note_rank=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
  ELSIF p_action = 'mark_contribution' THEN
    INSERT INTO public.social_comment_contributions (comment_id, marked_by, note)
    VALUES (p_comment_id, v_uid, p_reason)
    ON CONFLICT (comment_id) DO UPDATE
      SET marked_by = EXCLUDED.marked_by, note = EXCLUDED.note, marked_at = now();
    PERFORM public._emit_personal_notification(
      v_row.author_id, 'comment_marked_contribution', 'comment',
      v_row.id, 'contribution', v_uid,
      v_payload || jsonb_build_object('note', COALESCE(p_reason, '')),
      FALSE);
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- 11. admin_content_comment_rankings_v1 — exclude replies ---
CREATE OR REPLACE FUNCTION public.admin_content_comment_rankings_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not (
    public.has_role(v_uid, 'owner'::app_role)
    or public.has_role(v_uid, 'admin'::app_role)
    or public.has_role(v_uid, 'editor'::app_role)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  return (
    with merged as (
      select
        c.author_id as user_id,
        case c.anchor_type when 'entity' then 'encyclopedia' else 'story' end as source,
        c.anchor_id::text as anchor_id
      from public.social_comments c
      where c.anchor_type in ('entity','story')
        and c.parent_comment_id is null

      union all

      select
        r.user_id,
        r.source_type,
        coalesce(r.source_id, r.campaign_id)::text
      from public.user_reflections r
      where r.note is not null and btrim(r.note) <> ''
    ),
    per_user as (
      select
        m.user_id,
        count(*) filter (where m.source = 'campaign') as campaigns,
        count(distinct m.anchor_id) filter (where m.source = 'story') as stories,
        count(*) filter (where m.source = 'encyclopedia') as encyclopedia
      from merged m
      where m.user_id is not null
      group by m.user_id
    ),
    scored as (
      select
        u.*,
        (u.campaigns + u.stories + u.encyclopedia) as total,
        ((u.campaigns > 0)::int + (u.stories > 0)::int + (u.encyclopedia > 0)::int) as kinds,
        least(u.campaigns, u.stories, u.encyclopedia) as balance
      from per_user u
    ),
    enriched as (
      select s.*, p.display_name, p.username, p.avatar_id
      from scored s
      left join public.profiles p on p.id = s.user_id
    ),
    row_json as (
      select e.*, jsonb_build_object(
        'user_id', e.user_id::text,
        'name', e.display_name,
        'username', e.username,
        'avatar_id', e.avatar_id,
        'total', e.total,
        'campaigns', e.campaigns,
        'stories', e.stories,
        'encyclopedia', e.encyclopedia,
        'kinds', e.kinds
      ) as j
      from enriched e
    )
    select jsonb_build_object(
      'ok', true,
      'stats', jsonb_build_object(
        'total', (select coalesce(sum(total),0) from scored),
        'participants', (select count(*) from scored),
        'campaigns', (select coalesce(sum(campaigns),0) from scored),
        'stories_encyclopedia', (select coalesce(sum(stories + encyclopedia),0) from scored)
      ),
      'overall', coalesce((select jsonb_agg(j) from (select j, total from row_json order by total desc, kinds desc limit 10) t), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(j) from (select j from row_json where campaigns > 0 order by campaigns desc, total desc limit 5) t), '[]'::jsonb),
      'stories', coalesce((select jsonb_agg(j) from (select j from row_json where stories > 0 order by stories desc, total desc limit 5) t), '[]'::jsonb),
      'encyclopedia', coalesce((select jsonb_agg(j) from (select j from row_json where encyclopedia > 0 order by encyclopedia desc, total desc limit 5) t), '[]'::jsonb),
      'diverse', coalesce((select jsonb_agg(j) from (select j from row_json where kinds > 1 order by kinds desc, balance desc, total desc limit 5) t), '[]'::jsonb)
    )
  );
end
$function$;

-- 12. admin_list_content_comments_v1 — reply marker ---------
CREATE OR REPLACE FUNCTION public.admin_list_content_comments_v1(p_source text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not (
    public.has_role(v_uid, 'owner'::app_role)
    or public.has_role(v_uid, 'admin'::app_role)
    or public.has_role(v_uid, 'editor'::app_role)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  return (
    with merged as (
      select
        c.id::text as id,
        'comment'::text as kind,
        case c.anchor_type when 'entity' then 'encyclopedia' else 'story' end as source,
        c.anchor_id::text as anchor_id,
        coalesce(
          case c.anchor_type when 'entity' then e.title end,
          case c.anchor_type when 'story' then s.title_ar end
        ) as anchor_title,
        c.body_text as body,
        c.status,
        p.display_name as author_name,
        p.username as author_username,
        c.author_id::text as author_id,
        c.created_at,
        c.parent_comment_id::text as parent_comment_id,
        (c.parent_comment_id is not null) as is_reply
      from public.social_comments c
      left join public.profiles p on p.id = c.author_id
      left join public.encyclopedia_entities e
        on c.anchor_type = 'entity' and e.id::text = c.anchor_id::text
      left join public.stories s
        on c.anchor_type = 'story' and s.id::text = c.anchor_id::text

      union all

      select
        r.id::text,
        'reflection',
        r.source_type,
        coalesce(r.source_id, r.campaign_id),
        coalesce(st.title_ar, ac.title),
        r.note,
        'private',
        p.display_name,
        p.username,
        r.user_id::text,
        r.created_at,
        null::text,
        false
      from public.user_reflections r
      left join public.profiles p on p.id = r.user_id
      left join public.stories st
        on r.source_type = 'story' and st.id::text = coalesce(r.source_id, '')::text
      left join public.admin_campaigns ac
        on r.source_type = 'campaign' and ac.id::text = r.campaign_id
      where r.note is not null and btrim(r.note) <> ''
    ),
    filtered as (
      select * from merged m
      where (p_source = 'all' or m.source = p_source)
        and (p_search is null or p_search = ''
             or m.body ilike '%' || p_search || '%'
             or m.anchor_title ilike '%' || p_search || '%'
             or m.author_name ilike '%' || p_search || '%'
             or m.author_username ilike '%' || p_search || '%')
    )
    select jsonb_build_object(
      'ok', true,
      'total', (select count(*) from filtered),
      'items', coalesce((
        select jsonb_agg(to_jsonb(f) order by f.created_at desc)
        from (select * from filtered order by created_at desc
              limit least(p_limit, 500) offset p_offset) f
      ), '[]'::jsonb)
    )
  );
end
$function$;

-- 13. Grants -------------------------------------------------
REVOKE ALL ON FUNCTION public.add_comment_reply_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_comment_reply_v1(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_comment_thread_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comment_thread_v1(uuid) TO authenticated, anon;

REVOKE ALL ON FUNCTION public._comment_replies_json_v1(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._comment_replies_json_v1(uuid, uuid, int) TO authenticated, anon;
