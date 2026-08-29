CREATE OR REPLACE FUNCTION public.analytics_engagement_v16(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'events', jsonb_build_object(
      'story_completions', (SELECT count(*) FROM public.user_story_completions
                             WHERE first_completed_at >= p_from AND first_completed_at < p_to),
      'story_completions_users', (SELECT count(DISTINCT user_id) FROM public.user_story_completions
                             WHERE first_completed_at >= p_from AND first_completed_at < p_to),
      'campaign_completions', (SELECT count(*) FROM public.user_campaign_completions
                             WHERE completed_at >= p_from AND completed_at < p_to),
      'campaign_completions_users', (SELECT count(DISTINCT user_id) FROM public.user_campaign_completions
                             WHERE completed_at >= p_from AND completed_at < p_to),
      'discoveries', (SELECT count(*) FROM public.user_entity_discoveries
                             WHERE first_discovered_at >= p_from AND first_discovered_at < p_to),
      'discoveries_users', (SELECT count(DISTINCT user_id) FROM public.user_entity_discoveries
                             WHERE first_discovered_at >= p_from AND first_discovered_at < p_to),
      'investigation_completions', (SELECT count(*) FROM public.user_investigation_progress
                             WHERE completed_at >= p_from AND completed_at < p_to),
      'museum_unlocks', (SELECT count(*) FROM public.user_collection
                             WHERE unlocked_at >= p_from AND unlocked_at < p_to),
      'comments', (SELECT count(*) FROM public.social_comments
                             WHERE created_at >= p_from AND created_at < p_to),
      'reactions', (SELECT count(*) FROM public.social_reactions
                             WHERE created_at >= p_from AND created_at < p_to),
      'contributions', (SELECT count(*) FROM public.feedback_issues
                             WHERE created_at >= p_from AND created_at < p_to)
    ),
    'state', jsonb_build_object(
      'story_progress_rows', (SELECT count(*) FROM public.user_story_progress),
      'story_progress_users', (SELECT count(DISTINCT user_id) FROM public.user_story_progress),
      'campaign_progress_rows', (SELECT count(*) FROM public.user_campaign_progress),
      'campaign_progress_users', (SELECT count(DISTINCT user_id) FROM public.user_campaign_progress),
      'investigation_progress_rows', (SELECT count(*) FROM public.user_investigation_progress),
      'investigation_completions_total', (SELECT count(*) FROM public.user_investigation_progress WHERE completed_at IS NOT NULL),
      'museum_items', (SELECT count(*) FROM public.user_collection),
      'discoveries_total', (SELECT count(*) FROM public.user_entity_discoveries),
      'story_completions_total', (SELECT count(*) FROM public.user_story_completions),
      'story_completions_users_total', (SELECT count(DISTINCT user_id) FROM public.user_story_completions),
      'campaign_completions_total', (SELECT count(*) FROM public.user_campaign_completions),
      'contributions_total', (SELECT count(*) FROM public.feedback_issues),
      'comments_total', (SELECT count(*) FROM public.social_comments),
      'reactions_total', (SELECT count(*) FROM public.social_reactions),
      'streak_active_users', (SELECT count(DISTINCT user_id) FROM public.user_streak_days
                               WHERE activity_day >= (current_date - 7))
    ),
    'top_stories', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT s.id, coalesce(s.title_ar, s.title_en, s.slug) AS title, c.n AS completions
        FROM (SELECT story_id, count(*) n FROM public.user_story_completions
              GROUP BY 1 ORDER BY n DESC LIMIT 10) c
        JOIN public.stories s ON s.id = c.story_id
        ORDER BY c.n DESC
      ) x), '[]'::jsonb),
    'top_stories_progress', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT s.id, coalesce(s.title_ar, s.title_en, s.slug) AS title, c.n AS players
        FROM (SELECT story_id, count(DISTINCT user_id) n FROM public.user_story_progress
              GROUP BY 1 ORDER BY n DESC LIMIT 10) c
        JOIN public.stories s ON s.id = c.story_id
        ORDER BY c.n DESC
      ) x), '[]'::jsonb),
    'top_campaigns', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT ac.id, coalesce(ac.title, ac.slug) AS title, c.n AS players
        FROM (SELECT campaign_id, count(DISTINCT user_id) n FROM public.user_campaign_progress
              GROUP BY 1 ORDER BY n DESC LIMIT 10) c
        JOIN public.admin_campaigns ac ON ac.slug = c.campaign_id OR ac.id::text = c.campaign_id
        ORDER BY c.n DESC
      ) x), '[]'::jsonb),
    'top_entities', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT e.id, coalesce(e.title, e.slug) AS title, d.n AS discoveries
        FROM (SELECT entity_id, count(*) n FROM public.user_entity_discoveries
              GROUP BY 1 ORDER BY n DESC LIMIT 10) d
        JOIN public.encyclopedia_entities e ON e.id = d.entity_id
        ORDER BY d.n DESC
      ) x), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;