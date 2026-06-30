
-- ============================================================
-- Extensible leaderboard backend
-- ------------------------------------------------------------
-- Replaces the single-metric `leaderboard_global` /
-- `leaderboard_around_me` RPCs with metric- and timeframe-aware
-- versions. Adds a `leaderboard_snapshots` table so future
-- seasonal/weekly/monthly rankings can be materialized without
-- changing the live profile schema. Legacy RPC signatures stay
-- as thin shims so existing clients keep working.
-- ============================================================

-- 1) Snapshot store (period-scoped scores: weekly/monthly/seasonal)
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric       text NOT NULL,                  -- 'xp' | 'level' | 'campaigns' | 'museum' | 'achievement' | ...
  timeframe    text NOT NULL,                  -- 'weekly' | 'monthly' | 'seasonal' | 'custom'
  period_key   text NOT NULL,                  -- e.g. '2026-W26', '2026-06', 'season-3'
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  user_id      uuid NOT NULL,
  score        bigint NOT NULL DEFAULT 0,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric, timeframe, period_key, user_id)
);

GRANT SELECT ON public.leaderboard_snapshots TO authenticated;
GRANT ALL ON public.leaderboard_snapshots TO service_role;

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Snapshots are read-only to clients; population is service-role only.
CREATE POLICY "snapshots_read_authenticated"
  ON public.leaderboard_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_lookup_idx
  ON public.leaderboard_snapshots (metric, timeframe, period_key, score DESC);
CREATE INDEX IF NOT EXISTS leaderboard_snapshots_user_idx
  ON public.leaderboard_snapshots (user_id, metric, timeframe, period_key);

DROP TRIGGER IF EXISTS leaderboard_snapshots_touch ON public.leaderboard_snapshots;
CREATE TRIGGER leaderboard_snapshots_touch
  BEFORE UPDATE ON public.leaderboard_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Helper: resolve a profile-derived metric expression to a numeric score.
--    Anything not in this whitelist falls back to XP, so the RPCs can never
--    be coerced into evaluating arbitrary SQL.
CREATE OR REPLACE FUNCTION public.leaderboard_resolve_metric(p_metric text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_metric,'xp'))
    WHEN 'xp'          THEN 'COALESCE(p.xp,0)'
    WHEN 'level'       THEN 'COALESCE(p.level,0) * 1000000 + COALESCE(p.xp,0)'
    WHEN 'campaigns'   THEN 'COALESCE(p.campaigns_completed,0)'
    WHEN 'museum'      THEN 'COALESCE(p.museum_items_unlocked,0)'
    WHEN 'investigations' THEN 'COALESCE(p.investigations_completed,0)'
    WHEN 'streak'      THEN 'COALESCE(p.streak,0)'
    WHEN 'longest_streak' THEN 'COALESCE(p.longest_streak,0)'
    WHEN 'discovery'   THEN 'COALESCE(p.discovery_pct,0)'
    ELSE 'COALESCE(p.xp,0)'
  END
$$;

