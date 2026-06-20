-- 1) notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'manual',
  target_type text NOT NULL DEFAULT 'all',
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  deep_link text,
  image_url text,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_status_idx ON public.notifications(status);
CREATE INDEX IF NOT EXISTS notifications_target_user_idx ON public.notifications(target_user_id);
CREATE INDEX IF NOT EXISTS notifications_scheduled_at_idx ON public.notifications(scheduled_at);

GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read sent notifications addressed to them"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    status = 'sent'
    AND (target_type = 'all' OR target_user_id = auth.uid())
  );

CREATE TRIGGER notifications_touch_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) notification_deliveries
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_deliveries_notification_idx ON public.notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS notif_deliveries_user_idx ON public.notification_deliveries(user_id);

GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own delivery rows"
  ON public.notification_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3) today_in_history_events
CREATE TABLE IF NOT EXISTS public.today_in_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  day integer NOT NULL CHECK (day BETWEEN 1 AND 31),
  title text NOT NULL,
  body text NOT NULL,
  hijri_year text,
  gregorian_year text,
  deep_link text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tih_month_day_idx ON public.today_in_history_events(month, day);
CREATE INDEX IF NOT EXISTS tih_enabled_idx ON public.today_in_history_events(enabled);

GRANT SELECT ON public.today_in_history_events TO anon;
GRANT SELECT ON public.today_in_history_events TO authenticated;
GRANT ALL ON public.today_in_history_events TO service_role;

ALTER TABLE public.today_in_history_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled today-in-history events"
  ON public.today_in_history_events FOR SELECT
  USING (enabled = true);