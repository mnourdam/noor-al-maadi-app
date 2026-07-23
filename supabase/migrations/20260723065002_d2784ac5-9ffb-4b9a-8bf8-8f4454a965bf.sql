
-- ============================================================
-- P6 Step 2 — Comments on Stories
-- Anchor-agnostic table; reuses the frozen social_anchor_type enum.
-- Table is locked (RLS on, no policies). All access via SECURITY DEFINER RPCs.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_type public.social_anchor_type NOT NULL,
  anchor_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',
  moderation_reason TEXT,
  moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  editors_note BOOLEAN NOT NULL DEFAULT FALSE,
  editors_note_rank INTEGER,
  edit_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_comments_status_chk CHECK (status IN ('visible','hidden','removed','pending')),
  CONSTRAINT social_comments_body_len_chk CHECK (char_length(body_text) BETWEEN 0 AND 300),
  CONSTRAINT social_comments_body_plain_chk CHECK (body_text !~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]'),
  CONSTRAINT social_comments_note_rank_chk CHECK (editors_note_rank IS NULL OR (editors_note AND editors_note_rank BETWEEN 1 AND 3))
);

-- Table LOCKED: RLS enabled with NO policies. Access only via SECURITY DEFINER RPCs.
GRANT ALL ON public.social_comments TO service_role;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS social_comments_anchor_created_idx
  ON public.social_comments (anchor_type, anchor_id, created_at DESC)
  WHERE status = 'visible';
CREATE INDEX IF NOT EXISTS social_comments_anchor_helpful_idx
  ON public.social_comments (anchor_type, anchor_id, helpful_count DESC, created_at DESC, id DESC)
  WHERE status = 'visible' AND editors_note = FALSE;
CREATE INDEX IF NOT EXISTS social_comments_editors_notes_idx
  ON public.social_comments (anchor_type, anchor_id, editors_note_rank NULLS LAST, created_at DESC)
  WHERE status = 'visible' AND editors_note = TRUE;
CREATE INDEX IF NOT EXISTS social_comments_author_anchor_idx
  ON public.social_comments (author_id, anchor_type, anchor_id)
  WHERE status IN ('visible','pending');
CREATE INDEX IF NOT EXISTS social_comments_author_recent_idx
  ON public.social_comments (author_id, created_at DESC);

CREATE TRIGGER social_comments_touch_updated
  BEFORE UPDATE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Normalize: collapse CRLF -> LF, strip control chars, trim; NULL if empty.
CREATE OR REPLACE FUNCTION public._normalize_comment_body(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(coalesce(p,''), E'\r\n', E'\n', 'g'),
        E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', '', 'g'
      )
    ),
    ''
  )
$$;

-- ============================================================
-- add_story_comment_v2
-- ============================================================
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

  IF p_anchor_type = 'story' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_anchor_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'anchor_not_found');
    END IF;
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

-- ============================================================
-- edit_story_comment_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.edit_story_comment_v2(
  p_comment_id UUID,
  p_body TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_body TEXT;
  v_row public.social_comments;
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

  SELECT * INTO v_row FROM public.social_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.author_id <> v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'forbidden'); END IF;
  IF v_row.status NOT IN ('visible','pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_editable');
  END IF;
  IF now() > v_row.edit_deadline_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'edit_window_closed');
  END IF;

  UPDATE public.social_comments
     SET body_text = v_body, edited_at = now()
   WHERE id = p_comment_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'comment', to_jsonb(v_row) - 'moderation_reason' - 'moderated_by'
  );
END $$;