-- 3) Core RPC: leaderboard_top(metric, timeframe, period_key, limit, offset)
--    `timeframe='alltime'` reads live profiles; everything else reads the
--    snapshot table for the given period_key (caller is responsible for
--    picking the current key, e.g. '2026-W26').
CREATE OR REPLACE FUNCTION public.leaderboard_top(
  p_metric     text DEFAULT 'xp',
  p_timeframe  text DEFAULT 'alltime',
  p_period_key text DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  rank integer, id uuid, username text, display_name text, avatar_id text,
  level integer, xp integer, score bigint, metric text, timeframe text, period_key text,
  is_me boolean, is_friend boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_metric    text := lower(coalesce(p_metric,'xp'));
  v_timeframe text := lower(coalesce(p_timeframe,'alltime'));
  v_limit     int  := GREATEST(1, LEAST(coalesce(p_limit,50), 200));
  v_offset    int  := GREATEST(0, coalesce(p_offset,0));
  v_expr      text := public.leaderboard_resolve_metric(v_metric);
  v_sql       text;
BEGIN
  IF v_timeframe = 'alltime' THEN
    v_sql := format($f$
      WITH ranked AS (
        SELECT p.id, p.username, p.display_name, p.avatar_id,
               COALESCE(p.level,0) AS level, COALESCE(p.xp,0) AS xp,
               (%s)::bigint AS score,
               ROW_NUMBER() OVER (
                 ORDER BY (%s)::bigint DESC, COALESCE(p.xp,0) DESC, p.id
               )::int AS rank
        FROM public.profiles p
        WHERE COALESCE(p.account_status,'active') = 'active'
      )
      SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id,
             r.level, r.xp, r.score,
             %L::text AS metric, %L::text AS timeframe, NULL::text AS period_key,
             (r.id = auth.uid()) AS is_me,
             EXISTS (
               SELECT 1 FROM public.friendships f
               WHERE f.status='accepted'
                 AND ((f.user_a = auth.uid() AND f.user_b = r.id)
                   OR (f.user_b = auth.uid() AND f.user_a = r.id))
             ) AS is_friend
      FROM ranked r
      ORDER BY r.rank
      LIMIT %s OFFSET %s
    $f$, v_expr, v_expr, v_metric, v_timeframe, v_limit, v_offset);
  ELSE
    v_sql := format($f$
      WITH ranked AS (
        SELECT s.user_id AS id,
               COALESCE(p.username,'')   AS username,
               p.display_name, p.avatar_id,
               COALESCE(p.level,0) AS level, COALESCE(p.xp,0) AS xp,
               s.score,
               ROW_NUMBER() OVER (ORDER BY s.score DESC, s.user_id)::int AS rank
        FROM public.leaderboard_snapshots s
        JOIN public.profiles p ON p.id = s.user_id
        WHERE s.metric = %L AND s.timeframe = %L AND s.period_key = %L
          AND COALESCE(p.account_status,'active') = 'active'
      )
      SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id,
             r.level, r.xp, r.score,
             %L::text AS metric, %L::text AS timeframe, %L::text AS period_key,
             (r.id = auth.uid()) AS is_me,
             EXISTS (
               SELECT 1 FROM public.friendships f
               WHERE f.status='accepted'
                 AND ((f.user_a = auth.uid() AND f.user_b = r.id)
                   OR (f.user_b = auth.uid() AND f.user_a = r.id))
             ) AS is_friend
      FROM ranked r
      ORDER BY r.rank
      LIMIT %s OFFSET %s
    $f$, v_metric, v_timeframe, coalesce(p_period_key,''),
         v_metric, v_timeframe, coalesce(p_period_key,''),
         v_limit, v_offset);
  END IF;

  RETURN QUERY EXECUTE v_sql;
END $$;

-- 4) Window around the current user, same metric/timeframe surface.
CREATE OR REPLACE FUNCTION public.leaderboard_around(
  p_metric     text DEFAULT 'xp',
  p_timeframe  text DEFAULT 'alltime',
  p_period_key text DEFAULT NULL,
  p_window     integer DEFAULT 3
)
RETURNS TABLE(
  rank integer, id uuid, username text, display_name text, avatar_id text,
  level integer, xp integer, score bigint, metric text, timeframe text, period_key text,
  is_me boolean, is_friend boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_metric    text := lower(coalesce(p_metric,'xp'));
  v_timeframe text := lower(coalesce(p_timeframe,'alltime'));
  v_window    int  := GREATEST(0, LEAST(coalesce(p_window,3), 25));
  v_expr      text := public.leaderboard_resolve_metric(v_metric);
  v_sql       text;
BEGIN
  IF v_timeframe = 'alltime' THEN
    v_sql := format($f$
      WITH ranked AS (
        SELECT p.id, p.username, p.display_name, p.avatar_id,
               COALESCE(p.level,0) AS level, COALESCE(p.xp,0) AS xp,
               (%s)::bigint AS score,
               ROW_NUMBER() OVER (
                 ORDER BY (%s)::bigint DESC, COALESCE(p.xp,0) DESC, p.id
               )::int AS rank
        FROM public.profiles p
        WHERE COALESCE(p.account_status,'active') = 'active'
      ),
      me AS (SELECT rank AS r FROM ranked WHERE id = auth.uid())
      SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id,
             r.level, r.xp, r.score,
             %L::text AS metric, %L::text AS timeframe, NULL::text AS period_key,
             (r.id = auth.uid()) AS is_me,
             EXISTS (
               SELECT 1 FROM public.friendships f
               WHERE f.status='accepted'
                 AND ((f.user_a = auth.uid() AND f.user_b = r.id)
                   OR (f.user_b = auth.uid() AND f.user_a = r.id))
             ) AS is_friend
      FROM ranked r, me
      WHERE r.rank BETWEEN me.r - %s AND me.r + %s
      ORDER BY r.rank
    $f$, v_expr, v_expr, v_metric, v_timeframe, v_window, v_window);
  ELSE
    v_sql := format($f$
      WITH ranked AS (
        SELECT s.user_id AS id,
               COALESCE(p.username,'') AS username,
               p.display_name, p.avatar_id,
               COALESCE(p.level,0) AS level, COALESCE(p.xp,0) AS xp,
               s.score,
               ROW_NUMBER() OVER (ORDER BY s.score DESC, s.user_id)::int AS rank
        FROM public.leaderboard_snapshots s
        JOIN public.profiles p ON p.id = s.user_id
        WHERE s.metric = %L AND s.timeframe = %L AND s.period_key = %L
          AND COALESCE(p.account_status,'active') = 'active'
      ),
      me AS (SELECT rank AS r FROM ranked WHERE id = auth.uid())
      SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id,
             r.level, r.xp, r.score,
             %L::text AS metric, %L::text AS timeframe, %L::text AS period_key,
             (r.id = auth.uid()) AS is_me,
             EXISTS (
               SELECT 1 FROM public.friendships f
               WHERE f.status='accepted'
                 AND ((f.user_a = auth.uid() AND f.user_b = r.id)
                   OR (f.user_b = auth.uid() AND f.user_a = r.id))
             ) AS is_friend
      FROM ranked r, me
      WHERE r.rank BETWEEN me.r - %s AND me.r + %s
      ORDER BY r.rank
    $f$, v_metric, v_timeframe, coalesce(p_period_key,''),
         v_metric, v_timeframe, coalesce(p_period_key,''),
         v_window, v_window);
  END IF;

  RETURN QUERY EXECUTE v_sql;
END $$;

-- 5) Legacy shims so existing client code keeps working unchanged.
CREATE OR REPLACE FUNCTION public.leaderboard_global(
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  rank integer, id uuid, username text, display_name text, avatar_id text,
  level integer, xp integer, is_me boolean, is_friend boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id, r.level, r.xp,
         r.is_me, r.is_friend
  FROM public.leaderboard_top('xp', 'alltime', NULL, p_limit, p_offset) r;
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_around_me(p_window integer DEFAULT 3)
RETURNS TABLE(
  rank integer, id uuid, username text, display_name text, avatar_id text,
  level integer, xp integer, is_me boolean, is_friend boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.rank, r.id, r.username, r.display_name, r.avatar_id, r.level, r.xp,
         r.is_me, r.is_friend
  FROM public.leaderboard_around('xp', 'alltime', NULL, p_window) r;
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_top(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_around(text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_resolve_metric(text) TO authenticated;
