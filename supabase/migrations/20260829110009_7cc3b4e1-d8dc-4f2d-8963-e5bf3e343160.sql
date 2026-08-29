-- V16 — Contributions & community comments workshop.
-- Additive / backward compatible: no schema changes, no signature changes.

-- 1. Canonical staff predicate for the feedback system.
--    `is_content_editor()` returns TRUE inside every SECURITY DEFINER
--    function because `current_user` is then the function owner (postgres),
--    which is why ordinary player replies were stored as `admin`.
CREATE OR REPLACE FUNCTION public.is_feedback_staff(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = _uid AND r.role IN ('owner','admin','editor')
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_feedback_staff(uuid) TO authenticated, service_role;

-- 2. Fail-soft external push dispatch for feedback events.
--    Returns TRUE only when the secured send path was actually invoked.
CREATE OR REPLACE FUNCTION public._feedback_dispatch_push(
  p_user uuid, p_title text, p_body text, p_deep_link text, p_dedupe text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_url   text := 'https://incqmwpchlygkzitbxlf.supabase.co/functions/v1/send-notification';
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  BEGIN
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;
  v_token := COALESCE(NULLIF(v_token,''), NULLIF(current_setting('app.settings.service_role_key', true), ''));
  IF v_token IS NULL THEN RETURN false; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_token),
    body := jsonb_build_object(
      'title', p_title, 'body', p_body,
      'type', 'feedback', 'category', 'feedback', 'priority', 'normal',
      'target_type', 'user', 'target_user_id', p_user,
      'deep_link', p_deep_link,
      'dedupe_key', p_dedupe
    )
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_feedback_dispatch_push: dispatch failed (mutation preserved): %', SQLERRM;
  RETURN false;
END;
$function$;

-- 3. Sender classification fix — staff is resolved from user_roles only.
CREATE OR REPLACE FUNCTION public.reply_to_feedback_issue(p_issue_id uuid, p_body text, p_is_internal boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_feedback_staff(auth.uid());
  is_owner boolean := false;
  role text;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT (reporter_id = uid) INTO is_owner FROM public.feedback_issues WHERE id = p_issue_id;
  IF is_owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  -- The reporter always speaks as the player in their own thread, even if
  -- they are also staff. Authorship is never inferred from position.
  IF is_owner THEN
    role := 'player';
    IF p_is_internal AND NOT is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_is_internal THEN role := 'admin'; END IF;
  ELSIF is_admin THEN
    role := 'admin';
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.feedback_messages (issue_id, author_id, author_role, body, is_internal)
  VALUES (p_issue_id, uid, role, trim(p_body), COALESCE(p_is_internal, false))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

-- 4. Thread visibility: internal notes are staff-only (same fix).
CREATE OR REPLACE FUNCTION public.get_feedback_issue_thread(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_feedback_staff(auth.uid());
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
$function$;

-- 5. Dashboard stats: owner/admin/editor may read (owner was rejected).
CREATE OR REPLACE FUNCTION public.admin_feedback_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb;
  v_avg_first interval;
  v_avg_resolution interval;
  v_avg_rating numeric;
  v_rating_count int;
BEGIN
  IF NOT public.is_feedback_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT jsonb_object_agg(status, cnt) INTO v_counts
  FROM (
    SELECT status::text AS status, COUNT(*)::int AS cnt
    FROM public.feedback_issues
    GROUP BY status
  ) s;

  SELECT AVG(fm.created_at - fi.created_at) INTO v_avg_first
  FROM public.feedback_issues fi
  JOIN LATERAL (
    SELECT created_at FROM public.feedback_messages
    WHERE issue_id = fi.id AND author_role = 'admin' AND is_internal = false
    ORDER BY created_at ASC LIMIT 1
  ) fm ON true;

  SELECT AVG(updated_at - created_at) INTO v_avg_resolution
  FROM public.feedback_issues
  WHERE status IN ('closed', 'fixed');

  SELECT AVG(player_rating)::numeric(4,2), COUNT(*)::int
    INTO v_avg_rating, v_rating_count
  FROM public.feedback_issues
  WHERE player_rating IS NOT NULL;

  RETURN jsonb_build_object(
    'counts', COALESCE(v_counts, '{}'::jsonb),
    'avg_first_response_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_first), 0),
    'avg_resolution_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_resolution), 0),
    'avg_rating', COALESCE(v_avg_rating, 0),
    'rating_count', COALESCE(v_rating_count, 0)
  );
END;
$function$;

-- 6. Status change: staff-guarded + real external push (fail-soft fallback
--    to the previous in-app-only insert when no system credential exists).
CREATE OR REPLACE FUNCTION public.set_feedback_issue_status(p_issue_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reporter uuid;
  v_old text;
  v_label text;
  v_body text;
  v_pushed boolean := false;
BEGIN
  IF NOT public.is_feedback_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
    BEGIN
      v_pushed := public._feedback_dispatch_push(
        v_reporter, 'تحديث حالة مساهمتك', v_body,
        '/feedback/' || p_issue_id::text,
        'feedback:status:' || p_issue_id::text || ':' || p_status
      );
    EXCEPTION WHEN OTHERS THEN
      v_pushed := false;
    END;

    IF NOT v_pushed THEN
      INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
      VALUES ('تحديث حالة مساهمتك', v_body, 'feedback', 'feedback', 'user', v_reporter,
              '/feedback/' || p_issue_id::text, 'sent', now());
    END IF;
  END IF;
END;
$function$;

-- 7. Admin reply: same fail-soft external push for the contribution owner only.
CREATE OR REPLACE FUNCTION public.feedback_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reporter uuid;
  v_assigned uuid;
  v_is_first_player_msg boolean;
  v_pushed boolean := false;
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;

  SELECT reporter_id, assigned_to INTO v_reporter, v_assigned
    FROM public.feedback_issues WHERE id = NEW.issue_id;

  UPDATE public.feedback_issues
     SET last_reply_at = NEW.created_at,
         last_reply_by = NEW.author_role,
         admin_unread  = CASE WHEN NEW.author_role = 'player' THEN true ELSE admin_unread END,
         player_unread = CASE WHEN NEW.author_role = 'admin'  THEN true ELSE player_unread END,
         updated_at    = now()
   WHERE id = NEW.issue_id;

  -- Notify the contribution owner when the Irth team replies. Never the
  -- admin author, never a broadcast, never the private reply text.
  IF NEW.author_role = 'admin' AND v_reporter IS NOT NULL AND v_reporter IS DISTINCT FROM NEW.author_id THEN
    BEGIN
      v_pushed := public._feedback_dispatch_push(
        v_reporter,
        'رد جديد من فريق إرث',
        'قام فريق إرث بالرد على مساهمتك.',
        '/feedback/' || NEW.issue_id::text,
        'feedback:reply:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN
      v_pushed := false;
    END;

    IF NOT v_pushed THEN
      INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
      VALUES ('رد جديد من فريق إرث', 'قام فريق إرث بالرد على مساهمتك.', 'feedback', 'feedback',
              'user', v_reporter, '/feedback/' || NEW.issue_id::text, 'sent', now());
    END IF;
  END IF;

  IF NEW.author_role = 'player' THEN
    SELECT COUNT(*) = 1 INTO v_is_first_player_msg
      FROM public.feedback_messages
     WHERE issue_id = NEW.issue_id AND author_role = 'player';
    IF NOT COALESCE(v_is_first_player_msg, false) THEN
      PERFORM public._feedback_notify_admin(
        v_assigned,
        'رد جديد على مساهمة',
        'وصلك رد جديد من لاعب على إحدى المساهمات.',
        NEW.issue_id
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'feedback_messages_after_insert: notification skipped (message preserved): %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 8. New community comment → admin push now opens the actual comment
--    context instead of the report-only moderation queue.
CREATE OR REPLACE FUNCTION public.notify_admins_new_comment_v16()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin  uuid;
  v_token  text;
  v_url    text := 'https://incqmwpchlygkzitbxlf.supabase.co/functions/v1/send-notification';
  v_anchor_type text := NEW.anchor_type::text;
  v_anchor_id   uuid := NEW.anchor_id;
  v_link   text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = NEW.author_id AND r.role IN ('owner','admin')
  ) THEN
    RETURN NULL;
  END IF;

  IF NEW.status NOT IN ('visible','pending') THEN
    RETURN NULL;
  END IF;

  -- A reply resolves to its parent comment's anchor so the tap still lands
  -- on the real content thread.
  IF v_anchor_type = 'comment' THEN
    SELECT p.anchor_type::text, p.anchor_id INTO v_anchor_type, v_anchor_id
      FROM public.social_comments p WHERE p.id = NEW.anchor_id;
  END IF;

  v_link := CASE v_anchor_type
    WHEN 'entity' THEN '/encyclopedia/entity/' || v_anchor_id::text || '?comment=' || NEW.id::text
    WHEN 'story'  THEN '/story/' || v_anchor_id::text || '?comment=' || NEW.id::text
    ELSE NULL
  END;
  -- Never the report-only queue for an ordinary new comment.
  IF v_link IS NULL THEN v_link := '/encyclopedia'; END IF;

  BEGIN
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets
     WHERE name = 'email_queue_service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;
  v_token := COALESCE(NULLIF(v_token, ''), NULLIF(current_setting('app.settings.service_role_key', true), ''));

  IF v_token IS NULL THEN
    RAISE WARNING 'notify_admins_new_comment_v16: no system credential (comment preserved)';
    RETURN NULL;
  END IF;

  FOR v_admin IN
    SELECT DISTINCT r.user_id FROM public.user_roles r WHERE r.role IN ('owner','admin')
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_token
        ),
        body := jsonb_build_object(
          'title',          'تعليق جديد',
          'body',           'وصل تعليق جديد من أحد اللاعبين وينتظر المراجعة.',
          'type',           'new_comment',
          'category',       'social',
          'priority',       'normal',
          'target_type',    'user',
          'target_user_id', v_admin,
          'deep_link',      v_link,
          'dedupe_key',     'comment:new:' || NEW.id::text || ':' || v_admin::text
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_admins_new_comment_v16: dispatch failed (comment preserved): %', SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_new_comment_v16: skipped (comment preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;