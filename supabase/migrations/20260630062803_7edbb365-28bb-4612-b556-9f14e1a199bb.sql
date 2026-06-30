
-- Additive extensions for the upgraded notifications admin.
-- All columns are nullable / have safe defaults so legacy rows and the
-- existing send-notification edge function keep working unchanged.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[],
  ADD COLUMN IF NOT EXISTS target_segment_id text,
  ADD COLUMN IF NOT EXISTS schedule jsonb,
  ADD COLUMN IF NOT EXISTS analytics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_schedule_mode_idx
  ON public.notifications ((schedule->>'mode'))
  WHERE status = 'scheduled' AND schedule IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_archived_idx
  ON public.notifications (archived_at);

-- RPC: increment a click counter on the notification's analytics jsonb.
-- SECURITY DEFINER so a signed-in user can record their own click without
-- needing UPDATE rights on notifications.
CREATE OR REPLACE FUNCTION public.record_notification_click(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.notifications
     SET analytics = jsonb_set(
           COALESCE(analytics, '{}'::jsonb),
           '{clicks}',
           to_jsonb(COALESCE((analytics->>'clicks')::int, 0) + 1)
         )
   WHERE id = p_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_notification_click(uuid) TO authenticated;

-- RPC: aggregate delivery stats for one notification (admin only).
CREATE OR REPLACE FUNCTION public.admin_notification_stats(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_notif notifications;
  v_total int := 0;
  v_sent int := 0;
  v_failed int := 0;
  v_opened int := 0;
  v_read int := 0;
  v_clicks int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT public.has_role(v_uid, 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_notif FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE opened_at IS NOT NULL),
    count(*) FILTER (WHERE read_at IS NOT NULL)
  INTO v_total, v_sent, v_failed, v_opened, v_read
  FROM public.notification_deliveries
  WHERE notification_id = p_notification_id;

  v_clicks := COALESCE((v_notif.analytics->>'clicks')::int, 0);

  RETURN jsonb_build_object(
    'total_recipients', v_total,
    'delivered', v_sent,
    'failed', v_failed,
    'opened', v_opened,
    'read', v_read,
    'clicks', v_clicks,
    'open_rate', CASE WHEN v_sent > 0 THEN round((v_opened::numeric / v_sent) * 100, 1) ELSE 0 END,
    'click_through_rate', CASE WHEN v_sent > 0 THEN round((v_clicks::numeric / v_sent) * 100, 1) ELSE 0 END,
    'created_at', v_notif.created_at,
    'sent_at', v_notif.sent_at,
    'scheduled_at', v_notif.scheduled_at,
    'status', v_notif.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_notification_stats(uuid) TO authenticated;
