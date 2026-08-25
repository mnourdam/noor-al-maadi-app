-- Admin Analytics Dashboard — read-only analytics RPCs (additive; no schema or data changes).
-- Gate: same as existing analytics_* functions (public.is_content_editor()).

-- ── 1. Growth & Activity ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_growth_activity(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH ev AS (
    SELECT user_id AS uid, applied_at AS ts FROM public.applied_profile_deltas
    UNION ALL SELECT user_id, last_played_at FROM public.game_progress
    UNION ALL SELECT user_id, updated_at FROM public.user_story_progress
    UNION ALL SELECT user_id, unlocked_at FROM public.user_achievements
    UNION ALL SELECT user_id, completed_at FROM public.user_campaign_progress WHERE completed_at IS NOT NULL
    UNION ALL SELECT user_id, completed_at FROM public.user_campaign_completions WHERE completed_at IS NOT NULL
    UNION ALL SELECT user_id, first_completed_at FROM public.user_story_completions
    UNION ALL SELECT user_id, completed_at FROM public.user_investigation_progress WHERE completed_at IS NOT NULL
    UNION ALL SELECT user_id, first_discovered_at FROM public.user_entity_discoveries
    UNION ALL SELECT user_id, unlocked_at FROM public.user_collection
  ),
  signups AS (
    SELECT date_trunc('day', u.created_at)::date AS d, count(*)::int AS n
    FROM auth.users u
    WHERE u.created_at >= p_from AND u.created_at < p_to
    GROUP BY 1
  ),
  activity AS (
    SELECT date_trunc('day', ts)::date AS d, count(DISTINCT uid)::int AS n
    FROM ev
    WHERE ts >= p_from AND ts < p_to
    GROUP BY 1
  ),
  agg AS (
    SELECT
      (SELECT count(*) FROM auth.users)::int AS users_total,
      (SELECT count(*) FROM auth.users WHERE created_at >= date_trunc('day', now()))::int AS users_new_today,
      (SELECT count(*) FROM auth.users WHERE created_at >= p_from AND created_at < p_to)::int AS users_new_in_range,
      (SELECT count(DISTINCT uid) FROM ev WHERE ts >= date_trunc('day', now()))::int AS dau_today,
      (SELECT count(DISTINCT uid) FROM ev WHERE ts >= now() - interval '7 days')::int AS wau_7d,
      (SELECT count(DISTINCT uid) FROM ev WHERE ts >= now() - interval '30 days')::int AS mau_30d,
      (SELECT count(*) FROM public.user_onboarding_state WHERE completed_at IS NOT NULL)::int AS onboarding_completed,
      (SELECT count(*) FROM public.profiles)::int AS profiles_total,
      (SELECT count(*) FROM public.profiles WHERE last_active >= now() - interval '1 day')::int AS seen_24h,
      (SELECT count(*) FROM public.profiles WHERE last_active >= now() - interval '7 days')::int AS seen_7d,
      (SELECT count(*) FROM public.profiles WHERE last_active >= now() - interval '30 days')::int AS seen_30d
  ),
  providers AS (
    SELECT coalesce(jsonb_object_agg(provider, n), '{}'::jsonb) AS m
    FROM (SELECT provider, count(*)::int AS n FROM auth.identities GROUP BY provider) p
  )
  SELECT jsonb_build_object(
    'users_total', a.users_total,
    'users_new_today', a.users_new_today,
    'users_new_in_range', a.users_new_in_range,
    'dau_today', a.dau_today,
    'wau_7d', a.wau_7d,
    'mau_30d', a.mau_30d,
    'onboarding_completed', a.onboarding_completed,
    'profiles_total', a.profiles_total,
    'last_seen', jsonb_build_object('within_24h', a.seen_24h, 'within_7d', a.seen_7d, 'within_30d', a.seen_30d),
    'providers', (SELECT m FROM providers),
    'signups_series', coalesce((SELECT jsonb_agg(jsonb_build_object('t', d, 'v', n) ORDER BY d) FROM signups), '[]'::jsonb),
    'activity_series', coalesce((SELECT jsonb_agg(jsonb_build_object('t', d, 'v', n) ORDER BY d) FROM activity), '[]'::jsonb)
  ) INTO result
  FROM agg a;

  RETURN result;
END;
$func$;

-- ── 2. Content & Progress ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_content_progress(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH counts AS (
    SELECT
      (SELECT count(*) FROM public.user_campaign_progress WHERE status = 'completed' AND completed_at >= p_from AND completed_at < p_to)::int AS chapters_completed,
      (SELECT count(*) FROM public.user_campaign_completions WHERE completed_at >= p_from AND completed_at < p_to)::int AS campaigns_completed,
      (SELECT count(*) FROM public.user_story_completions WHERE first_completed_at >= p_from AND first_completed_at < p_to)::int AS stories_completed,
      (SELECT count(*) FROM public.user_investigation_progress WHERE completed_at >= p_from AND completed_at < p_to)::int AS investigations_completed,
      (SELECT count(*) FROM public.user_entity_discoveries WHERE first_discovered_at >= p_from AND first_discovered_at < p_to)::int AS encyclopedia_discoveries,
      (SELECT count(*) FROM public.user_collection WHERE unlocked_at >= p_from AND unlocked_at < p_to)::int AS museum_unlocks,
      (SELECT count(*) FROM public.user_achievements WHERE unlocked_at >= p_from AND unlocked_at < p_to)::int AS achievements_unlocked
  ),
  funnel AS (
    SELECT
      (SELECT count(DISTINCT user_id) FROM public.user_campaign_progress WHERE status = 'completed')::int AS users_chapters,
      (SELECT count(DISTINCT user_id) FROM public.user_campaign_completions)::int AS users_campaigns,
      (SELECT count(DISTINCT user_id) FROM public.user_story_completions)::int AS users_stories,
      (SELECT count(DISTINCT user_id) FROM public.user_investigation_progress WHERE completed_at IS NOT NULL)::int AS users_investigations
  ),
  day_series AS (
    SELECT d, sum(chapters)::int AS chapters, sum(campaigns)::int AS campaigns, sum(stories)::int AS stories, sum(investigations)::int AS investigations
    FROM (
      SELECT date_trunc('day', completed_at)::date AS d, count(*) AS chapters, 0 AS campaigns, 0 AS stories, 0 AS investigations
      FROM public.user_campaign_progress WHERE status = 'completed' AND completed_at >= p_from AND completed_at < p_to GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', completed_at)::date, 0, count(*), 0, 0
      FROM public.user_campaign_completions WHERE completed_at >= p_from AND completed_at < p_to GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', first_completed_at)::date, 0, 0, count(*), 0
      FROM public.user_story_completions WHERE first_completed_at >= p_from AND first_completed_at < p_to GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', completed_at)::date, 0, 0, 0, count(*)
      FROM public.user_investigation_progress WHERE completed_at >= p_from AND completed_at < p_to GROUP BY 1
    ) s GROUP BY d
  ),
  top_campaigns AS (
    SELECT coalesce(ac.title, ucp.campaign_id) AS title, count(*)::int AS n
    FROM public.user_campaign_progress ucp
    LEFT JOIN public.admin_campaigns ac ON ac.slug = ucp.campaign_id OR ac.id::text = ucp.campaign_id
    WHERE ucp.status = 'completed' AND ucp.completed_at >= p_from AND ucp.completed_at < p_to
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  ),
  top_stories AS (
    SELECT coalesce(s.title_ar, s.title_en, usc.story_id) AS title, count(*)::int AS n
    FROM public.user_story_completions usc
    LEFT JOIN public.stories s ON s.slug = usc.story_id OR s.id::text = usc.story_id
    WHERE usc.first_completed_at >= p_from AND usc.first_completed_at < p_to
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  ),
  top_investigations AS (
    SELECT coalesce(i.title, uip.investigation_id::text) AS title, count(*)::int AS n
    FROM public.user_investigation_progress uip
    LEFT JOIN public.investigations i ON i.id = uip.investigation_id
    WHERE uip.completed_at >= p_from AND uip.completed_at < p_to
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  ),
  museum_by_type AS (
    SELECT coalesce(jsonb_object_agg(item_type, n), '{}'::jsonb) AS m
    FROM (SELECT item_type, count(*)::int AS n FROM public.user_collection WHERE unlocked_at >= p_from AND unlocked_at < p_to GROUP BY item_type) x
  )
  SELECT jsonb_build_object(
    'chapters_completed', c.chapters_completed,
    'campaigns_completed', c.campaigns_completed,
    'stories_completed', c.stories_completed,
    'investigations_completed', c.investigations_completed,
    'encyclopedia_discoveries', c.encyclopedia_discoveries,
    'museum_unlocks', c.museum_unlocks,
    'achievements_unlocked', c.achievements_unlocked,
    'funnel', jsonb_build_object(
      'users_chapters', f.users_chapters,
      'users_campaigns', f.users_campaigns,
      'users_stories', f.users_stories,
      'users_investigations', f.users_investigations
    ),
    'daily_series', coalesce((SELECT jsonb_agg(jsonb_build_object('t', d, 'chapters', chapters, 'campaigns', campaigns, 'stories', stories, 'investigations', investigations) ORDER BY d) FROM day_series), '[]'::jsonb),
    'top_campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('title', title, 'n', n) ORDER BY n DESC) FROM top_campaigns), '[]'::jsonb),
    'top_stories', coalesce((SELECT jsonb_agg(jsonb_build_object('title', title, 'n', n) ORDER BY n DESC) FROM top_stories), '[]'::jsonb),
    'top_investigations', coalesce((SELECT jsonb_agg(jsonb_build_object('title', title, 'n', n) ORDER BY n DESC) FROM top_investigations), '[]'::jsonb),
    'museum_by_type', (SELECT m FROM museum_by_type)
  ) INTO result
  FROM counts c, funnel f;

  RETURN result;
END;
$func$;

-- ── 3. Economy & Progression ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_economy(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH ev AS (
    SELECT * FROM public.applied_profile_deltas WHERE applied_at >= p_from AND applied_at < p_to
  ),
  totals AS (
    SELECT count(*)::int AS events, coalesce(sum(xp), 0)::int AS xp, coalesce(sum(dinars), 0)::int AS dinars, coalesce(sum(hearts), 0)::int AS hearts FROM ev
  ),
  by_kind AS (
    SELECT split_part(source, ':', 1) AS kind, count(*)::int AS events,
           coalesce(sum(xp), 0)::int AS xp, coalesce(sum(dinars), 0)::int AS dinars, coalesce(sum(hearts), 0)::int AS hearts
    FROM ev GROUP BY 1
  ),
  daily AS (
    SELECT date_trunc('day', applied_at)::date AS d, coalesce(sum(xp), 0)::int AS xp, coalesce(sum(dinars), 0)::int AS dinars, count(*)::int AS events
    FROM ev GROUP BY 1
  ),
  snapshot AS (
    SELECT
      round(avg(xp))::int AS xp_avg,
      percentile_cont(0.5) within group (ORDER BY xp)::int AS xp_median,
      count(*) FILTER (WHERE streak > 0)::int AS streaks_active,
      coalesce(max(longest_streak), 0)::int AS longest_streak_max
    FROM public.profiles
  ),
  levels AS (
    SELECT level, count(*)::int AS n FROM public.profiles GROUP BY level
  ),
  claims AS (
    SELECT count(*)::int AS total_claims,
           count(*) FILTER (WHERE claimed_at >= p_from AND claimed_at < p_to)::int AS in_range
    FROM public.user_streak_reward_claims
  )
  SELECT jsonb_build_object(
    'events', t.events,
    'xp_granted', t.xp,
    'dinars_granted', t.dinars,
    'hearts_granted', t.hearts,
    'by_kind', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'events', events, 'xp', xp, 'dinars', dinars, 'hearts', hearts) ORDER BY events DESC) FROM by_kind), '[]'::jsonb),
    'daily_series', coalesce((SELECT jsonb_agg(jsonb_build_object('t', d, 'xp', xp, 'dinars', dinars, 'events', events) ORDER BY d) FROM daily), '[]'::jsonb),
    'snapshot', jsonb_build_object('xp_avg', s.xp_avg, 'xp_median', s.xp_median, 'streaks_active', s.streaks_active, 'longest_streak_max', s.longest_streak_max),
    'level_distribution', coalesce((SELECT jsonb_agg(jsonb_build_object('level', level, 'n', n) ORDER BY level) FROM levels), '[]'::jsonb),
    'streak_claims_total', cl.total_claims,
    'streak_claims_in_range', cl.in_range
  ) INTO result
  FROM totals t, snapshot s, claims cl;

  RETURN result;
