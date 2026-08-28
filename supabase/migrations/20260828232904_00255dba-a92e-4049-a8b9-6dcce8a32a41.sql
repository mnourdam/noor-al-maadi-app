CREATE OR REPLACE FUNCTION public.record_streak_activity_v16(p_source text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text, p_activity_day date DEFAULT NULL::date, p_client_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  today_ry date;
  min_day  date;
  day_in   date;
  rejected boolean := false;
  reject_reason text := NULL;
  inserted boolean := false;
  inserted_rows integer := 0;
  prev_streak   integer;
  prev_longest  integer;
  prev_last_day date;
  last_day date;
  new_streak  integer := 0;
  new_longest integer := 0;
  grants jsonb := '[]'::jsonb;
  ms record;
  ins_id uuid;
  final_xp integer;
  final_dinars integer;
  granted_title boolean;
  granted_badge boolean;
  granted_artifact boolean;
  reg_type text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  today_ry := ((now() AT TIME ZONE 'Asia/Riyadh')::date);
  min_day  := today_ry - 2;

  SELECT COALESCE(streak, 0), COALESCE(longest_streak, 0), last_streak_day
    INTO prev_streak, prev_longest, prev_last_day
    FROM public.profiles
   WHERE id = uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0002';
  END IF;

  day_in := COALESCE(p_activity_day, today_ry);
  IF day_in > today_ry THEN
    day_in := today_ry;
  ELSIF day_in < min_day THEN
    rejected := true;
    reject_reason := 'activity_day_out_of_window';
  END IF;

  IF prev_last_day IS NOT NULL AND prev_streak > 0
     AND NOT EXISTS (SELECT 1 FROM public.user_streak_days WHERE user_id = uid) THEN
    INSERT INTO public.user_streak_days (user_id, activity_day, source, source_id, client_key)
    SELECT uid, prev_last_day - g, 'legacy_bridge', NULL, NULL
      FROM generate_series(0, LEAST(prev_streak, 4000) - 1) AS g
    ON CONFLICT (user_id, activity_day) DO NOTHING;
  END IF;

  IF NOT rejected THEN
    INSERT INTO public.user_streak_days (user_id, activity_day, source, source_id, client_key)
    VALUES (uid, day_in, COALESCE(p_source, 'unknown'), p_source_id, p_client_key)
    ON CONFLICT (user_id, activity_day) DO NOTHING;
    -- GET DIAGNOSTICS yields an integer; assign it to an integer variable and
    -- derive the boolean explicitly (int -> boolean has no assignment cast).
    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    inserted := inserted_rows > 0;
  END IF;

  WITH g AS (
    SELECT activity_day,
           activity_day - (ROW_NUMBER() OVER (ORDER BY activity_day))::int AS grp
      FROM public.user_streak_days
     WHERE user_id = uid
  ), runs AS (
    SELECT grp, COUNT(*)::int AS len, MAX(activity_day) AS ends_on FROM g GROUP BY grp
  )
  SELECT COALESCE((SELECT len FROM runs ORDER BY ends_on DESC LIMIT 1), 0),
         COALESCE((SELECT MAX(len) FROM runs), 0),
         (SELECT MAX(ends_on) FROM runs)
    INTO new_streak, new_longest, last_day;

  new_longest := GREATEST(prev_longest, new_longest, new_streak);
  IF last_day IS NULL THEN
    new_streak := prev_streak;
    last_day   := prev_last_day;
  END IF;

  UPDATE public.profiles
     SET streak          = new_streak,
         longest_streak  = new_longest,
         last_streak_day = GREATEST(COALESCE(last_day, prev_last_day), COALESCE(prev_last_day, last_day)),
         last_active     = now(),
         updated_at      = now()
   WHERE id = uid;

  FOR ms IN
    SELECT * FROM (VALUES
      ( 3::int,   50::int,   30::int,   NULL::text,                    NULL::text,                     NULL::text),
      ( 7::int,  150::int,   60::int,   'streak_week'::text,           NULL::text,                     NULL::text),
      (30::int,  500::int,  200::int,   NULL::text,                    NULL::text,                     'streak_chronicle'::text),
      (100::int, 1500::int, 500::int,   NULL::text,                    'حافظ التاريخ'::text,            NULL::text),
      (365::int, 10000::int, 3650::int, 'streak_year_guardian'::text,  'حارس الإرث لعامٍ كامل'::text,  'streak_year_chronicle'::text)
    ) AS t(days, xp, dinars, badge_id, title_id, artifact_id)
    WHERE t.days <= new_streak
    ORDER BY t.days
  LOOP
    BEGIN
      INSERT INTO public.user_streak_reward_claims
        (user_id, milestone_days, reward_version, reward_key,
         xp_granted, dinars_granted, badge_id, title_id, artifact_id, source)
      VALUES
        (uid, ms.days, 1, 'streak:' || ms.days::text || ':v1',
         ms.xp, ms.dinars, ms.badge_id, ms.title_id, ms.artifact_id,
         COALESCE(p_source, 'unknown'))
      RETURNING id INTO ins_id;
    EXCEPTION WHEN unique_violation THEN
      ins_id := NULL;
    END;

    IF ins_id IS NOT NULL THEN
      UPDATE public.profiles
         SET xp = COALESCE(xp, 0) + ms.xp,
             dinars = COALESCE(dinars, 0) + ms.dinars,
             updated_at = now()
       WHERE id = uid;

      granted_title := false; granted_badge := false; granted_artifact := false;

      IF ms.title_id IS NOT NULL AND length(btrim(ms.title_id)) > 0 THEN
        BEGIN
          INSERT INTO public.user_titles (user_id, title_id, source_achievement_id)
          VALUES (uid, ms.title_id, 'streak:' || ms.days::text)
          ON CONFLICT (user_id, title_id) DO NOTHING;
          granted_title := true;
        EXCEPTION WHEN OTHERS THEN granted_title := false;
        END;
      END IF;

      IF ms.badge_id IS NOT NULL AND length(btrim(ms.badge_id)) > 0 THEN
        SELECT type INTO reg_type FROM public.content_registry
          WHERE id = ms.badge_id AND status = 'published';
        IF reg_type = 'badge' THEN
          BEGIN
            INSERT INTO public.user_collection (user_id, item_id, item_type)
            VALUES (uid, ms.badge_id, 'badge')
            ON CONFLICT (user_id, item_id) DO NOTHING;
            granted_badge := true;
          EXCEPTION WHEN OTHERS THEN granted_badge := false;
          END;
        END IF;
      END IF;

      IF ms.artifact_id IS NOT NULL AND length(btrim(ms.artifact_id)) > 0 THEN
        SELECT type INTO reg_type FROM public.content_registry
          WHERE id = ms.artifact_id AND status = 'published';
        IF reg_type = 'artifact' THEN
          BEGIN
            INSERT INTO public.user_collection (user_id, item_id, item_type)
            VALUES (uid, ms.artifact_id, 'artifact')
            ON CONFLICT (user_id, item_id) DO NOTHING;
            granted_artifact := true;
          EXCEPTION WHEN OTHERS THEN granted_artifact := false;
          END;
        END IF;
      END IF;

      grants := grants || jsonb_build_object(
        'reward_key',      'streak:' || ms.days::text || ':v1',
        'milestone_days',  ms.days,
        'reward_version',  1,
        'xp_granted',      ms.xp,
        'dinars_granted',  ms.dinars,
        'badge_id',        ms.badge_id,
        'title_id',        ms.title_id,
        'artifact_id',     ms.artifact_id,
        'title_granted',   granted_title,
        'badge_granted',   granted_badge,
        'artifact_granted',granted_artifact
      );
    END IF;
  END LOOP;

  SELECT COALESCE(xp, 0), COALESCE(dinars, 0), COALESCE(streak,0), COALESCE(longest_streak,0), last_streak_day
    INTO final_xp, final_dinars, new_streak, new_longest, last_day
    FROM public.profiles WHERE id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'recorded', (NOT rejected),
    'rejected_reason', reject_reason,
    'activity_day', CASE WHEN rejected THEN NULL ELSE day_in END,
    'newly_recorded_day', inserted,
    'already_recorded_today', (NOT inserted AND NOT rejected),
    'server_today', today_ry,
    'current_streak', new_streak,
    'longest_streak', new_longest,
    'last_active_day', last_day,
    'grants', grants,
    'xp_total', final_xp,
    'dinar_balance', final_dinars
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_streak_activity_v16(text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_streak_activity_v16(text, text, date, text) TO authenticated;