REVOKE ALL ON FUNCTION public.edit_story_comment_v2(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_story_comment_v2(UUID, TEXT) TO authenticated;

-- ============================================================
-- delete_own_comment_v2 (soft-delete; body cleared)
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
  UPDATE public.social_comments
     SET status = 'removed', body_text = '', editors_note = FALSE, editors_note_rank = NULL
   WHERE id = p_comment_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.delete_own_comment_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_comment_v2(UUID) TO authenticated;

-- ============================================================
-- list_comments_v2 — paginated with keyset cursor
-- Sort: 'editors_helpful_new' (default) or 'newest'.
-- editors_notes returned only on first page of default sort (cap 3).
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_comments_v2(
  p_anchor_type public.social_anchor_type,
  p_anchor_id UUID,
  p_sort TEXT DEFAULT 'editors_helpful_new',
  p_cursor TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_uid UUID := auth.uid();
  v_editors JSONB := '[]'::jsonb;
  v_items JSONB := '[]'::jsonb;
  v_next TEXT := NULL;
  v_cursor JSONB;
  v_rows JSONB;
  v_has_more BOOLEAN;
  v_last JSONB;
BEGIN
  IF p_sort NOT IN ('editors_helpful_new','newest') THEN
    p_sort := 'editors_helpful_new';
  END IF;

  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    BEGIN
      v_cursor := convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN v_cursor := NULL;
    END;
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
         ORDER BY editors_note_rank NULLS LAST, created_at DESC
         LIMIT 3
      ) t;
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
           AND (
             v_cursor IS NULL
             OR (helpful_count, created_at, id) < (
               (v_cursor->>'hc')::int,
               (v_cursor->>'ts')::timestamptz,
               (v_cursor->>'id')::uuid
             )
           )
         ORDER BY helpful_count DESC, created_at DESC, id DESC
         LIMIT v_limit + 1
      ) p;

    v_has_more := jsonb_array_length(v_rows) > v_limit;
    IF v_has_more THEN
      v_items := (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS a(elem, ord) ORDER BY ord LIMIT v_limit) s);
      v_last := v_items->(v_limit - 1);
      v_next := encode(convert_to(jsonb_build_object(
        'hc', (v_last->>'helpful_count')::int,
        'ts', v_last->>'created_at',
        'id', v_last->>'id'
      )::text, 'UTF8'), 'base64');
    ELSE
      v_items := v_rows;
    END IF;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT id, anchor_type, anchor_id, author_id, body_text, status,
               helpful_count, editors_note, editors_note_rank,
               edited_at, created_at, edit_deadline_at,
               (author_id = v_uid) AS is_mine
          FROM public.social_comments
         WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id
           AND status = 'visible'
           AND (
             v_cursor IS NULL
             OR (created_at, id) < (
               (v_cursor->>'ts')::timestamptz,
               (v_cursor->>'id')::uuid
             )
           )
         ORDER BY created_at DESC, id DESC
         LIMIT v_limit + 1
      ) p;

    v_has_more := jsonb_array_length(v_rows) > v_limit;
    IF v_has_more THEN
      v_items := (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS a(elem, ord) ORDER BY ord LIMIT v_limit) s);
      v_last := v_items->(v_limit - 1);
      v_next := encode(convert_to(jsonb_build_object(
        'ts', v_last->>'created_at',
        'id', v_last->>'id'
      )::text, 'UTF8'), 'base64');
    ELSE
      v_items := v_rows;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sort', p_sort,
    'editors_notes', v_editors,
    'items', v_items,
    'next_cursor', v_next,
    'total_visible', (
      SELECT COUNT(*) FROM public.social_comments
       WHERE anchor_type = p_anchor_type AND anchor_id = p_anchor_id AND status = 'visible'
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.list_comments_v2(public.social_anchor_type, UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_comments_v2(public.social_anchor_type, UUID, TEXT, TEXT, INT) TO anon, authenticated;

-- ============================================================
-- moderate_comment_v2 — admin-only. Actions: hide, restore, pin_note, unpin_note.
-- Pin cap of 3 Editor's Notes per anchor enforced here.
-- ============================================================
CREATE OR REPLACE FUNCTION public.moderate_comment_v2(
  p_comment_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_rank INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.social_comments;
  v_pinned INT;
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
  ELSIF p_action = 'restore' THEN
    UPDATE public.social_comments
       SET status='visible', moderation_reason=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
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
  ELSIF p_action = 'unpin_note' THEN
    UPDATE public.social_comments
       SET editors_note=FALSE, editors_note_rank=NULL, moderated_by=v_uid, moderated_at=now()
     WHERE id = p_comment_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_comment_v2(UUID, TEXT, TEXT, INT) TO authenticated;
