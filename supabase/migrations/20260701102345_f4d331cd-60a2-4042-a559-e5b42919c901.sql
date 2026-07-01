
-- =========================================================
-- Community Feedback Center
-- =========================================================

-- ----- issues -----
CREATE TABLE public.feedback_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id text NULL,
  category text NOT NULL CHECK (category IN ('bug','history_correction','improvement','content_suggestion','general','question')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','review','planned','fixed','closed')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_reply_at timestamptz NULL,
  last_reply_by text NULL CHECK (last_reply_by IN ('player','admin')),
  player_unread boolean NOT NULL DEFAULT false,
  admin_unread  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.feedback_issues TO authenticated;
GRANT ALL ON public.feedback_issues TO service_role;

CREATE INDEX feedback_issues_reporter_idx ON public.feedback_issues(reporter_id);
CREATE INDEX feedback_issues_status_idx   ON public.feedback_issues(status);
CREATE INDEX feedback_issues_category_idx ON public.feedback_issues(category);
CREATE INDEX feedback_issues_updated_idx  ON public.feedback_issues(updated_at DESC);

ALTER TABLE public.feedback_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player reads own issues"
  ON public.feedback_issues FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR public.is_content_editor());

CREATE POLICY "player inserts own issues"
  ON public.feedback_issues FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "admin updates issues"
  ON public.feedback_issues FOR UPDATE
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE POLICY "player marks own read"
  ON public.feedback_issues FOR UPDATE
  TO authenticated
  USING (reporter_id = auth.uid())
  WITH CHECK (reporter_id = auth.uid());

-- ----- messages -----
CREATE TABLE public.feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.feedback_issues(id) ON DELETE CASCADE,
  author_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('player','admin')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  is_internal boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.feedback_messages TO authenticated;
GRANT ALL ON public.feedback_messages TO service_role;

CREATE INDEX feedback_messages_issue_idx ON public.feedback_messages(issue_id, created_at);

ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player reads own messages"
  ON public.feedback_messages FOR SELECT
  TO authenticated
  USING (
    public.is_content_editor()
    OR (
      NOT is_internal
      AND EXISTS (
        SELECT 1 FROM public.feedback_issues i
        WHERE i.id = issue_id AND i.reporter_id = auth.uid()
      )
    )
  );

CREATE POLICY "authors insert their own messages"
  ON public.feedback_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (author_role = 'admin' AND public.is_content_editor())
      OR (
        author_role = 'player'
        AND is_internal = false
        AND EXISTS (
          SELECT 1 FROM public.feedback_issues i
          WHERE i.id = issue_id AND i.reporter_id = auth.uid()
        )
      )
    )
  );

-- ----- triggers -----
CREATE OR REPLACE FUNCTION public.feedback_issues_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_issues_touch_tr
  BEFORE UPDATE ON public.feedback_issues
  FOR EACH ROW EXECUTE FUNCTION public.feedback_issues_touch();

