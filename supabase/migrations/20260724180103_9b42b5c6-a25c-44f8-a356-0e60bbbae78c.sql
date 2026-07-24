
-- 1) Profiles: add canonical last-streak-day (Asia/Riyadh).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_streak_day date;

-- 2) Ledger: extend for reward versioning + audit of what was granted.
ALTER TABLE public.user_streak_reward_claims
  ADD COLUMN IF NOT EXISTS reward_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reward_key text,
  ADD COLUMN IF NOT EXISTS xp_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinars_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_id text,
  ADD COLUMN IF NOT EXISTS title_id text,
  ADD COLUMN IF NOT EXISTS artifact_id text,
  ADD COLUMN IF NOT EXISTS source text;

-- Backfill reward_key for legacy rows.
UPDATE public.user_streak_reward_claims
   SET reward_key = 'streak:' || milestone_days::text || ':v' || reward_version::text
 WHERE reward_key IS NULL;

ALTER TABLE public.user_streak_reward_claims
  ALTER COLUMN reward_key SET NOT NULL;

-- Swap uniqueness: (user_id, milestone_days) -> (user_id, milestone_days, reward_version).
ALTER TABLE public.user_streak_reward_claims
  DROP CONSTRAINT IF EXISTS user_streak_reward_claims_user_id_milestone_days_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_streak_reward_claims_user_ms_ver_key
  ON public.user_streak_reward_claims (user_id, milestone_days, reward_version);

CREATE UNIQUE INDEX IF NOT EXISTS user_streak_reward_claims_user_reward_key
  ON public.user_streak_reward_claims (user_id, reward_key);

-- 3) Canonical RPC: record a qualifying streak activity.
CREATE OR REPLACE FUNCTION public.record_streak_activity(
  p_source    text DEFAULT NULL,
  p_source_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today_ry date;
  yest_ry  date;
  prev_streak    integer;
  prev_longest   integer;
  prev_last_day  date;
  new_streak     integer;
  new_longest    integer;
  already_today  boolean := false;
  grants jsonb := '[]'::jsonb;
  ms record;
  ins_id uuid;
  final_xp integer;
  final_dinars integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  today_ry := ((now() AT TIME ZONE 'Asia/Riyadh')::date);
  yest_ry  := today_ry - INTERVAL '1 day';

  -- Lock the caller's profile row for the duration of the transaction.
  SELECT COALESCE(streak, 0),
         COALESCE(longest_streak, 0),
         last_streak_day
    INTO prev_streak, prev_longest, prev_last_day
    FROM public.profiles
   WHERE id = uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0002';
  END IF;

  IF prev_last_day = today_ry THEN
    -- Already counted today. No increment, no grants.
    new_streak    := prev_streak;
    new_longest   := prev_longest;
    already_today := true;
  ELSIF prev_last_day = yest_ry THEN
    new_streak  := prev_streak + 1;
    new_longest := GREATEST(prev_longest, new_streak);
  ELSE
    -- Missed one or more full days (or never played).
    new_streak  := 1;
    new_longest := GREATEST(prev_longest, 1);
  END IF;

  IF NOT already_today THEN
    UPDATE public.profiles
       SET streak = new_streak,
           longest_streak = new_longest,
           last_streak_day = today_ry,
           last_active = now(),
           updated_at = now()
     WHERE id = uid;

    -- Grant every milestone reached by this bump but not yet granted.
    -- Canonical milestone registry (mirrored in src/lib/hearts.ts).
    FOR ms IN
      SELECT * FROM (VALUES
        ( 3::int,   50::int,   30::int,   NULL::text,                NULL::text,           NULL::text),
        ( 7::int,  150::int,   60::int,   'streak_week'::text,       NULL::text,           NULL::text),
        (30::int,  500::int,  200::int,   NULL::text,                NULL::text,           'streak_chronicle'::text),
        (100::int, 1500::int, 500::int,   NULL::text,                'حافظ التاريخ'::text, NULL::text),
        (365::int, 10000::int, 3650::int, 'streak_year_guardian'::text, 'حارس الإرث لعامٍ كامل'::text, 'streak_year_chronicle'::text)
      ) AS t(days, xp, dinars, badge_id, title_id, artifact_id)
      WHERE t.days <= new_streak
      ORDER BY t.days
    LOOP
      BEGIN
        INSERT INTO public.user_streak_reward_claims
          (user_id, milestone_days, reward_version, reward_key,
           xp_granted, dinars_granted, badge_id, title_id, artifact_id, source)
        VALUES
          (uid, ms.days, 1,
           'streak:' || ms.days::text || ':v1',
           ms.xp, ms.dinars, ms.badge_id, ms.title_id, ms.artifact_id,
           COALESCE(p_source, 'unknown'))
        RETURNING id INTO ins_id;
      EXCEPTION WHEN unique_violation THEN
        ins_id := NULL;
      END;

      IF ins_id IS NOT NULL THEN
        -- Apply XP + Dinars authoritatively.
        UPDATE public.profiles
           SET xp = COALESCE(xp, 0) + ms.xp,
               dinars = COALESCE(dinars, 0) + ms.dinars,
               updated_at = now()
         WHERE id = uid;

        grants := grants || jsonb_build_object(
          'reward_key',      'streak:' || ms.days::text || ':v1',
          'milestone_days',  ms.days,
          'reward_version',  1,
          'xp_granted',      ms.xp,
          'dinars_granted',  ms.dinars,
          'badge_id',        ms.badge_id,
          'title_id',        ms.title_id,
          'artifact_id',     ms.artifact_id
        );
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(xp, 0), COALESCE(dinars, 0)
    INTO final_xp, final_dinars
    FROM public.profiles WHERE id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'already_recorded_today', already_today,
    'current_streak', new_streak,
    'longest_streak', new_longest,
    'last_active_day', today_ry,
    'grants', grants,
    'xp_total', final_xp,
    'dinar_balance', final_dinars
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_streak_activity(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_streak_activity(text, text) FROM anon, PUBLIC;

-- 4) Legacy compatibility wrapper. Never grants rewards; returns already-granted state.
CREATE OR REPLACE FUNCTION public.claim_streak_reward(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur_streak integer;
  already boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_days IS NULL OR p_days <= 0 THEN RAISE EXCEPTION 'invalid_milestone'; END IF;

  SELECT COALESCE(streak, 0) INTO cur_streak FROM public.profiles WHERE id = uid;

  SELECT EXISTS(
    SELECT 1 FROM public.user_streak_reward_claims
    WHERE user_id = uid AND milestone_days = p_days
  ) INTO already;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', CASE WHEN already THEN 'already_claimed' ELSE 'deprecated_use_record_streak_activity' END,
    'streak', cur_streak,
    'milestone_days', p_days,
    'deprecated', true
  );
END;
$$;
