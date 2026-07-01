
-- 1) Baseline for delivering notifications to a user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_started_at timestamptz;

UPDATE public.profiles
   SET notification_started_at = COALESCE(join_date, now())
 WHERE notification_started_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN notification_started_at SET DEFAULT now();
ALTER TABLE public.profiles
  ALTER COLUMN notification_started_at SET NOT NULL;

-- 2) Notification RPCs — filter by baseline
CREATE OR REPLACE FUNCTION public.list_my_notifications(p_limit int DEFAULT 100, p_before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  baseline timestamptz;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  WITH rows AS (
    SELECT
      n.id, n.title, n.body, n.type, n.category, n.icon, n.image_url,
      n.deep_link, n.payload, n.priority, n.sender,
      n.created_at, n.sent_at,
      d.id AS delivery_id, d.read_at, d.opened_at, d.dismissed_at
    FROM public.notifications n
    LEFT JOIN public.notification_deliveries d
      ON d.notification_id = n.id AND d.user_id = uid
    WHERE n.status = 'sent'
      AND n.created_at >= baseline
      AND (
        (n.target_type = 'user' AND n.target_user_id = uid)
        OR (n.target_type IN ('broadcast','all'))
      )
      AND (d.deleted_at IS NULL)
      AND (p_before IS NULL OR n.created_at < p_before)
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(rows.*) ORDER BY rows.created_at DESC), '[]'::jsonb) INTO result FROM rows;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.my_unread_notification_count()
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  baseline timestamptz;
  c int;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  SELECT count(*) INTO c FROM public.notifications n
    LEFT JOIN public.notification_deliveries d
      ON d.notification_id = n.id AND d.user_id = uid
    WHERE n.status='sent'
      AND n.created_at >= baseline
      AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
      AND (d.deleted_at IS NULL)
      AND (d.read_at IS NULL);
  RETURN coalesce(c,0);
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  baseline timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  UPDATE public.notification_deliveries SET read_at = now()
   WHERE user_id = uid AND read_at IS NULL AND deleted_at IS NULL;
  INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at, read_at)
  SELECT n.id, uid, 'inapp', 'delivered', now(), now()
  FROM public.notifications n
  WHERE n.status='sent'
    AND n.created_at >= baseline
    AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
    AND NOT EXISTS (SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id=n.id AND d.user_id=uid);
END $$;

CREATE OR REPLACE FUNCTION public.clear_my_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  baseline timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  UPDATE public.notification_deliveries SET deleted_at = now()
    WHERE user_id = uid AND deleted_at IS NULL;
  INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at, deleted_at)
  SELECT n.id, uid, 'inapp', 'delivered', now(), now()
  FROM public.notifications n
  WHERE n.status='sent'
    AND n.created_at >= baseline
    AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
    AND NOT EXISTS (SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id=n.id AND d.user_id=uid);
END $$;

-- 3) Friendship-gated public profile fetchers
CREATE OR REPLACE FUNCTION public.get_gated_public_profile(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  allowed boolean := false;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_user_id = uid THEN
    allowed := true;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM public.friendships
       WHERE status = 'accepted'
         AND ((user_a = uid AND user_b = p_user_id) OR (user_a = p_user_id AND user_b = uid))
    ) INTO allowed;
  END IF;
  IF NOT allowed THEN RETURN NULL; END IF;
  SELECT to_jsonb(pp.*) INTO result FROM public.public_profiles pp WHERE pp.id = p_user_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_gated_public_profile_by_username(p_username text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  target uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT id INTO target FROM public.public_profiles WHERE lower(username) = lower(p_username) LIMIT 1;
  IF target IS NULL THEN RETURN NULL; END IF;
  RETURN public.get_gated_public_profile(target);
END $$;

GRANT EXECUTE ON FUNCTION public.get_gated_public_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gated_public_profile_by_username(text) TO authenticated;
