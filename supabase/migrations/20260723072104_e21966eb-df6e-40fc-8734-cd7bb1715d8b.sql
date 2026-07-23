
-- ============================================================
-- P6 Step 6 — Curated Highlights (ملاحظة المحرّر)
-- Extends frozen Step 5 moderate_comment_v2 signature.
-- One-shot author notification on FALSE→TRUE transition.
-- Block author soft-delete while pinned.
-- ============================================================

CREATE OR REPLACE FUNCTION public.moderate_comment_v2(
  p_comment_id UUID,
  p_action     TEXT,
  p_reason     TEXT DEFAULT NULL,
  p_rank       INT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_row        public.social_comments;
  v_pinned     INT;
  v_resolution TEXT;
  v_was_note   BOOLEAN;
  v_story      RECORD;
  v_payload    JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  v_was_note := v_row.editors_note;

  IF p_action = 'hide' THEN
    UPDATE public.social_comments
       SET status='hidden', moderation_reason=p_reason, moderated_by=v_uid, moderated_at=now(),
           editors_note=FALSE, editors_note_rank=NULL
     WHERE id = p_comment_id;
    v_resolution := 'hidden';
  ELSIF p_action = 'restore' THEN
    UPDATE public.social_comments
       SET status='visible', moderation_reason=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    v_resolution := 'restored';
  ELSIF p_action = 'remove' THEN
    UPDATE public.social_comments
       SET status='removed', body_text='',
           moderation_reason=p_reason, moderated_by=v_uid, moderated_at=now(),
           editors_note=FALSE, editors_note_rank=NULL
     WHERE id = p_comment_id;
    v_resolution := 'removed';
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
    UPDATE public.social_comments
       SET editors_note=TRUE, editors_note_rank=COALESCE(p_rank, v_pinned + 1),
           status='visible', moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    v_resolution := 'pinned';

    -- One-shot author notification on FALSE→TRUE transition only.
    -- Reorder / repin of an already-highlighted comment does NOT notify.
    IF NOT v_was_note AND v_row.author_id IS NOT NULL AND v_row.author_id <> v_uid THEN
      IF v_row.anchor_type = 'story' THEN
        SELECT s.id AS story_id, s.title_ar
          INTO v_story
          FROM public.stories s WHERE s.id = v_row.anchor_id;
      END IF;
      v_payload := jsonb_build_object(
        'anchor_type', v_row.anchor_type,
        'anchor_id',   v_row.anchor_id,
        'story_id',    v_row.anchor_id,
        'story_title', COALESCE(v_story.title_ar, ''),
        'comment_preview', LEFT(v_row.body_text, 120)
      );
      PERFORM public._emit_personal_notification(
        v_row.author_id,
        'comment_promoted_editor_note',
        v_row.anchor_type,
        v_row.id,
        'promotion:' || v_row.id::text,   -- unique batch key → one-shot
        v_uid,
        v_payload,
        FALSE                              -- not batched
      );
    END IF;
  ELSIF p_action = 'unpin_note' THEN
    UPDATE public.social_comments
       SET editors_note=FALSE, editors_note_rank=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    v_resolution := 'unpinned';
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;

  -- Immutable audit trail (unchanged contract).
  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (
    v_uid,
    'social_comment.' || p_action,
    jsonb_build_object(
      'comment_id', p_comment_id,
      'anchor_type', v_row.anchor_type,
      'anchor_id',   v_row.anchor_id,
      'author_id',   v_row.author_id,
      'resolution',  v_resolution,
      'rank',        p_rank,
      'was_note',    v_was_note
    ),
    p_reason
  );

  -- Auto-close open reports on comment-status changes.
  IF p_action IN ('hide','restore','remove') THEN
    UPDATE public.social_comment_reports
       SET status = 'actioned',
           resolution = v_resolution,
           resolved_by = v_uid,
           resolved_at = now()
     WHERE comment_id = p_comment_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object('ok', true, 'resolution', v_resolution);
END $$;

REVOKE ALL ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) TO authenticated;

-- ============================================================
-- delete_own_comment_v2 — refuse while comment is a highlighted
-- Editor's Note. Author must ask a moderator to unpin first.
-- Contract preserved (returns { ok, reason? }).
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_own_comment_v2(
  p_comment_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.social_comments;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.author_id <> v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'forbidden'); END IF;
  IF v_row.status = 'removed' THEN RETURN jsonb_build_object('ok', true); END IF;
  IF v_row.editors_note = TRUE AND v_row.status = 'visible' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'editors_note_locked');
  END IF;
  UPDATE public.social_comments
     SET status = 'removed', body_text = '', editors_note = FALSE, editors_note_rank = NULL
   WHERE id = p_comment_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.delete_own_comment_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_comment_v2(UUID) TO authenticated;
