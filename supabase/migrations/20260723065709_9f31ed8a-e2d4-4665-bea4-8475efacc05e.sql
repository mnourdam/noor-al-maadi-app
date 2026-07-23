
DROP FUNCTION IF EXISTS public.mark_notification_read(UUID);
DROP FUNCTION IF EXISTS public.mark_all_notifications_read();

CREATE TABLE IF NOT EXISTS public.personal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  subject_type public.social_anchor_type NOT NULL,
  subject_id UUID NOT NULL,
  batch_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_notifications_kind_chk CHECK (kind IN (
    'story_reaction_on_comment',
    'comment_promoted_editor_note',
    'comment_marked_contribution',
    'comment_hidden',
    'comment_restored',
    'story_unlocked'
  ))
);

GRANT ALL ON public.personal_notifications TO service_role;
ALTER TABLE public.personal_notifications ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS personal_notifications_batch_uidx
  ON public.personal_notifications (user_id, kind, subject_id, batch_key);
CREATE INDEX IF NOT EXISTS personal_notifications_user_updated_idx
  ON public.personal_notifications (user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS personal_notifications_user_unread_idx
  ON public.personal_notifications (user_id) WHERE read_at IS NULL;

CREATE TRIGGER personal_notifications_touch_updated
  BEFORE UPDATE ON public.personal_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.social_comment_contributions (
  comment_id UUID PRIMARY KEY REFERENCES public.social_comments(id) ON DELETE CASCADE,
  marked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);
GRANT ALL ON public.social_comment_contributions TO service_role;
GRANT SELECT ON public.social_comment_contributions TO anon, authenticated;
ALTER TABLE public.social_comment_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read contributions" ON public.social_comment_contributions;
CREATE POLICY "public read contributions"
  ON public.social_comment_contributions FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public._emit_personal_notification(
  p_user_id UUID, p_kind TEXT, p_subject_type public.social_anchor_type,
  p_subject_id UUID, p_batch_key TEXT, p_actor UUID, p_payload JSONB,
  p_batched BOOLEAN DEFAULT TRUE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_actor IS NOT NULL AND p_actor = p_user_id THEN RETURN; END IF;
  IF p_batched THEN
    INSERT INTO public.personal_notifications
      (user_id, kind, subject_type, subject_id, batch_key, count, last_actor_id, payload)
    VALUES
      (p_user_id, p_kind, p_subject_type, p_subject_id, p_batch_key, 1, p_actor, p_payload)
    ON CONFLICT (user_id, kind, subject_id, batch_key) DO UPDATE
      SET count = public.personal_notifications.count + 1,
          last_actor_id = EXCLUDED.last_actor_id,
          payload = EXCLUDED.payload,
          read_at = NULL,
          updated_at = now();
  ELSE
    INSERT INTO public.personal_notifications
      (user_id, kind, subject_type, subject_id, batch_key, count, last_actor_id, payload)
    VALUES
      (p_user_id, p_kind, p_subject_type, p_subject_id,
       p_batch_key || ':' || gen_random_uuid()::text,
       1, p_actor, p_payload);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._emit_personal_notification(UUID, TEXT, public.social_anchor_type, UUID, TEXT, UUID, JSONB, BOOLEAN) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.toggle_reaction_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existed BOOLEAN;
  v_count INT;
  v_active BOOLEAN;
  v_comment public.social_comments;
  v_story RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF p_anchor_type = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSIF p_anchor_type = 'comment' THEN
    SELECT * INTO v_comment FROM public.social_comments WHERE id = p_anchor_id;
    IF NOT FOUND OR v_comment.status <> 'visible' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_anchor');
  END IF;

  DELETE FROM public.social_reactions
   WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND user_id = v_uid
  RETURNING TRUE INTO v_existed;

  IF v_existed IS NOT TRUE THEN
    INSERT INTO public.social_reactions (anchor_type, anchor_id, user_id)
    VALUES (p_anchor_type, p_anchor_id, v_uid);
    v_active := TRUE;
  ELSE
    v_active := FALSE;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.social_reactions
   WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id;

  IF v_active AND p_anchor_type = 'comment' AND v_comment.author_id <> v_uid THEN
    SELECT s.id AS story_id, s.title_ar
      INTO v_story
      FROM public.stories s
     WHERE s.id = v_comment.anchor_id;
    PERFORM public._emit_personal_notification(
      v_comment.author_id, 'story_reaction_on_comment',
      'comment'::public.social_anchor_type, v_comment.id,
      'reactions', v_uid,
      jsonb_build_object(
        'story_id', v_comment.anchor_id,
        'story_title', COALESCE(v_story.title_ar, ''),
        'comment_preview', LEFT(v_comment.body_text, 120)
      ),
      TRUE
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', v_active, 'count', v_count);
END $$;
REVOKE ALL ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_comment_v2(
  p_comment_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL, p_rank INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.social_comments;
  v_pinned INT;
  v_story RECORD;
  v_payload JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT s.id AS story_id, s.title_ar INTO v_story FROM public.stories s WHERE s.id = v_row.anchor_id;
  v_payload := jsonb_build_object(
    'story_id', v_row.anchor_id,
    'story_title', COALESCE(v_story.title_ar, ''),
    'comment_preview', LEFT(v_row.body_text, 120)
  );

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
    SELECT COUNT(*) INTO v_pinned FROM public.social_comments
     WHERE anchor_type=v_row.anchor_type AND anchor_id=v_row.anchor_id
       AND editors_note=TRUE AND status='visible' AND id <> p_comment_id;
    IF v_pinned >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'pin_cap_reached');
    END IF;
    UPDATE public.social_comments
       SET editors_note=TRUE, editors_note_rank=COALESCE(p_rank, v_pinned + 1),
           status='visible', moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    PERFORM public._emit_personal_notification(
      v_row.author_id, 'comment_promoted_editor_note', 'comment',
      v_row.id, 'promotion', v_uid, v_payload, FALSE);
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
END $$;
REVOKE ALL ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.emit_story_unlock_notification(
  p_user_id UUID, p_story_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_story RECORD;
BEGIN
  SELECT s.id, s.title_ar INTO v_story FROM public.stories s WHERE s.id = p_story_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  PERFORM public._emit_personal_notification(
    p_user_id, 'story_unlocked', 'story',
    p_story_id, 'unlock', NULL,
    jsonb_build_object('story_id', p_story_id, 'story_title', COALESCE(v_story.title_ar, '')),
    FALSE);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.emit_story_unlock_notification(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_story_unlock_notification(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.list_my_notifications(
  p_cursor TEXT DEFAULT NULL, p_limit INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INT := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_cursor JSONB;
  v_rows JSONB;
  v_items JSONB;
  v_next TEXT := NULL;
  v_last JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    BEGIN
      v_cursor := convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN v_cursor := NULL;
    END;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC, p.id DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT id, user_id, kind, subject_type, subject_id, batch_key,
             count, last_actor_id, payload, read_at, created_at, updated_at
        FROM public.personal_notifications
       WHERE user_id = v_uid
         AND (v_cursor IS NULL
              OR (updated_at, id) < ((v_cursor->>'ts')::timestamptz, (v_cursor->>'id')::uuid))
       ORDER BY updated_at DESC, id DESC
       LIMIT v_limit + 1
    ) p;

  IF jsonb_array_length(v_rows) > v_limit THEN
    v_items := (SELECT jsonb_agg(elem) FROM (
      SELECT elem FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS a(elem, ord)
       ORDER BY ord LIMIT v_limit
    ) s);
    v_last := v_items->(v_limit - 1);
    v_next := encode(convert_to(jsonb_build_object('ts', v_last->>'updated_at', 'id', v_last->>'id')::text, 'UTF8'), 'base64');
  ELSE
    v_items := v_rows;
  END IF;

  RETURN jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', v_next);
END $$;
REVOKE ALL ON FUNCTION public.list_my_notifications(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unread_notification_count()
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_n INT;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_n FROM public.personal_notifications
   WHERE user_id = v_uid AND read_at IS NULL;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.unread_notification_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_notification_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  UPDATE public.personal_notifications
     SET read_at = COALESCE(read_at, now())
   WHERE id = p_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_n INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  UPDATE public.personal_notifications
     SET read_at = now()
   WHERE user_id = v_uid AND read_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_n);
END $$;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
