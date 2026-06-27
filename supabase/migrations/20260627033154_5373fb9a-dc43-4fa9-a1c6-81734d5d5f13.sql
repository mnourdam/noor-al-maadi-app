
-- 1. Extend notifications with icon/priority/sender/category/payload
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sender text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Extend deliveries with per-user lifecycle + analytics
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user_unread
  ON public.notification_deliveries (user_id, deleted_at, read_at);

-- 3. Notification preferences (architecture only; no UI yet)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs read"   ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs upsert" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_deliveries;

-- 5. RPCs ------------------------------------------------------------
-- Ensure a delivery row exists for in-app/system notifications targeted to user
CREATE OR REPLACE FUNCTION public.ensure_my_delivery(p_notification_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  did uuid;
  n record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT id, target_type, target_user_id INTO n FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF n.target_type = 'user' AND n.target_user_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO did FROM public.notification_deliveries
    WHERE notification_id = p_notification_id AND user_id = uid LIMIT 1;
  IF did IS NULL THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at)
    VALUES (p_notification_id, uid, 'inapp', 'delivered', now())
    RETURNING id INTO did;
  END IF;
  RETURN did;
END $$;

-- List notifications for current user (merges deliveries + broadcasts)
CREATE OR REPLACE FUNCTION public.list_my_notifications(p_limit int DEFAULT 100, p_before timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
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
DECLARE uid uuid := auth.uid(); c int;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT count(*) INTO c FROM public.notifications n
    LEFT JOIN public.notification_deliveries d
      ON d.notification_id = n.id AND d.user_id = uid
    WHERE n.status='sent'
      AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
      AND (d.deleted_at IS NULL)
      AND (d.read_at IS NULL);
  RETURN coalesce(c,0);
END $$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); did uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  did := public.ensure_my_delivery(p_notification_id);
  UPDATE public.notification_deliveries
     SET read_at = COALESCE(read_at, now()),
         opened_at = COALESCE(opened_at, now())
   WHERE id = did;
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  -- update existing
  UPDATE public.notification_deliveries SET read_at = now()
   WHERE user_id = uid AND read_at IS NULL AND deleted_at IS NULL;
  -- materialize missing deliveries for broadcasts
  INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at, read_at)
  SELECT n.id, uid, 'inapp', 'delivered', now(), now()
  FROM public.notifications n
  WHERE n.status='sent'
    AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
    AND NOT EXISTS (SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id=n.id AND d.user_id=uid);
END $$;

CREATE OR REPLACE FUNCTION public.delete_my_notification(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); did uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  did := public.ensure_my_delivery(p_notification_id);
  UPDATE public.notification_deliveries SET deleted_at = now() WHERE id = did;
END $$;

CREATE OR REPLACE FUNCTION public.clear_my_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE public.notification_deliveries SET deleted_at = now()
    WHERE user_id = uid AND deleted_at IS NULL;
  INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at, deleted_at)
  SELECT n.id, uid, 'inapp', 'delivered', now(), now()
  FROM public.notifications n
  WHERE n.status='sent'
    AND ((n.target_type='user' AND n.target_user_id=uid) OR n.target_type IN ('broadcast','all'))
    AND NOT EXISTS (SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id=n.id AND d.user_id=uid);
END $$;

CREATE OR REPLACE FUNCTION public.record_notification_dismissed(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); did uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  did := public.ensure_my_delivery(p_notification_id);
  UPDATE public.notification_deliveries SET dismissed_at = COALESCE(dismissed_at, now()) WHERE id = did;
END $$;

-- Preferences helpers
CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT categories FROM public.notification_preferences WHERE user_id = auth.uid()), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.set_my_notification_preferences(p_categories jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  INSERT INTO public.notification_preferences (user_id, categories)
  VALUES (uid, COALESCE(p_categories, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE SET categories = EXCLUDED.categories, updated_at = now();
END $$;
