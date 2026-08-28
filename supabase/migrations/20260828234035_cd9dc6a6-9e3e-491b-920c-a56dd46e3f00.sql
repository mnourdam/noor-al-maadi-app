-- V16 SMART NOTIFICATION SEGMENTS — ADDITIVE ONLY.
-- The legacy public.admin_resolve_segment(text) used by V15 is left untouched.

CREATE OR REPLACE FUNCTION public.admin_resolve_segment_v16(
  p_segment_id text DEFAULT NULL,
  p_filter jsonb DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_field text;
  v_op text;
  v_value numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- ── Generic numeric predicate contract ────────────────────────────────
  IF p_filter IS NOT NULL AND p_filter <> 'null'::jsonb THEN
    IF p_segment_id IS NOT NULL AND p_segment_id <> '' THEN
      RAISE EXCEPTION 'invalid_request: pass either p_segment_id or p_filter, not both';
    END IF;

    v_field := p_filter->>'field';
    v_op    := p_filter->>'op';

    IF v_field IS NULL OR v_field NOT IN ('level','xp','streak','hearts','account_age_days') THEN
      RAISE EXCEPTION 'invalid_filter_field: %', COALESCE(v_field, '(null)');
    END IF;
    IF v_op IS NULL OR v_op NOT IN ('=','>','>=','<','<=') THEN
      RAISE EXCEPTION 'invalid_filter_operator: %', COALESCE(v_op, '(null)');
    END IF;
    IF p_filter->>'value' IS NULL THEN
      RAISE EXCEPTION 'invalid_filter_value: (null)';
    END IF;
    BEGIN
      v_value := (p_filter->>'value')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_filter_value: %', p_filter->>'value';
    END;

    -- Explicit whitelist switch. No SQL interpolation of field/operator.
    SELECT array_agg(id) INTO v_ids
    FROM (
      SELECT p.id,
        CASE v_field
          WHEN 'level'  THEN COALESCE(p.level, 1)::numeric
          WHEN 'xp'     THEN COALESCE(p.xp, 0)::numeric
          WHEN 'streak' THEN COALESCE(p.streak, 0)::numeric
          WHEN 'hearts' THEN COALESCE(p.hearts, 0)::numeric
          WHEN 'account_age_days'
                        THEN FLOOR(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::numeric
        END AS metric
      FROM public.profiles p
    ) s
    WHERE s.metric IS NOT NULL
      AND CASE v_op
            WHEN '='  THEN s.metric =  v_value
            WHEN '>'  THEN s.metric >  v_value
            WHEN '>=' THEN s.metric >= v_value
            WHEN '<'  THEN s.metric <  v_value
            WHEN '<=' THEN s.metric <= v_value
          END;

    RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
  END IF;

  IF p_segment_id IS NULL OR p_segment_id = '' THEN
    RAISE EXCEPTION 'invalid_request: p_segment_id or p_filter is required';
  END IF;

  -- ── Predefined segments (columns verified against the live schema) ────
  CASE p_segment_id
    WHEN 'level_20_plus' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(level, 1) >= 20;
    WHEN 'level_50_plus' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(level, 1) >= 50;
    WHEN 'new_players' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE created_at > now() - interval '7 days';
    WHEN 'veteran_players' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE created_at < now() - interval '60 days';
    WHEN 'active_today' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active > now() - interval '1 day';
    WHEN 'active_this_week' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active > now() - interval '7 days';
    WHEN 'inactive_7d' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active < now() - interval '7 days' OR last_active IS NULL;
    WHEN 'inactive_30d' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active < now() - interval '30 days' OR last_active IS NULL;
    WHEN 'low_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) < 3;
    WHEN 'no_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) = 0;
    WHEN 'full_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) >= 5;
    WHEN 'campaign_in_progress' THEN
      SELECT array_agg(DISTINCT user_id) INTO v_ids FROM public.user_campaign_progress
        WHERE completed_at IS NULL;
    WHEN 'campaign_completed_any' THEN
      SELECT array_agg(DISTINCT user_id) INTO v_ids FROM public.user_campaign_progress
        WHERE completed_at IS NOT NULL;
    WHEN 'never_started_campaigns' THEN
      SELECT array_agg(p.id) INTO v_ids FROM public.profiles p
        WHERE NOT EXISTS (SELECT 1 FROM public.user_campaign_progress u WHERE u.user_id = p.id);
    WHEN 'has_pending_friend_requests' THEN
      -- The addressee is the side of the pair that is NOT the requester.
      SELECT array_agg(DISTINCT addressee) INTO v_ids FROM (
        SELECT CASE WHEN f.requester = f.user_a THEN f.user_b ELSE f.user_a END AS addressee
        FROM public.friendships f
        WHERE f.status = 'pending'
      ) t WHERE addressee IS NOT NULL;
    WHEN 'no_friends' THEN
      SELECT array_agg(p.id) INTO v_ids FROM public.profiles p
        WHERE NOT EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE (f.user_a = p.id OR f.user_b = p.id) AND f.status = 'accepted'
        );
    ELSE
      RAISE EXCEPTION 'unknown_segment: %', p_segment_id;
  END CASE;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_segment_v16(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_segment_v16(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_segment_v16(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_segment_v16(text, jsonb) TO service_role;

-- Aggregate preview: matching users vs reachable users vs devices.
CREATE OR REPLACE FUNCTION public.admin_segment_audience_v16(
  p_segment_id text DEFAULT NULL,
  p_filter jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_reachable int;
  v_devices int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_ids := public.admin_resolve_segment_v16(p_segment_id, p_filter);

  SELECT COUNT(DISTINCT d.user_id), COUNT(*)
    INTO v_reachable, v_devices
    FROM public.device_tokens d
   WHERE d.enabled AND d.user_id = ANY(v_ids);

  RETURN jsonb_build_object(
    'user_ids', to_jsonb(v_ids),
    'matching_users', COALESCE(array_length(v_ids, 1), 0),
    'reachable_users', COALESCE(v_reachable, 0),
    'device_count', COALESCE(v_devices, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_segment_audience_v16(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_segment_audience_v16(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_segment_audience_v16(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_segment_audience_v16(text, jsonb) TO service_role;