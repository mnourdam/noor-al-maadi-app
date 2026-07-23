
-- ============================================================
-- Widen social anchors to TEXT (supports both story slugs and UUID entities).
-- Root cause: stories.id is TEXT slug; social_* anchor_id was UUID → 22P02 on list_comments_v2 etc.
-- ============================================================

-- 1) Drop the trigger and functions that pin the columns to uuid via signatures.
DROP TRIGGER  IF EXISTS social_reactions_sync_counter_trg ON public.social_reactions;
DROP FUNCTION IF EXISTS public.social_reactions_sync_counter() CASCADE;

DROP FUNCTION IF EXISTS public.list_comments_v2(social_anchor_type, uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.add_story_comment_v2(social_anchor_type, uuid, text);
DROP FUNCTION IF EXISTS public.toggle_reaction_v2(social_anchor_type, uuid);
DROP FUNCTION IF EXISTS public.get_reactions_for_anchors_v2(social_anchor_type, uuid[]);
DROP FUNCTION IF EXISTS public.list_public_contributions_v2(social_anchor_type, uuid);
DROP FUNCTION IF EXISTS public._emit_personal_notification(uuid, text, social_anchor_type, uuid, text, uuid, jsonb, boolean);

-- 2) Widen the underlying columns. Existing uuid values become their canonical text.
ALTER TABLE public.social_comments        ALTER COLUMN anchor_id  TYPE text USING anchor_id::text;
ALTER TABLE public.social_reactions       ALTER COLUMN anchor_id  TYPE text USING anchor_id::text;
ALTER TABLE public.personal_notifications ALTER COLUMN subject_id TYPE text USING subject_id::text;

-- 3) Recreate the notification emitter (subject_id text).
CREATE OR REPLACE FUNCTION public._emit_personal_notification(
  p_user_id uuid, p_kind text, p_subject_type social_anchor_type, p_subject_id text,
  p_batch_key text, p_actor uuid, p_payload jsonb, p_batched boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_actor IS NOT NULL AND p_actor = p_user_id THEN RETURN; END IF;
  IF p_batched THEN
    INSERT INTO public.personal_notifications
      (user_id, kind, subject_type, subject_id, batch_key, count, last_actor_id, payload)
    VALUES (p_user_id, p_kind, p_subject_type, p_subject_id, p_batch_key, 1, p_actor, p_payload)
    ON CONFLICT (user_id, kind, subject_id, batch_key) DO UPDATE
      SET count = public.personal_notifications.count + 1,
          last_actor_id = EXCLUDED.last_actor_id,
          payload = EXCLUDED.payload,
          read_at = NULL,
          updated_at = now();
  ELSE
    INSERT INTO public.personal_notifications
      (user_id, kind, subject_type, subject_id, batch_key, count, last_actor_id, payload)
    VALUES (p_user_id, p_kind, p_subject_type, p_subject_id,
            p_batch_key || ':' || gen_random_uuid()::text, 1, p_actor, p_payload);
  END IF;
END $fn$;

-- 4) Reaction counter trigger with text anchor.
CREATE OR REPLACE FUNCTION public.social_reactions_sync_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
  END IF;
  RETURN NULL;
END $fn$;

CREATE TRIGGER social_reactions_sync_counter_trg
AFTER INSERT OR DELETE ON public.social_reactions
FOR EACH ROW EXECUTE FUNCTION public.social_reactions_sync_counter();

-- 5) add_story_comment_v2 (text anchor).
CREATE OR REPLACE FUNCTION public.add_story_comment_v2(
  p_anchor_type social_anchor_type, p_anchor_id text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
     AND status IN ('visible','pending');
  IF v_count >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'anchor_limit_reached'); END IF;

  SELECT COUNT(*) INTO v_recent FROM public.social_comments
   WHERE author_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  INSERT INTO public.social_comments (anchor_type, anchor_id, author_id, body_text)
  VALUES (p_anchor_type, p_anchor_id, v_uid, v_body) RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true,
    'comment', to_jsonb(v_row) - 'moderation_reason' - 'moderated_by');
END $fn$;

