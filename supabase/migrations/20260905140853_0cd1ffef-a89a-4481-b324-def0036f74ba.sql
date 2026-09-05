-- V17-07B follow-up: the reply pin guard must be evaluated before the
-- anchor payload is built, because the LIVE payload block for 'entity'
-- comments contains a pre-existing uuid = text comparison that raises.
-- Nothing else in this function differs from the LIVE definition.
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

  -- V17-07B: replies can never become editor's notes.
  IF p_action = 'pin_note' AND v_row.parent_comment_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_pin_reply');
  END IF;

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
