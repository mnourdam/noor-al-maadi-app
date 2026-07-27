-- 1) Notification center read-state (notification_deliveries), previously
--    misrouted to personal_notifications.
CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); did uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  did := public.ensure_my_delivery(p_notification_id);
  UPDATE public.notification_deliveries
     SET read_at = COALESCE(read_at, now()),
         opened_at = COALESCE(opened_at, now())
   WHERE id = did;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_my_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); baseline timestamptz; v_n int;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);

  -- Materialise deliveries for broadcast rows that have none yet.
  INSERT INTO public.notification_deliveries (notification_id, user_id, token, status, delivered_at, read_at, opened_at)
  SELECT n.id, uid, 'inapp', 'delivered', now(), now(), now()
    FROM public.notifications n
   WHERE n.status = 'sent'
     AND n.created_at >= baseline
     AND ((n.target_type = 'user' AND n.target_user_id = uid) OR n.target_type IN ('broadcast','all'))
     AND NOT EXISTS (SELECT 1 FROM public.notification_deliveries d WHERE d.notification_id = n.id AND d.user_id = uid);

  UPDATE public.notification_deliveries
     SET read_at = now(), opened_at = COALESCE(opened_at, now())
   WHERE user_id = uid AND read_at IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.unread_delivery_count()
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); baseline timestamptz; v_n int;
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  SELECT count(*) INTO v_n
    FROM public.notifications n
    LEFT JOIN public.notification_deliveries d
      ON d.notification_id = n.id AND d.user_id = uid
   WHERE n.status = 'sent'
     AND n.created_at >= baseline
     AND ((n.target_type = 'user' AND n.target_user_id = uid) OR n.target_type IN ('broadcast','all'))
     AND d.deleted_at IS NULL
     AND d.read_at IS NULL
     AND COALESCE(d.dismissed_at, NULL) IS NULL;
  RETURN COALESCE(v_n, 0);
END $$;

REVOKE ALL ON FUNCTION public.mark_my_notification_read(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.mark_all_my_notifications_read() FROM public, anon;
REVOKE ALL ON FUNCTION public.unread_delivery_count() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_my_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_delivery_count() TO authenticated;

-- 2) Personal reflections archive: my public comments (entity/story anchors)
--    plus my private campaign/story reflections, in one paginated feed.
CREATE OR REPLACE FUNCTION public.list_my_reflections_v1(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_items jsonb;
  v_total int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH mine AS (
    SELECT
      c.id::text                AS id,
      'comment'::text           AS source,
      c.anchor_type::text       AS anchor_type,
      c.anchor_id               AS anchor_id,
      c.body_text               AS body,
      c.created_at              AS created_at,
      c.updated_at              AS updated_at,
      COALESCE(c.helpful_count, 0) AS likes,
      (SELECT count(*) FROM public.social_comments r
        WHERE r.anchor_type = 'comment' AND r.anchor_id = c.id::text AND r.status = 'visible')::int AS replies,
      c.status                  AS status
      FROM public.social_comments c
     WHERE c.author_id = uid
       AND c.status <> 'removed'
    UNION ALL
    SELECT
      r.id::text                AS id,
      'reflection'::text        AS source,
      COALESCE(r.kind, 'campaign')::text AS anchor_type,
      COALESCE(r.source_id, r.campaign_id) AS anchor_id,
      COALESCE(NULLIF(r.text, ''), r.choice_value, '') AS body,
      r.created_at              AS created_at,
      r.updated_at              AS updated_at,
      0                         AS likes,
      0                         AS replies,
      'visible'::text           AS status
      FROM public.user_reflections r
     WHERE r.user_id = uid
       AND COALESCE(NULLIF(r.text, ''), r.choice_value, '') <> ''
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC), '[]'::jsonb),
    (SELECT count(*)::int FROM mine)
    INTO v_items, v_total
  FROM (
    SELECT * FROM mine ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT v_limit OFFSET v_offset
  ) t;

  RETURN jsonb_build_object('ok', true, 'items', v_items, 'total', v_total,
                            'has_more', (v_offset + v_limit) < v_total);
END $$;

REVOKE ALL ON FUNCTION public.list_my_reflections_v1(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_my_reflections_v1(integer, integer) TO authenticated;