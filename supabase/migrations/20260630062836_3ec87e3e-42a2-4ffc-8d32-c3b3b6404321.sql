
-- Admin-only RPC: resolve a smart audience segment to a list of user IDs.
-- Each segment is implemented inline; adding a new one is a new WHEN branch.
CREATE OR REPLACE FUNCTION public.admin_resolve_segment(p_segment_id text)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

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
        WHERE last_active_at > now() - interval '1 day';
    WHEN 'active_this_week' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active_at > now() - interval '7 days';
    WHEN 'inactive_7d' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active_at < now() - interval '7 days' OR last_active_at IS NULL;
    WHEN 'inactive_30d' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles
        WHERE last_active_at < now() - interval '30 days' OR last_active_at IS NULL;
    WHEN 'low_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) < 3;
    WHEN 'no_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) = 0;
    WHEN 'full_hearts' THEN
      SELECT array_agg(id) INTO v_ids FROM public.profiles WHERE COALESCE(hearts, 0) >= 5;
    WHEN 'campaign_in_progress' THEN
      SELECT array_agg(DISTINCT user_id) INTO v_ids FROM public.user_campaign_progress
        WHERE COALESCE(completed_at, NULL) IS NULL;
    WHEN 'campaign_completed_any' THEN
      SELECT array_agg(DISTINCT user_id) INTO v_ids FROM public.user_campaign_progress
        WHERE completed_at IS NOT NULL;
    WHEN 'never_started_campaigns' THEN
      SELECT array_agg(p.id) INTO v_ids FROM public.profiles p
        WHERE NOT EXISTS (SELECT 1 FROM public.user_campaign_progress u WHERE u.user_id = p.id);
    WHEN 'has_pending_friend_requests' THEN
      SELECT array_agg(DISTINCT addressee_id) INTO v_ids FROM public.friendships
        WHERE status = 'pending';
    WHEN 'no_friends' THEN
      SELECT array_agg(p.id) INTO v_ids FROM public.profiles p
        WHERE NOT EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE (f.requester_id = p.id OR f.addressee_id = p.id) AND f.status = 'accepted'
        );
    ELSE
      v_ids := ARRAY[]::uuid[];
  END CASE;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_resolve_segment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_segment(text) TO authenticated;
