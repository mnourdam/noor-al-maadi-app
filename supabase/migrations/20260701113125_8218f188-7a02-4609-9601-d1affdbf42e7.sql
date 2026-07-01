
-- ============================================================
-- Community Feedback: admin notifications + daily creation limit
-- ============================================================

-- Helper: resolve main admin user (mnourdam@gmail.com) with fallback
CREATE OR REPLACE FUNCTION public._feedback_main_admin_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users WHERE lower(email) = 'mnourdam@gmail.com' LIMIT 1;
$$;

-- Helper: send an admin-only feedback notification
CREATE OR REPLACE FUNCTION public._feedback_notify_admin(
  p_admin uuid, p_title text, p_body text, p_issue uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := p_admin;
BEGIN
  IF v_target IS NULL THEN
    v_target := public._feedback_main_admin_id();
  END IF;
  IF v_target IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
  VALUES (p_title, p_body, 'feedback', 'feedback', 'user', v_target, '/admin/community', 'sent', now());
END;
$$;

-- ---------- 1) Daily creation limit + admin notification on new issue ----------
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
  v_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_category NOT IN ('bug','history_correction','improvement','content_suggestion','general','question') THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  -- Daily limit: max 3 new issues per player per calendar day (UTC).
  SELECT COUNT(*) INTO v_count
    FROM public.feedback_issues
   WHERE reporter_id = uid
     AND created_at >= date_trunc('day', now());
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'daily_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.feedback_issues (reporter_id, category, title, description, context)
  VALUES (uid, p_category, trim(p_title), trim(p_description), COALESCE(p_context, '{}'::jsonb))
  RETURNING id INTO new_id;

  INSERT INTO public.feedback_messages (issue_id, author_id, author_role, body)
  VALUES (new_id, uid, 'player', trim(p_description));

  -- Notify main admin about the new submission
  PERFORM public._feedback_notify_admin(
    NULL,
    'مساهمة جديدة',
    'وصلت مساهمة جديدة من أحد اللاعبين.',
    new_id
  );

  RETURN new_id;
END;
$$;

-- ---------- 2) Player reply → notify assigned admin (or main admin) ----------
-- Extend the existing after-insert trigger: keep player notification on admin reply,
-- and additionally notify the admin when the player replies (author_role = 'player').
CREATE OR REPLACE FUNCTION public.feedback_messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter uuid;
  v_assigned uuid;
  v_is_first_player_msg boolean;
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

  -- Notify admin when the player replies. Skip the very first player message
  -- (created inside create_feedback_issue), which already triggers a
  -- "مساهمة جديدة" admin notification.
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
END;
$$;

-- ---------- 3) Rating → notify admin ----------
CREATE OR REPLACE FUNCTION public.rate_feedback_issue(p_issue_id uuid, p_rating smallint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter uuid;
  v_assigned uuid;
  v_status text;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid rating';
  END IF;
  SELECT reporter_id, assigned_to, status::text
    INTO v_reporter, v_assigned, v_status
    FROM public.feedback_issues WHERE id = p_issue_id;
  IF v_reporter IS NULL OR v_reporter <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF v_status <> 'closed' THEN
    RAISE EXCEPTION 'issue must be closed to rate';
  END IF;
  UPDATE public.feedback_issues
    SET player_rating = p_rating,
        player_rating_at = now(),
        updated_at = now()
    WHERE id = p_issue_id;

  PERFORM public._feedback_notify_admin(
    v_assigned,
    'تقييم جديد لمساهمة',
    'قام لاعب بتقييم الرد على إحدى المساهمات.',
    p_issue_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_feedback_issue(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_feedback_issue(text, text, text, jsonb) TO authenticated;
