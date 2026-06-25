
-- Analytics Center v1 RPCs. Server-aggregated, SECURITY DEFINER, gated by content-editor / user-manager.

CREATE OR REPLACE FUNCTION public.analytics_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  is_mgr boolean := public.is_user_manager();
  total_users int;
  guests int := 0;
  editors int := 0;
  admins int := 0;
  suspended int := 0;
  disabled int := 0;
  online_now int;
  active_today int;
  active_week int;
  active_month int;
  new_today int;
  new_week int;
  new_month int;
  dau int;
  wau int;
  mau int;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO total_users FROM public.profiles;
  SELECT count(*) FILTER (WHERE last_active > now() - interval '5 min') INTO online_now FROM public.profiles;
  SELECT count(*) FILTER (WHERE last_active > now() - interval '1 day') INTO active_today FROM public.profiles;
  SELECT count(*) FILTER (WHERE last_active > now() - interval '7 days') INTO active_week FROM public.profiles;
  SELECT count(*) FILTER (WHERE last_active > now() - interval '30 days') INTO active_month FROM public.profiles;
  dau := active_today;
  wau := active_week;
  mau := active_month;
  SELECT count(*) FILTER (WHERE join_date > now() - interval '1 day') INTO new_today FROM public.profiles;
  SELECT count(*) FILTER (WHERE join_date > now() - interval '7 days') INTO new_week FROM public.profiles;
  SELECT count(*) FILTER (WHERE join_date > now() - interval '30 days') INTO new_month FROM public.profiles;

  IF is_mgr THEN
    SELECT
      count(*) FILTER (WHERE account_status='suspended'),
      count(*) FILTER (WHERE account_status='disabled')
    INTO suspended, disabled FROM public.profiles;
    SELECT count(DISTINCT user_id) FILTER (WHERE role='admin' OR role='owner') INTO admins FROM public.user_roles;
    SELECT count(DISTINCT user_id) FILTER (WHERE role='editor') INTO editors FROM public.user_roles;
    SELECT count(*) INTO guests FROM public.profiles WHERE email IS NULL OR email='';
  END IF;

  RETURN jsonb_build_object(
    'is_manager', is_mgr,
    'users', jsonb_build_object(
      'total', total_users,
      'guests', guests,
      'editors', editors,
      'admins', admins,
      'suspended', suspended,
      'disabled', disabled,
      'online_now', online_now,
      'active_today', active_today,
      'active_week', active_week,
      'active_month', active_month,
      'new_today', new_today,
      'new_week', new_week,
      'new_month', new_month,
      'dau', dau,
      'wau', wau,
      'mau', mau,
      'dau_mau_ratio', CASE WHEN mau > 0 THEN round((dau::numeric / mau) * 100, 1) ELSE 0 END
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.analytics_content_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH camp AS (
    SELECT
      count(*) FILTER (WHERE status='published') AS published,
      count(*) FILTER (WHERE status='draft')     AS draft,
      count(*) FILTER (WHERE status='archived')  AS archived,
      count(*) AS total
    FROM public.admin_campaigns
  ),
  enc AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE enabled) AS enabled,
      count(*) FILTER (WHERE enabled AND entity_type='figure')   AS figures,
      count(*) FILTER (WHERE enabled AND entity_type='city')     AS cities,
      count(*) FILTER (WHERE enabled AND entity_type='state')    AS states,
      count(*) FILTER (WHERE enabled AND entity_type='battle')   AS battles,
      count(*) FILTER (WHERE enabled AND entity_type='event')    AS events,
      count(*) FILTER (WHERE enabled AND entity_type='landmark') AS landmarks,
      count(*) FILTER (WHERE enabled AND entity_type='artifact') AS artifacts,
      count(*) FILTER (WHERE enabled AND (body IS NULL OR length(trim(body))=0)) AS missing_body,
      count(*) FILTER (WHERE enabled AND (metadata->'sources' IS NULL OR jsonb_array_length(coalesce(metadata->'sources','[]'::jsonb))=0)) AS missing_sources,
      count(*) FILTER (WHERE enabled AND timeline_order IS NULL) AS missing_timeline_order
    FROM public.encyclopedia_entities
  ),
  inv AS (
    SELECT count(*) FILTER (WHERE enabled) AS enabled, count(*) AS total FROM public.investigations
  ),
  tih AS ( SELECT count(*) FILTER (WHERE enabled) AS enabled, count(*) AS total FROM public.today_in_history_events ),
  df  AS ( SELECT count(*) FILTER (WHERE enabled) AS enabled, count(*) AS total FROM public.daily_facts ),
  dup_slugs AS (
    SELECT count(*) AS n FROM (
      SELECT slug FROM public.encyclopedia_entities GROUP BY slug HAVING count(*) > 1
    ) s
  )
  SELECT jsonb_build_object(
    'campaigns', to_jsonb(camp.*),
    'encyclopedia', to_jsonb(enc.*),
    'investigations', to_jsonb(inv.*),
    'today_in_history', to_jsonb(tih.*),
    'daily_facts', to_jsonb(df.*),
    'integrity', jsonb_build_object('duplicate_slugs', (SELECT n FROM dup_slugs))
  ) INTO result
  FROM camp, enc, inv, tih, df;

  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_atlas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  eligible int;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO eligible
    FROM public.encyclopedia_entities
    WHERE enabled AND entity_type = ANY(ARRAY['state','city','battle','landmark','event']);

  WITH a AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status='published') AS published,
      count(*) FILTER (WHERE status='draft') AS draft,
      count(*) FILTER (WHERE status='review') AS review,
      count(*) FILTER (WHERE aps_verified) AS verified,
      count(*) FILTER (WHERE aps_x IS NULL OR aps_y IS NULL) AS needs_placement
    FROM public.atlas_entities
  ),
  by_kind AS (
    SELECT jsonb_object_agg(kind::text, n) AS j FROM (
      SELECT kind, count(*) n FROM public.atlas_entities GROUP BY kind
    ) k
  ),
  by_era AS (
    SELECT jsonb_object_agg(coalesce(era,'unknown'), n) AS j FROM (
      SELECT era, count(*) n FROM public.atlas_entities GROUP BY era
    ) e
  )
  SELECT jsonb_build_object(
    'totals', to_jsonb(a.*),
    'eligible_encyclopedia', eligible,
    'coverage_pct', CASE WHEN eligible > 0 THEN round((a.published::numeric / eligible) * 100, 1) ELSE 0 END,
    'by_kind', coalesce(by_kind.j, '{}'::jsonb),
    'by_era',  coalesce(by_era.j,  '{}'::jsonb)
  ) INTO result
  FROM a, by_kind, by_era;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_system_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  unlinked_atlas int;
  dup_atlas_slug int;
  dup_enc_slug int;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO unlinked_atlas
    FROM public.atlas_entities a
    LEFT JOIN public.encyclopedia_entities e ON e.id = a.encyclopedia_entity_id
    WHERE a.status='published' AND (a.encyclopedia_entity_id IS NULL OR e.id IS NULL OR e.enabled=false);

  SELECT count(*) INTO dup_atlas_slug FROM (
    SELECT slug FROM public.atlas_entities GROUP BY slug HAVING count(*)>1
  ) s;
  SELECT count(*) INTO dup_enc_slug FROM (
    SELECT slug FROM public.encyclopedia_entities GROUP BY slug HAVING count(*)>1
  ) s;

  RETURN jsonb_build_object(
    'missing_encyclopedia_links', unlinked_atlas,
    'duplicate_atlas_slugs', dup_atlas_slug,
    'duplicate_encyclopedia_slugs', dup_enc_slug
  );
