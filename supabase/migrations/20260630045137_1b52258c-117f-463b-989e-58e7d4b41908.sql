
-- 1) Expose XP for leaderboard (deliberate product decision)
GRANT SELECT (xp) ON public.profiles TO authenticated;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = on, security_barrier = true) AS
SELECT id, username, display_name, avatar_id, level, xp, title, bio,
       favorite_state_id, favorite_figure_id,
       campaigns_completed, artifacts_collected, discovery_pct
FROM public.profiles;
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO service_role;

-- 2) Global leaderboard RPCs
CREATE OR REPLACE FUNCTION public.leaderboard_global(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(rank int, id uuid, username text, display_name text, avatar_id text, level int, xp int, is_me boolean, is_friend boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH ranked AS (
    SELECT p.id, p.username, p.display_name, p.avatar_id, p.level, p.xp,
           ROW_NUMBER() OVER (ORDER BY p.xp DESC NULLS LAST, p.level DESC NULLS LAST, p.id)::int AS rank
    FROM public.profiles p
    WHERE COALESCE(p.account_status,'active') = 'active'
  )
  SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id, r.level, r.xp,
         (r.id = auth.uid()) AS is_me,
         EXISTS (
           SELECT 1 FROM public.friendships f
           WHERE f.status='accepted'
             AND ((f.user_a = auth.uid() AND f.user_b = r.id)
               OR (f.user_b = auth.uid() AND f.user_a = r.id))
         ) AS is_friend
  FROM ranked r
  ORDER BY r.rank
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset,0));
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_global(int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.leaderboard_around_me(p_window int DEFAULT 3)
RETURNS TABLE(rank int, id uuid, username text, display_name text, avatar_id text, level int, xp int, is_me boolean, is_friend boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH ranked AS (
    SELECT p.id, p.username, p.display_name, p.avatar_id, p.level, p.xp,
           ROW_NUMBER() OVER (ORDER BY p.xp DESC NULLS LAST, p.level DESC NULLS LAST, p.id)::int AS rank
    FROM public.profiles p
    WHERE COALESCE(p.account_status,'active') = 'active'
  ),
  me AS (SELECT rank AS r FROM ranked WHERE id = auth.uid())
  SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id, r.level, r.xp,
         (r.id = auth.uid()) AS is_me,
         EXISTS (
           SELECT 1 FROM public.friendships f
           WHERE f.status='accepted'
             AND ((f.user_a = auth.uid() AND f.user_b = r.id)
               OR (f.user_b = auth.uid() AND f.user_a = r.id))
         ) AS is_friend
  FROM ranked r, me
  WHERE r.rank BETWEEN me.r - GREATEST(0, COALESCE(p_window,3))
                   AND me.r + GREATEST(0, COALESCE(p_window,3))
  ORDER BY r.rank;
$$;
GRANT EXECUTE ON FUNCTION public.leaderboard_around_me(int) TO authenticated;

-- 3) Generic pending-action reminders (extensible)
CREATE TABLE IF NOT EXISTS public.pending_action_reminders (
  user_id uuid NOT NULL,
  action_key text NOT NULL,
  last_sent_at timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_key)
);
GRANT SELECT ON public.pending_action_reminders TO authenticated;
GRANT ALL ON public.pending_action_reminders TO service_role;
ALTER TABLE public.pending_action_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_select_reminder" ON public.pending_action_reminders;
CREATE POLICY "owner_select_reminder" ON public.pending_action_reminders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4) Generic badges RPC (extensible for future unread counters)
CREATE OR REPLACE FUNCTION public.my_pending_badges()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  fr int := 0;
  notif int := 0;
BEGIN
  IF uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT count(*) INTO fr FROM public.friendships
   WHERE status='pending' AND requester <> uid AND (user_a=uid OR user_b=uid);
  BEGIN
    notif := public.my_unread_notification_count();
  EXCEPTION WHEN OTHERS THEN notif := 0; END;
  RETURN jsonb_build_object(
    'friend_requests', fr,
    'notifications', notif,
    'total', fr + notif
  );
END $$;
GRANT EXECUTE ON FUNCTION public.my_pending_badges() TO authenticated;

-- 5) Send friend-request reminders (called by pg_cron). Summary per user,
--    at most once per 48h, cap of 3 total reminders per pending batch.
CREATE OR REPLACE FUNCTION public.send_friend_request_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
  body_txt text;
BEGIN
  FOR r IN
    SELECT recipient AS user_id, count(*) AS pending_count
    FROM (
      SELECT CASE WHEN f.user_a = f.requester THEN f.user_b ELSE f.user_a END AS recipient
      FROM public.friendships f
      WHERE f.status='pending'
        AND f.created_at < now() - interval '24 hours'
    ) p
    GROUP BY recipient
  LOOP
    -- Skip if we've reminded too recently or too often.
    IF EXISTS (
      SELECT 1 FROM public.pending_action_reminders par
      WHERE par.user_id = r.user_id AND par.action_key='friend_requests'
        AND (par.sent_count >= 3 OR par.last_sent_at > now() - interval '48 hours')
    ) THEN
      CONTINUE;
    END IF;

    body_txt := CASE WHEN r.pending_count = 1
      THEN 'لديك طلب صداقة بانتظارك.'
      ELSE 'لديك ' || r.pending_count || ' طلبات صداقة بانتظار الرد.'
    END;

    INSERT INTO public.notifications (title, body, type, category, target_type, target_user_id, deep_link, status, sent_at)
    VALUES ('تذكير: طلبات صداقة', body_txt, 'friend_request_reminder', 'social', 'user', r.user_id, '/friends?tab=requests', 'sent', now());

    INSERT INTO public.pending_action_reminders(user_id, action_key, last_sent_at, sent_count)
    VALUES (r.user_id, 'friend_requests', now(), 1)
    ON CONFLICT (user_id, action_key) DO UPDATE
      SET last_sent_at = now(),
          sent_count = public.pending_action_reminders.sent_count + 1,
          updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.send_friend_request_reminders() TO service_role;

-- 6) Cancel reminders when no pending requests remain for the recipient.
CREATE OR REPLACE FUNCTION public.reset_friend_reminder_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE recipient uuid;
BEGIN
  recipient := CASE TG_OP
    WHEN 'DELETE' THEN CASE WHEN OLD.user_a = OLD.requester THEN OLD.user_b ELSE OLD.user_a END
    ELSE CASE WHEN NEW.user_a = NEW.requester THEN NEW.user_b ELSE NEW.user_a END
  END;
  IF recipient IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status='pending'
      AND (CASE WHEN f.user_a = f.requester THEN f.user_b ELSE f.user_a END) = recipient
  ) THEN
    DELETE FROM public.pending_action_reminders
     WHERE user_id = recipient AND action_key = 'friend_requests';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS friendships_reset_reminder ON public.friendships;
CREATE TRIGGER friendships_reset_reminder
AFTER INSERT OR UPDATE OR DELETE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.reset_friend_reminder_on_change();

-- 7) Hourly cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('friend-request-reminders-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('friend-request-reminders-hourly', '15 * * * *',
  $cron$SELECT public.send_friend_request_reminders();$cron$);