END;
$func$;

-- ── 4. Notifications & Communications ────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_comms(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH nd AS (
    SELECT * FROM public.notification_deliveries
    WHERE coalesce(sent_at, created_at) >= p_from AND coalesce(sent_at, created_at) < p_to
  ),
  nd_counts AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'sent')::int AS sent,
      count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(read_at)::int AS c_read,
      count(opened_at)::int AS c_opened
    FROM nd
  ),
  nd_daily AS (
    SELECT date_trunc('day', coalesce(sent_at, created_at))::date AS d,
           count(*)::int AS sent, count(read_at)::int AS c_read, count(opened_at)::int AS c_opened
    FROM nd GROUP BY 1
  ),
  em AS (
    SELECT template_name, status, count(*)::int AS n
    FROM public.email_send_log
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1, 2
  ),
  em_state AS (
    SELECT count(*) FILTER (WHERE template_name = 'signup' AND status = 'pending')::int AS signup_pending_alltime
    FROM public.email_send_log
  )
  SELECT jsonb_build_object(
    'deliveries', jsonb_build_object(
      'total', c.total, 'sent', c.sent, 'delivered', c.delivered, 'failed', c.failed,
      'read', c.c_read, 'opened', c.c_opened
    ),
    'deliveries_daily', coalesce((SELECT jsonb_agg(jsonb_build_object('t', d, 'sent', sent, 'read', c_read, 'opened', c_opened) ORDER BY d) FROM nd_daily), '[]'::jsonb),
    'email_by_template', coalesce((SELECT jsonb_agg(jsonb_build_object('template', template_name, 'status', status, 'n', n) ORDER BY template_name, status) FROM em), '[]'::jsonb),
    'email_signup_pending_alltime', es.signup_pending_alltime
  ) INTO result
  FROM nd_counts c, em_state es;

  RETURN result;
END;
$func$;

-- Explicit execute grants (same audience as existing analytics_* functions).
GRANT EXECUTE ON FUNCTION public.analytics_growth_activity(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_content_progress(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_economy(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_comms(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_growth_activity(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_content_progress(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_economy(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_comms(timestamptz, timestamptz) TO service_role;