-- 6) list_comments_v2 (text anchor).
CREATE OR REPLACE FUNCTION public.list_comments_v2(
  p_anchor_type social_anchor_type, p_anchor_id text,
  p_sort text DEFAULT 'editors_helpful_new', p_cursor text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
        SELECT id, anchor_type, anchor_id, author_id, body_text, status,
               helpful_count, editors_note, editors_note_rank,
               edited_at, created_at, edit_deadline_at,
               (author_id = v_uid) AS is_mine
          FROM public.social_comments
         WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id
           AND status = 'visible' AND editors_note = TRUE
         ORDER BY editors_note_rank NULLS LAST, created_at DESC LIMIT 3) t;
  END IF;

  IF p_sort = 'editors_helpful_new' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY (p.helpful_count) DESC, p.created_at DESC, p.id DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT id, anchor_type, anchor_id, author_id, body_text, status,
               helpful_count, editors_note, editors_note_rank,
               edited_at, created_at, edit_deadline_at,
               (author_id = v_uid) AS is_mine
          FROM public.social_comments
         WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id
           AND status = 'visible' AND editors_note = FALSE
           AND ( v_cursor IS NULL OR (helpful_count, created_at, id) < (
                   (v_cursor->>'hc')::int, (v_cursor->>'ts')::timestamptz, (v_cursor->>'id')::uuid))
         ORDER BY helpful_count DESC, created_at DESC, id DESC LIMIT v_limit + 1) p;
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
        SELECT id, anchor_type, anchor_id, author_id, body_text, status,
               helpful_count, editors_note, editors_note_rank,
               edited_at, created_at, edit_deadline_at,
               (author_id = v_uid) AS is_mine
          FROM public.social_comments
         WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND status = 'visible'
           AND ( v_cursor IS NULL OR (created_at, id) < (
                   (v_cursor->>'ts')::timestamptz, (v_cursor->>'id')::uuid))
         ORDER BY created_at DESC, id DESC LIMIT v_limit + 1) p;
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
END $fn$;

-- 7) toggle_reaction_v2 (text anchor).
CREATE OR REPLACE FUNCTION public.toggle_reaction_v2(
  p_anchor_type social_anchor_type, p_anchor_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_existed boolean; v_count int; v_active boolean;
  v_comment public.social_comments; v_story record; v_entity record;
  v_at text := p_anchor_type::text;
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
    IF v_comment.anchor_type::text = 'entity' THEN
      SELECT e.id::text AS id, COALESCE(e.title, '') AS title_ar INTO v_entity
        FROM public.encyclopedia_entities e WHERE e.id::text = v_comment.anchor_id;
      PERFORM public._emit_personal_notification(
        v_comment.author_id, 'story_reaction_on_comment',
        'comment'::public.social_anchor_type, v_comment.id::text,
        'reactions', v_uid,
        jsonb_build_object('anchor_type','entity','anchor_id',v_comment.anchor_id,
          'anchor_title', COALESCE(v_entity.title_ar,''),
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
          'comment_preview', LEFT(v_comment.body_text,120)), TRUE);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', v_active, 'count', v_count);
END $fn$;

-- 8) get_reactions_for_anchors_v2 (text[] anchors).
CREATE OR REPLACE FUNCTION public.get_reactions_for_anchors_v2(
  p_anchor_type social_anchor_type, p_anchor_ids text[])
RETURNS TABLE(anchor_id text, count integer, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT a.id AS anchor_id,
         COALESCE(c.c, 0)::int AS count,
         COALESCE(mine.active, false) AS active
  FROM unnest(p_anchor_ids) AS a(id)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS c FROM public.social_reactions r
     WHERE r.anchor_type = p_anchor_type AND r.anchor_id = a.id) c ON true
  LEFT JOIN LATERAL (
    SELECT true AS active FROM public.social_reactions r
     WHERE r.anchor_type = p_anchor_type AND r.anchor_id = a.id
       AND r.user_id = auth.uid() LIMIT 1) mine ON true;
$fn$;

-- 9) list_public_contributions_v2 (text anchor).
CREATE OR REPLACE FUNCTION public.list_public_contributions_v2(
  p_anchor_type social_anchor_type, p_anchor_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_items jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'category', c.category,
    'public_notice_text', c.public_notice_text,
    'applied_at', c.applied_at
  ) ORDER BY c.applied_at DESC)
    INTO v_items
    FROM public.social_comment_contributions c
    JOIN public.social_comments sc ON sc.id = c.comment_id
   WHERE c.status = 'applied'
     AND sc.anchor_type = p_anchor_type
     AND sc.anchor_id = p_anchor_id;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE(v_items, '[]'::jsonb));
END $fn$;

-- 10) Grants.
GRANT EXECUTE ON FUNCTION public.list_comments_v2(social_anchor_type, text, text, text, integer)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_reactions_for_anchors_v2(social_anchor_type, text[])              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_public_contributions_v2(social_anchor_type, text)                TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.add_story_comment_v2(social_anchor_type, text, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_reaction_v2(social_anchor_type, text)                          TO authenticated;
