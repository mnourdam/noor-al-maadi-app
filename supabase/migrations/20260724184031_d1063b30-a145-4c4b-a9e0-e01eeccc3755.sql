
CREATE OR REPLACE FUNCTION public._streak_test_harness(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  results jsonb := '[]'::jsonb;
  m int;
  today_ry date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  first jsonb; second jsonb;
  ledger jsonb; titles jsonb; coll jsonb; prof jsonb;
BEGIN
  -- Full reset
  DELETE FROM public.user_streak_reward_claims WHERE user_id = _uid;
  DELETE FROM public.user_titles               WHERE user_id = _uid;
  DELETE FROM public.user_collection           WHERE user_id = _uid AND item_id LIKE 'streak%';
  UPDATE public.profiles SET xp = 0, dinars = 0, streak = 0, longest_streak = 0, last_streak_day = NULL WHERE id = _uid;

  FOREACH m IN ARRAY ARRAY[3,7,30,100,365]
  LOOP
    -- Isolate per-milestone side effects
    DELETE FROM public.user_titles               WHERE user_id = _uid;
    DELETE FROM public.user_collection           WHERE user_id = _uid AND item_id LIKE 'streak%';

    UPDATE public.profiles
       SET streak = m - 1,
           longest_streak = GREATEST(longest_streak, m - 1),
           last_streak_day = today_ry - INTERVAL '1 day',
           xp = 0, dinars = 0
     WHERE id = _uid;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);

    first  := public.record_streak_activity('test', 'ms-' || m::text);
    second := public.record_streak_activity('test', 'ms-' || m::text);

    PERFORM set_config('request.jwt.claims', NULL, true);

    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.milestone_days) INTO ledger
      FROM public.user_streak_reward_claims r
     WHERE user_id = _uid AND milestone_days = m;
    SELECT jsonb_agg(to_jsonb(t)) INTO titles FROM public.user_titles t WHERE user_id = _uid;
    SELECT jsonb_agg(to_jsonb(c)) INTO coll FROM public.user_collection c
      WHERE user_id = _uid AND item_id LIKE 'streak%';
    SELECT to_jsonb(p) INTO prof
      FROM (SELECT xp, dinars, streak, longest_streak, last_streak_day
              FROM public.profiles WHERE id = _uid) p;

    results := results || jsonb_build_object(
      'milestone', m,
      'first_call', first,
      'second_call_grants', COALESCE(second->'grants','[]'::jsonb),
      'second_already_today', second->'already_recorded_today',
      'ledger_row_for_milestone', ledger,
      'user_titles_after', titles,
      'user_collection_streak_items', coll,
      'profile_after', prof
    );
  END LOOP;

  -- Final cleanup for the test user
  DELETE FROM public.user_streak_reward_claims WHERE user_id = _uid;
  DELETE FROM public.user_titles               WHERE user_id = _uid;
  DELETE FROM public.user_collection           WHERE user_id = _uid AND item_id LIKE 'streak%';
  UPDATE public.profiles SET xp = 0, dinars = 300, streak = 0, longest_streak = 0, last_streak_day = NULL WHERE id = _uid;

  RETURN results;
END $$;

REVOKE ALL ON FUNCTION public._streak_test_harness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._streak_test_harness(uuid) TO sandbox_exec;
