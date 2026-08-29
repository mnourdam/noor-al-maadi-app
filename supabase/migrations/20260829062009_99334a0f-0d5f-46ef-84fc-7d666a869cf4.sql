-- ============================================================
-- V16 — NEW COMMUNITY COMMENT -> ADMIN PUSH  (ADDITIVE ONLY)
-- ------------------------------------------------------------
-- Producer is server-owned: an AFTER INSERT trigger on
-- public.social_comments. It reuses the ONE secured send path
-- (`send-notification` Edge Function) via pg_net, exactly like the
-- existing email queue dispatcher does. It never talks to FCM,
-- never writes public.notifications directly, and never broadcasts.
--
-- Nothing existing is altered: no schema change, no signature
-- change, no behaviour change to add_story_comment_v2. V15 clients
-- keep working unchanged and send no new fields.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS social_comments_notify_admins_v16 ON public.social_comments;
--   DROP FUNCTION IF EXISTS public.notify_admins_new_comment_v16();
-- ============================================================

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
BEGIN
  -- 1. Community comments only. A comment authored by an owner/admin is a
  --    staff action, not something that needs moderation review.
  IF EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = NEW.author_id AND r.role IN ('owner','admin')
  ) THEN
    RETURN NULL;
  END IF;

  -- 2. Only genuinely reviewable new rows.
  IF NEW.status NOT IN ('visible','pending') THEN
    RETURN NULL;
  END IF;

  -- 3. System credential, resolved server-side only. Never client supplied.
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

  -- 4. Recipients resolved server-side from the canonical role table.
  --    One targeted notification per admin: `target_type = user` is the only
  --    shape the Notification Center can show per-user, and it can never widen
  --    into a broadcast.
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
          -- Fixed, privacy-safe copy. NEVER the comment body, author identity
          -- or email — this text reaches the lock screen.
          'title',          'تعليق جديد',
          'body',           'وصل تعليق جديد من أحد اللاعبين وينتظر المراجعة.',
          'type',           'new_comment',
          'category',       'social',
          'priority',       'normal',
          'target_type',    'user',
          'target_user_id', v_admin,
          -- Fixed trusted route; never derived from comment content.
          'deep_link',      '/admin/moderation',
          -- Stable logical identity: retries collapse onto the same row.
          'dedupe_key',     'comment:new:' || NEW.id::text || ':' || v_admin::text
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Push is strictly secondary: the comment must survive any dispatch error.
      RAISE WARNING 'notify_admins_new_comment_v16: dispatch failed (comment preserved): %', SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_new_comment_v16: skipped (comment preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_admins_new_comment_v16() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS social_comments_notify_admins_v16 ON public.social_comments;
CREATE TRIGGER social_comments_notify_admins_v16
AFTER INSERT ON public.social_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_comment_v16();