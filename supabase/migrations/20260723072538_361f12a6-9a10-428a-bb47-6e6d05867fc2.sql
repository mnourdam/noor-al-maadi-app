
-- ============================================================
-- P6 Step 7 — Contribution Workflow ("ساهمت في تحسين إرث")
-- ============================================================

-- 1) Extend personal_notifications kind CHECK to include the new
--    'comment_contribution_applied' event. Preserve all Step 3 kinds.
ALTER TABLE public.personal_notifications
  DROP CONSTRAINT IF EXISTS personal_notifications_kind_chk;
ALTER TABLE public.personal_notifications
  ADD CONSTRAINT personal_notifications_kind_chk CHECK (kind IN (
    'story_reaction_on_comment',
    'comment_promoted_editor_note',
    'comment_marked_contribution',
    'comment_contribution_applied',
    'comment_hidden',
    'comment_restored',
    'story_unlocked'
  ));

-- 2) Contribution category enum.
DO $$ BEGIN
  CREATE TYPE public.contribution_category AS ENUM (
    'fact_correction',
    'additional_context',
    'source_reference',
    'translation_nuance',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Contribution status enum.
DO $$ BEGIN
  CREATE TYPE public.contribution_status AS ENUM (
    'proposed',
    'applied',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Extend social_comment_contributions with the editorial workflow columns.
ALTER TABLE public.social_comment_contributions
  ADD COLUMN IF NOT EXISTS status public.contribution_status NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS category public.contribution_category NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS editor_note TEXT,
  ADD COLUMN IF NOT EXISTS public_notice_text TEXT,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS social_comment_contributions_touch_updated ON public.social_comment_contributions;
CREATE TRIGGER social_comment_contributions_touch_updated
  BEFORE UPDATE ON public.social_comment_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS social_comment_contributions_status_idx
  ON public.social_comment_contributions (status, updated_at DESC);

-- The prior "public read contributions" policy over the whole table would leak
-- reviewer identity and the private editor_note. Replace with an explicit
-- reader RPC (below) and drop broad SELECT for anon.
REVOKE SELECT ON public.social_comment_contributions FROM anon;
DROP POLICY IF EXISTS "public read contributions" ON public.social_comment_contributions;

-- 5) mark_contribution_v2 — moderator marks a visible comment as a proposed
--    contribution. Idempotent for the same category. Emits one-shot
--    'comment_marked_contribution' notification on first mark only.
CREATE OR REPLACE FUNCTION public.mark_contribution_v2(
  p_comment_id UUID,
  p_category   public.contribution_category,
  p_note       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_row    public.social_comments;
  v_first  BOOLEAN;
  v_story  RECORD;
  v_payload JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.status <> 'visible' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_visible');
  END IF;

  v_first := NOT EXISTS (
    SELECT 1 FROM public.social_comment_contributions WHERE comment_id = p_comment_id
  );

  INSERT INTO public.social_comment_contributions
    (comment_id, marked_by, marked_at, note, status, category)
  VALUES
    (p_comment_id, v_uid, now(), p_note, 'proposed', p_category)
  ON CONFLICT (comment_id) DO UPDATE
    SET category = EXCLUDED.category,
        note     = COALESCE(EXCLUDED.note, public.social_comment_contributions.note),
        -- Only re-open to 'proposed' if not already applied/archived.
        status   = CASE WHEN public.social_comment_contributions.status = 'proposed'
                        THEN 'proposed'
                        ELSE public.social_comment_contributions.status END,
        updated_at = now();

  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (
    v_uid, 'social_contribution.mark',
    jsonb_build_object(
      'comment_id', p_comment_id,
      'anchor_type', v_row.anchor_type,
      'anchor_id',   v_row.anchor_id,
      'author_id',   v_row.author_id,
      'category',    p_category,
      'first_mark',  v_first
    ),
    p_note
  );

  IF v_first AND v_row.author_id IS NOT NULL AND v_row.author_id <> v_uid THEN
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
      'category',    p_category::text,
      'comment_preview', LEFT(v_row.body_text, 120)
    );
    PERFORM public._emit_personal_notification(
      v_row.author_id,
      'comment_marked_contribution',
      v_row.anchor_type,
      v_row.id,
      'contribution:marked:' || v_row.id::text,
      v_uid,
      v_payload,
      FALSE
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'first_mark', v_first);
END $$;
REVOKE ALL ON FUNCTION public.mark_contribution_v2(UUID, public.contribution_category, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_contribution_v2(UUID, public.contribution_category, TEXT) TO authenticated;

-- 6) unmark_contribution_v2 — moderator revokes a still-proposed mark.
--    Applied / archived contributions are terminal and cannot be unmarked.
CREATE OR REPLACE FUNCTION public.unmark_contribution_v2(
  p_comment_id UUID,
  p_reason     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_c   public.social_comment_contributions;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_c FROM public.social_comment_contributions WHERE comment_id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_c.status <> 'proposed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'terminal_status');
  END IF;
  DELETE FROM public.social_comment_contributions WHERE comment_id = p_comment_id;
  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (v_uid, 'social_contribution.unmark',
          jsonb_build_object('comment_id', p_comment_id), p_reason);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.unmark_contribution_v2(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unmark_contribution_v2(UUID, TEXT) TO authenticated;

-- 7) apply_contribution_v2 — editor accepts. Records the anonymous public
--    notice text and emits a one-shot 'comment_contribution_applied' event.
CREATE OR REPLACE FUNCTION public.apply_contribution_v2(
  p_comment_id       UUID,
  p_public_notice    TEXT,
  p_editor_note      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_c   public.social_comment_contributions;
  v_row public.social_comments;
  v_story RECORD;
  v_payload JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF p_public_notice IS NULL OR btrim(p_public_notice) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'public_notice_required');
  END IF;
  IF length(p_public_notice) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'public_notice_too_long');
  END IF;

  SELECT * INTO v_c FROM public.social_comment_contributions WHERE comment_id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_c.status <> 'proposed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'terminal_status');
  END IF;
  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'comment_missing'); END IF;

  UPDATE public.social_comment_contributions
     SET status = 'applied',
         public_notice_text = btrim(p_public_notice),
         editor_note = COALESCE(p_editor_note, editor_note),
         applied_by = v_uid,
         applied_at = now(),
         updated_at = now()
   WHERE comment_id = p_comment_id;

  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (v_uid, 'social_contribution.apply',
    jsonb_build_object(
      'comment_id', p_comment_id,
      'anchor_type', v_row.anchor_type,
      'anchor_id',   v_row.anchor_id,
      'author_id',   v_row.author_id,
      'category',    v_c.category,
      'public_notice', btrim(p_public_notice)
    ),
    p_editor_note);

  IF v_row.author_id IS NOT NULL AND v_row.author_id <> v_uid THEN
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
      'category',    v_c.category::text,
      'public_notice', btrim(p_public_notice)
    );
    PERFORM public._emit_personal_notification(
      v_row.author_id,
      'comment_contribution_applied',
      v_row.anchor_type,
      v_row.id,
      'contribution:applied:' || v_row.id::text,
      v_uid,
      v_payload,
      FALSE
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.apply_contribution_v2(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_contribution_v2(UUID, TEXT, TEXT) TO authenticated;

-- 8) archive_contribution_v2 — editor declines. Terminal. No notification.
CREATE OR REPLACE FUNCTION public.archive_contribution_v2(
  p_comment_id UUID,
  p_editor_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_c   public.social_comment_contributions;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT * INTO v_c FROM public.social_comment_contributions WHERE comment_id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_c.status <> 'proposed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'terminal_status');
  END IF;
  UPDATE public.social_comment_contributions
     SET status = 'archived',
         editor_note = COALESCE(p_editor_note, editor_note),
         archived_by = v_uid,
         archived_at = now(),
         updated_at = now()
   WHERE comment_id = p_comment_id;
  INSERT INTO public.admin_audit_log (actor_id, action, detail, reason)
  VALUES (v_uid, 'social_contribution.archive',
    jsonb_build_object('comment_id', p_comment_id, 'category', v_c.category),
    p_editor_note);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.archive_contribution_v2(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_contribution_v2(UUID, TEXT) TO authenticated;

-- 9) list_contribution_queue_v2 — admin view. Includes proposed / applied /
--    archived. Cursor is (updated_at DESC, comment_id DESC).
CREATE OR REPLACE FUNCTION public.list_contribution_queue_v2(
  p_status TEXT DEFAULT 'proposed',   -- 'proposed' | 'applied' | 'archived' | 'all'
  p_cursor TEXT DEFAULT NULL,
  p_limit  INT  DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lim INT := GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
  v_ts  TIMESTAMPTZ;
  v_id  UUID;
  v_items JSONB;
  v_next TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF p_cursor IS NOT NULL AND position('|' in p_cursor) > 0 THEN
    v_ts := split_part(p_cursor, '|', 1)::timestamptz;
    v_id := split_part(p_cursor, '|', 2)::uuid;
  END IF;

  WITH rows AS (
    SELECT c.comment_id,
           c.status,
           c.category,
           c.marked_by, c.marked_at, c.note,
           c.editor_note,
           c.public_notice_text,
           c.applied_by, c.applied_at,
           c.archived_by, c.archived_at,
           c.updated_at,
           sc.anchor_type,
           sc.anchor_id,
           sc.author_id,
           sc.body_text,
           sc.status AS comment_status,
           sc.created_at AS comment_created_at,
           sc.editors_note
      FROM public.social_comment_contributions c
      JOIN public.social_comments sc ON sc.id = c.comment_id
     WHERE (p_status = 'all' OR c.status::text = p_status)
       AND (v_ts IS NULL OR (c.updated_at, c.comment_id) < (v_ts, v_id))
     ORDER BY c.updated_at DESC, c.comment_id DESC
     LIMIT v_lim + 1
  )
  SELECT jsonb_agg(to_jsonb(rows.*) ORDER BY updated_at DESC, comment_id DESC)
    INTO v_items
    FROM (SELECT * FROM rows LIMIT v_lim) rows;

  IF (SELECT COUNT(*) FROM rows) > v_lim THEN
    SELECT to_char((r.updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || r.comment_id::text
      INTO v_next
      FROM rows r
     ORDER BY r.updated_at DESC, r.comment_id DESC
     OFFSET v_lim - 1 LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb),
    'next_cursor', v_next
  );
END $$;
REVOKE ALL ON FUNCTION public.list_contribution_queue_v2(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_contribution_queue_v2(TEXT, TEXT, INT) TO authenticated;

-- 10) list_public_contributions_v2 — anonymous transparency notice for an
--     anchor (Story / Encyclopedia). Only fields safe to display publicly.
CREATE OR REPLACE FUNCTION public.list_public_contributions_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_items JSONB;
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
     AND sc.anchor_id   = p_anchor_id;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.list_public_contributions_v2(public.social_anchor_type, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_contributions_v2(public.social_anchor_type, UUID) TO anon, authenticated;

-- 11) my_contribution_flags_v2 — for the current user, return per-comment
--     contribution status so the client can render the personal badge on
--     their own comments without exposing anyone else's contribution data.
CREATE OR REPLACE FUNCTION public.my_contribution_flags_v2(
  p_comment_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_items JSONB;
BEGIN
  IF v_uid IS NULL OR p_comment_ids IS NULL OR array_length(p_comment_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'items', '[]'::jsonb);
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'comment_id', sc.id,
    'status',     c.status,
    'category',   c.category,
    'applied_at', c.applied_at
  ))
    INTO v_items
    FROM public.social_comments sc
    JOIN public.social_comment_contributions c ON c.comment_id = sc.id
   WHERE sc.id = ANY(p_comment_ids)
     AND sc.author_id = v_uid
     AND c.status IN ('proposed','applied');
  RETURN jsonb_build_object('ok', true, 'items', COALESCE(v_items, '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.my_contribution_flags_v2(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_contribution_flags_v2(UUID[]) TO authenticated;
