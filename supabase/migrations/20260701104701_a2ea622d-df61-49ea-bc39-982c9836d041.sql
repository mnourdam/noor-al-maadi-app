
-- 1) Rating columns
ALTER TABLE public.feedback_issues
  ADD COLUMN IF NOT EXISTS player_rating smallint,
  ADD COLUMN IF NOT EXISTS player_rating_at timestamptz;

ALTER TABLE public.feedback_issues
  DROP CONSTRAINT IF EXISTS feedback_issues_player_rating_range;
ALTER TABLE public.feedback_issues
  ADD CONSTRAINT feedback_issues_player_rating_range
  CHECK (player_rating IS NULL OR player_rating BETWEEN 1 AND 5);

-- 2) Player rating RPC (only reporter, only on closed issues)
CREATE OR REPLACE FUNCTION public.rate_feedback_issue(p_issue_id uuid, p_rating smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter uuid;
  v_status text;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid rating';
  END IF;
  SELECT reporter_id, status::text INTO v_reporter, v_status
  FROM public.feedback_issues WHERE id = p_issue_id;
  IF v_reporter IS NULL OR v_reporter <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF v_status <> 'closed' THEN
    RAISE EXCEPTION 'issue must be closed to rate';
  END IF;
  UPDATE public.feedback_issues
    SET player_rating = p_rating,
        player_rating_at = now(),
        updated_at = now()
    WHERE id = p_issue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_feedback_issue(uuid, smallint) TO authenticated;

-- 3) Unread counter for the current player
CREATE OR REPLACE FUNCTION public.count_my_unread_feedback()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::int
  FROM public.feedback_issues
  WHERE reporter_id = auth.uid() AND player_unread = true;
$$;

GRANT EXECUTE ON FUNCTION public.count_my_unread_feedback() TO authenticated;

-- 4) Admin stats
CREATE OR REPLACE FUNCTION public.admin_feedback_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb;
  v_avg_first interval;
  v_avg_resolution interval;
  v_avg_rating numeric;
  v_rating_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT jsonb_object_agg(status, cnt) INTO v_counts
  FROM (
    SELECT status::text AS status, COUNT(*)::int AS cnt
    FROM public.feedback_issues
    GROUP BY status
  ) s;

  -- Avg first admin response time (created_at -> first admin message)
  SELECT AVG(fm.created_at - fi.created_at) INTO v_avg_first
  FROM public.feedback_issues fi
  JOIN LATERAL (
    SELECT created_at FROM public.feedback_messages
    WHERE issue_id = fi.id AND author_role = 'admin' AND is_internal = false
    ORDER BY created_at ASC LIMIT 1
  ) fm ON true;

  -- Avg resolution time for closed / fixed
  SELECT AVG(updated_at - created_at) INTO v_avg_resolution
  FROM public.feedback_issues
  WHERE status IN ('closed', 'fixed');

  SELECT AVG(player_rating)::numeric(4,2), COUNT(*)::int
    INTO v_avg_rating, v_rating_count
  FROM public.feedback_issues
  WHERE player_rating IS NOT NULL;

  RETURN jsonb_build_object(
    'counts', COALESCE(v_counts, '{}'::jsonb),
    'avg_first_response_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_first), 0),
    'avg_resolution_seconds', COALESCE(EXTRACT(EPOCH FROM v_avg_resolution), 0),
    'avg_rating', COALESCE(v_avg_rating, 0),
    'rating_count', COALESCE(v_rating_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_feedback_stats() TO authenticated;
