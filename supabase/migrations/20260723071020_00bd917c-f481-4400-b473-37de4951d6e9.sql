
-- ============================================================
-- P6 STEP 5 — Reports & Moderator Queue (FROZEN AT END OF STEP)
-- ------------------------------------------------------------
-- Lightweight, two-tap reporting on social_comments.
-- Moderator queue backed by open reports.
-- Actions: hide, restore, remove (permanent soft-remove).
-- Audit via admin_audit_log (immutable, attributed, timestamped).
-- All I/O RPC-only. RLS on, no direct SELECT/INSERT policies.
-- Reports are never surfaced to players. list_comments_v2
-- continues to filter status='visible'; 'removed' is terminal.
-- ============================================================

-- ---------- Enum ----------
DO $$ BEGIN
  CREATE TYPE public.report_reason AS ENUM (
    'spam', 'harassment', 'off_topic', 'misinformation', 'inappropriate', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Table ----------
CREATE TABLE IF NOT EXISTS public.social_comment_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   UUID NOT NULL REFERENCES public.social_comments(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       public.report_reason NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','actioned','dismissed')),
  resolution   TEXT,             -- e.g. 'hidden','removed','restored','no_action'
  resolved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_comment_reports_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT social_comment_reports_unique_open UNIQUE (comment_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS social_comment_reports_status_idx
  ON public.social_comment_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_comment_reports_comment_idx
  ON public.social_comment_reports (comment_id);
CREATE INDEX IF NOT EXISTS social_comment_reports_reporter_idx
  ON public.social_comment_reports (reporter_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.social_comment_reports TO authenticated;
GRANT ALL ON public.social_comment_reports TO service_role;

ALTER TABLE public.social_comment_reports ENABLE ROW LEVEL SECURITY;
-- No policies. All access via SECURITY DEFINER RPCs below.

-- ============================================================
-- report_comment_v2 — reporter path. Two-tap.
-- Idempotent per (reporter, comment). Rate-limited to 20/hour.
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_comment_v2(
  p_comment_id UUID,
  p_reason     public.report_reason,
  p_note       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_recent INT;
  v_row    public.social_comments;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'note_too_long');
  END IF;

  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.author_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_report_own');
  END IF;

  SELECT COUNT(*) INTO v_recent
    FROM public.social_comment_reports
   WHERE reporter_id = v_uid
     AND created_at > now() - interval '1 hour';
  IF v_recent >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.social_comment_reports (comment_id, reporter_id, reason, note)
  VALUES (p_comment_id, v_uid, p_reason, NULLIF(TRIM(p_note), ''))
  ON CONFLICT (comment_id, reporter_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.report_comment_v2(UUID, public.report_reason, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_comment_v2(UUID, public.report_reason, TEXT) TO authenticated;

-- ============================================================
-- moderate_comment_v2 — extended with 'remove' + audit + auto-close reports.
-- Kept signature: (UUID, TEXT, TEXT, INT). Contract preserved.
-- ============================================================
CREATE OR REPLACE FUNCTION public.moderate_comment_v2(
  p_comment_id UUID,
  p_action     TEXT,
  p_reason     TEXT DEFAULT NULL,
  p_rank       INT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_row       public.social_comments;
  v_pinned    INT;
  v_resolution TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

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
    -- Permanent soft-remove: cannot be restored via this RPC. Body cleared.
    UPDATE public.social_comments
       SET status='removed', body_text='',
           moderation_reason=p_reason, moderated_by=v_uid, moderated_at=now(),
           editors_note=FALSE, editors_note_rank=NULL
     WHERE id = p_comment_id;
    v_resolution := 'removed';
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
    v_resolution := 'pinned';
  ELSIF p_action = 'unpin_note' THEN
    UPDATE public.social_comments
       SET editors_note=FALSE, editors_note_rank=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
    v_resolution := 'unpinned';
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;

  -- Immutable audit trail
  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (
    v_uid,
    'social_comment.' || p_action,
    jsonb_build_object(
      'comment_id', p_comment_id,
      'anchor_type', v_row.anchor_type,
      'anchor_id', v_row.anchor_id,
      'author_id', v_row.author_id,
      'resolution', v_resolution,
      'rank', p_rank
    ),
    p_reason
  );

  -- Auto-close any open reports on this comment (except pin actions).
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
-- dismiss_report_v2 — close a report with no comment change.
-- ============================================================
CREATE OR REPLACE FUNCTION public.dismiss_report_v2(
  p_report_id UUID,
  p_note      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_r   public.social_comment_reports;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_r FROM public.social_comment_reports WHERE id = p_report_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_r.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_closed');
  END IF;

  UPDATE public.social_comment_reports
     SET status='dismissed', resolution='no_action',
         resolved_by=v_uid, resolved_at=now()
   WHERE id = p_report_id;

  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (v_uid, 'social_report.dismiss',
    jsonb_build_object('report_id', p_report_id, 'comment_id', v_r.comment_id),
    p_note);

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.dismiss_report_v2(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_report_v2(UUID, TEXT) TO authenticated;

-- ============================================================
-- list_moderator_queue_v2 — admin only. Groups open reports by comment.
-- Returns queue items with report counts, top reasons, snippet.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_moderator_queue_v2(
  p_status TEXT DEFAULT 'open',
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit  INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lim INT  := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_items JSONB;
  v_next  TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
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
      MAX(s.created_at)                                 AS last_report_at,
      COUNT(*)                                          AS report_count,
      (ARRAY_AGG(s.reason ORDER BY s.created_at DESC))[1] AS top_reason,
      MAX(s.status)                                     AS any_status
    FROM scoped s
    GROUP BY s.comment_id
    ORDER BY MAX(s.created_at) DESC
    LIMIT v_lim + 1
  ),
  enriched AS (
    SELECT
      g.*,
      c.author_id, c.anchor_type, c.anchor_id, c.status AS comment_status,
      c.body_text, c.created_at AS comment_created_at,
      c.editors_note, c.moderated_at, c.moderated_by
    FROM grouped g
    LEFT JOIN public.social_comments c ON c.id = g.comment_id
  )
  SELECT jsonb_agg(to_jsonb(e.*) ORDER BY e.last_report_at DESC)
    INTO v_items
    FROM (SELECT * FROM enriched LIMIT v_lim) e;

  SELECT MIN(last_report_at) FROM (
    SELECT last_report_at FROM enriched OFFSET v_lim LIMIT 1
  ) t INTO v_next;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb),
    'next_cursor', v_next
  );
END $$;

REVOKE ALL ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) TO authenticated;

-- ============================================================
-- list_comment_reports_v2 — admin only. All reports for one comment.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_comment_reports_v2(
  p_comment_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_items JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at DESC)
    INTO v_items
    FROM public.social_comment_reports r
   WHERE r.comment_id = p_comment_id;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE(v_items, '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.list_comment_reports_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_comment_reports_v2(UUID) TO authenticated;

-- ============================================================
-- list_moderation_history_v2 — admin only. Audit trail for a comment.
-- Immutable, attributed, timestamped view.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_moderation_history_v2(
  p_comment_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_items JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'action', a.action,
             'actor_id', a.actor_id,
             'actor_email', a.actor_email,
             'reason', a.reason,
             'detail', a.detail,
             'created_at', a.created_at
           ) ORDER BY a.created_at DESC
         )
    INTO v_items
    FROM public.admin_audit_log a
   WHERE (a.action LIKE 'social_comment.%' OR a.action LIKE 'social_report.%')
     AND (a.detail->>'comment_id')::uuid = p_comment_id;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE(v_items, '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.list_moderation_history_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_moderation_history_v2(UUID) TO authenticated;