CREATE OR REPLACE FUNCTION public.feedback_messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter uuid;
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;

  SELECT reporter_id INTO v_reporter FROM public.feedback_issues WHERE id = NEW.issue_id;

  UPDATE public.feedback_issues
     SET last_reply_at = NEW.created_at,
         last_reply_by = NEW.author_role,
         admin_unread  = CASE WHEN NEW.author_role = 'player' THEN true ELSE admin_unread END,
         player_unread = CASE WHEN NEW.author_role = 'admin'  THEN true ELSE player_unread END,
         updated_at    = now()
   WHERE id = NEW.issue_id;

  -- Notify player when admin replies
  IF NEW.author_role = 'admin' AND v_reporter IS NOT NULL THEN
    INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
    VALUES (
      'رد جديد من فريق إرث',
      'قام فريق إرث بالرد على رسالتك.',
      'feedback', 'feedback',
      'user', v_reporter,
      '/feedback/' || NEW.issue_id::text,
      'sent', now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_messages_after_insert_tr
  AFTER INSERT ON public.feedback_messages
  FOR EACH ROW EXECUTE FUNCTION public.feedback_messages_after_insert();

-- =========================================================
-- RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_feedback_issue(
  p_category text,
  p_title text,
  p_description text,
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category NOT IN ('bug','history_correction','improvement','content_suggestion','general','question') THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  INSERT INTO public.feedback_issues (reporter_id, category, title, description, context)
  VALUES (uid, p_category, trim(p_title), trim(p_description), COALESCE(p_context, '{}'::jsonb))
  RETURNING id INTO new_id;

  INSERT INTO public.feedback_messages (issue_id, author_id, author_role, body)
  VALUES (new_id, uid, 'player', trim(p_description));

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_to_feedback_issue(
  p_issue_id uuid,
  p_body text,
  p_is_internal boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_content_editor();
  is_owner boolean := false;
  role text;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT (reporter_id = uid) INTO is_owner FROM public.feedback_issues WHERE id = p_issue_id;
  IF is_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF is_admin THEN
    role := 'admin';
  ELSIF is_owner THEN
    role := 'player';
    IF p_is_internal THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.feedback_messages (issue_id, author_id, author_role, body, is_internal)
  VALUES (p_issue_id, uid, role, trim(p_body), COALESCE(p_is_internal, false))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_feedback_issue_status(
  p_issue_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter uuid;
  v_old text;
  v_label text;
  v_body text;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('new','review','planned','fixed','closed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT reporter_id, status INTO v_reporter, v_old FROM public.feedback_issues WHERE id = p_issue_id;
  IF v_reporter IS NULL AND v_old IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_old = p_status THEN RETURN; END IF;

  UPDATE public.feedback_issues SET status = p_status, player_unread = true WHERE id = p_issue_id;

  v_label := CASE p_status
    WHEN 'new' THEN 'جديد'
    WHEN 'review' THEN 'قيد المراجعة'
    WHEN 'planned' THEN 'مخطط له'
    WHEN 'fixed' THEN 'تم التنفيذ'
    WHEN 'closed' THEN 'مغلق'
  END;

  v_body := CASE p_status
    WHEN 'fixed' THEN 'تم تنفيذ الاقتراح الذي أرسلته. شكراً لمساهمتك في تطوير إرث.'
    ELSE 'تم تغيير حالة اقتراحك إلى: ' || v_label || '.'
  END;

  IF v_reporter IS NOT NULL THEN
    INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
    VALUES (
      'تحديث حالة مساهمتك',
      v_body,
      'feedback', 'feedback',
      'user', v_reporter,
      '/feedback/' || p_issue_id::text,
      'sent', now()
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_feedback_issue(
  p_issue_id uuid,
  p_assignee uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.feedback_issues SET assigned_to = p_assignee WHERE id = p_issue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_feedback_issue_read(
  p_issue_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_content_editor();
  v_reporter uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT reporter_id INTO v_reporter FROM public.feedback_issues WHERE id = p_issue_id;
  IF v_reporter IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF is_admin THEN
    UPDATE public.feedback_issues SET admin_unread = false WHERE id = p_issue_id;
  END IF;
  IF v_reporter = uid THEN
    UPDATE public.feedback_issues SET player_unread = false WHERE id = p_issue_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_feedback_issues()
RETURNS SETOF public.feedback_issues
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.feedback_issues
   WHERE reporter_id = auth.uid()
   ORDER BY COALESCE(last_reply_at, created_at) DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_feedback_issue_thread(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_content_editor();
  v_issue public.feedback_issues;
  v_msgs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_issue FROM public.feedback_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT is_admin AND v_issue.reporter_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m.*) ORDER BY m.created_at), '[]'::jsonb) INTO v_msgs
  FROM public.feedback_messages m
  WHERE m.issue_id = p_issue_id
    AND (is_admin OR NOT m.is_internal);

  RETURN jsonb_build_object('issue', to_jsonb(v_issue), 'messages', v_msgs);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_feedback_issues(
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := lower(coalesce(p_search,''));
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH rows AS (
    SELECT i.*,
      (SELECT jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_id', p.avatar_id)
         FROM public.profiles p WHERE p.id = i.reporter_id) AS reporter
    FROM public.feedback_issues i
    WHERE (p_status IS NULL OR i.status = p_status)
      AND (p_category IS NULL OR i.category = p_category)
      AND (q = '' OR lower(i.title) LIKE '%'||q||'%' OR lower(i.description) LIKE '%'||q||'%')
    ORDER BY COALESCE(i.last_reply_at, i.created_at) DESC
    LIMIT LEAST(GREATEST(p_limit,1), 500) OFFSET GREATEST(p_offset,0)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(rows.*)), '[]'::jsonb) INTO result FROM rows;
  RETURN result;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_issues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_messages;
