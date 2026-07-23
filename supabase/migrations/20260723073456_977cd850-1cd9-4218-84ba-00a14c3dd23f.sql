
-- 1) Extend the frozen anchor enum with 'entity'. Story keeps its slot.
ALTER TYPE public.social_anchor_type ADD VALUE IF NOT EXISTS 'entity';

-- 2) toggle_reaction_v2 — accept 'entity' with an existence guard against
--    encyclopedia_entities. Comment/story branches are preserved verbatim.
--    We compare via ::text so the literal doesn't hit the "unsafe use of
--    new enum value in same transaction" rule.
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
  v_entity RECORD;
  v_anchor_type_text TEXT := p_anchor_type::text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF v_anchor_type_text = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSIF v_anchor_type_text = 'entity' THEN
    IF NOT EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSIF v_anchor_type_text = 'comment' THEN
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

  -- Notification on reaction to another user's comment. Look up the
  -- parent anchor (story or entity) to enrich the payload.
  IF v_active AND v_anchor_type_text = 'comment' AND v_comment.author_id <> v_uid THEN
    IF v_comment.anchor_type::text = 'entity' THEN
      SELECT e.id, COALESCE(e.title, '') AS title_ar
        INTO v_entity
        FROM public.encyclopedia_entities e
       WHERE e.id = v_comment.anchor_id;
      PERFORM public._emit_personal_notification(
        v_comment.author_id, 'story_reaction_on_comment',
        'comment'::public.social_anchor_type, v_comment.id,
        'reactions', v_uid,
        jsonb_build_object(
          'anchor_type',  'entity',
          'anchor_id',    v_comment.anchor_id,
          'anchor_title', COALESCE(v_entity.title_ar, ''),
          'comment_preview', LEFT(v_comment.body_text, 120)
        ),
        TRUE
      );
    ELSE
      SELECT s.id AS story_id, s.title_ar
        INTO v_story
        FROM public.stories s
       WHERE s.id = v_comment.anchor_id;
      PERFORM public._emit_personal_notification(
        v_comment.author_id, 'story_reaction_on_comment',
        'comment'::public.social_anchor_type, v_comment.id,
        'reactions', v_uid,
        jsonb_build_object(
          'anchor_type',  'story',
          'anchor_id',    v_comment.anchor_id,
          'anchor_title', COALESCE(v_story.title_ar, ''),
          'story_id',     v_comment.anchor_id,
          'story_title',  COALESCE(v_story.title_ar, ''),
          'comment_preview', LEFT(v_comment.body_text, 120)
        ),
        TRUE
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', v_active, 'count', v_count);
END $$;
REVOKE ALL ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_reaction_v2(public.social_anchor_type, UUID) TO authenticated;

-- 3) add_story_comment_v2 — accept 'entity' with same existence + rate rules.
CREATE OR REPLACE FUNCTION public.add_story_comment_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_id UUID,
  p_body TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_body TEXT;
  v_count INT;
  v_recent INT;
  v_row public.social_comments;
  v_anchor_type_text TEXT := p_anchor_type::text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  v_body := public._normalize_comment_body(p_body);
  IF v_body IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty');
  END IF;
  IF char_length(v_body) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_long');
  END IF;

  IF v_anchor_type_text = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSIF v_anchor_type_text = 'entity' THEN
    IF NOT EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_anchor');
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.social_comments
   WHERE author_id = v_uid
     AND anchor_type = p_anchor_type
     AND anchor_id = p_anchor_id
     AND status IN ('visible','pending');
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'anchor_limit_reached');
  END IF;

  SELECT COUNT(*) INTO v_recent
    FROM public.social_comments
   WHERE author_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.social_comments (anchor_type, anchor_id, author_id, body_text)
  VALUES (p_anchor_type, p_anchor_id, v_uid, v_body)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'comment', to_jsonb(v_row) - 'moderation_reason' - 'moderated_by'
  );
END $$;
REVOKE ALL ON FUNCTION public.add_story_comment_v2(public.social_anchor_type, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_story_comment_v2(public.social_anchor_type, UUID, TEXT) TO authenticated;

-- 4) moderate_comment_v2 — enrich payload with a universal anchor_title so
--    the inbox links moderation events back to either surface. Retains
--    story_id/story_title on story anchors for backward-compat.
CREATE OR REPLACE FUNCTION public.moderate_comment_v2(
  p_comment_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL, p_rank INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.social_comments;
  v_pinned INT;
  v_story RECORD;
  v_entity RECORD;
  v_payload JSONB;
  v_anchor_type_text TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
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
    IF v_row.status <> 'visible' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_visible');
    END IF;
    SELECT COUNT(*) INTO v_pinned FROM public.social_comments
     WHERE anchor_type=v_row.anchor_type AND anchor_id=v_row.anchor_id
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
END $$;
REVOKE ALL ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) TO authenticated;