END $$;

-- Timeseries dispatcher. Extensible: add new metrics by extending the CASE,
-- without changing the client contract.
CREATE OR REPLACE FUNCTION public.analytics_timeseries(
  p_metric text,
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  iv interval;
  result jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  iv := CASE p_bucket
          WHEN 'hour'  THEN interval '1 hour'
          WHEN 'day'   THEN interval '1 day'
          WHEN 'week'  THEN interval '1 week'
          WHEN 'month' THEN interval '1 month'
          ELSE interval '1 day'
        END;

  IF p_metric = 'new_users' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', b, 'v', n) ORDER BY b), '[]'::jsonb) INTO result
    FROM (
      SELECT date_trunc(p_bucket, join_date) AS b, count(*) AS n
      FROM public.profiles
      WHERE join_date >= p_from AND join_date < p_to
      GROUP BY 1
    ) s;
  ELSIF p_metric = 'active_users' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', b, 'v', n) ORDER BY b), '[]'::jsonb) INTO result
    FROM (
      SELECT date_trunc(p_bucket, last_active) AS b, count(*) AS n
      FROM public.profiles
      WHERE last_active >= p_from AND last_active < p_to
      GROUP BY 1
    ) s;
  ELSE
    RAISE EXCEPTION 'unknown_metric: %', p_metric;
  END IF;

  RETURN jsonb_build_object('metric', p_metric, 'bucket', p_bucket, 'points', result);
END $$;

-- Note: future telemetry tables (app_events, content_views) will plug into
-- analytics_timeseries by adding new metric branches above. Not created in v1.
