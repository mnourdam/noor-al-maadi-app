
-- 1) Canonical registry seeds (idempotent)
INSERT INTO public.content_registry (id, type, name, data, status) VALUES
  ('streak_week',            'badge',    'وسام الأسبوع',              '{"description":"سبعة أيام متتالية من الحضور في إرث.","rarity":"rare","source":"streak"}'::jsonb,     'published'),
  ('streak_year_guardian',   'badge',    'حارس السنة',                '{"description":"365 يوماً متتالياً في إرث.","rarity":"legendary","source":"streak"}'::jsonb,       'published'),
  ('streak_chronicle',       'artifact', 'سِفر الشهر',                '{"description":"يخلّد ثلاثين يوماً متواصلاً من التعلم.","rarity":"epic","source":"streak"}'::jsonb,  'published'),
  ('streak_year_chronicle',  'artifact', 'سِفر العام الكامل',         '{"description":"يخلّد سنةً كاملةً من العهد مع الإرث.","rarity":"legendary","source":"streak"}'::jsonb, 'published')
ON CONFLICT (id) DO UPDATE
  SET type = EXCLUDED.type,
      name = EXCLUDED.name,
      data = EXCLUDED.data,
      status = EXCLUDED.status,
      updated_at = now();

-- 2) Upgrade record_streak_activity: actually resolve + grant optional rewards.
CREATE OR REPLACE FUNCTION public.record_streak_activity(
  p_source    text DEFAULT NULL,
  p_source_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  granted_title    boolean;
  granted_badge    boolean;
  granted_artifact boolean;
  reg_type text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  today_ry := ((now() AT TIME ZONE 'Asia/Riyadh')::date);
  yest_ry  := today_ry - INTERVAL '1 day';

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
    new_streak    := prev_streak;
    new_longest   := prev_longest;
    already_today := true;
  ELSIF prev_last_day = yest_ry THEN
    new_streak  := prev_streak + 1;
    new_longest := GREATEST(prev_longest, new_streak);
  ELSE
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

    FOR ms IN
      SELECT * FROM (VALUES
        ( 3::int,   50::int,   30::int,   NULL::text,                    NULL::text,                          NULL::text),
        ( 7::int,  150::int,   60::int,   'streak_week'::text,           NULL::text,                          NULL::text),
        (30::int,  500::int,  200::int,   NULL::text,                    NULL::text,                          'streak_chronicle'::text),
        (100::int, 1500::int, 500::int,   NULL::text,                    'حافظ التاريخ'::text,                NULL::text),
        (365::int, 10000::int, 3650::int, 'streak_year_guardian'::text,  'حارس الإرث لعامٍ كامل'::text,      'streak_year_chronicle'::text)
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
        UPDATE public.profiles
           SET xp = COALESCE(xp, 0) + ms.xp,
               dinars = COALESCE(dinars, 0) + ms.dinars,
               updated_at = now()
         WHERE id = uid;

        granted_title    := false;
        granted_badge    := false;
        granted_artifact := false;

        -- TITLE: text-only registry; grant if non-empty (skip safely on error).
        IF ms.title_id IS NOT NULL AND length(btrim(ms.title_id)) > 0 THEN
          BEGIN
            INSERT INTO public.user_titles (user_id, title_id, source_achievement_id)
            VALUES (uid, ms.title_id, 'streak:' || ms.days::text)
            ON CONFLICT (user_id, title_id) DO NOTHING;
            granted_title := true;
          EXCEPTION WHEN OTHERS THEN
            granted_title := false;
          END;
        END IF;

        -- BADGE: must resolve in content_registry with type='badge'.
        IF ms.badge_id IS NOT NULL AND length(btrim(ms.badge_id)) > 0 THEN
          SELECT type INTO reg_type FROM public.content_registry
            WHERE id = ms.badge_id AND status = 'published';
          IF reg_type = 'badge' THEN
            BEGIN
              INSERT INTO public.user_collection (user_id, item_id, item_type)
              VALUES (uid, ms.badge_id, 'badge')
              ON CONFLICT (user_id, item_id) DO NOTHING;
              granted_badge := true;
            EXCEPTION WHEN OTHERS THEN
              granted_badge := false;
            END;
          END IF;
        END IF;

        -- ARTIFACT: must resolve in content_registry with type='artifact'.
        IF ms.artifact_id IS NOT NULL AND length(btrim(ms.artifact_id)) > 0 THEN
          SELECT type INTO reg_type FROM public.content_registry
            WHERE id = ms.artifact_id AND status = 'published';
          IF reg_type = 'artifact' THEN
            BEGIN
              INSERT INTO public.user_collection (user_id, item_id, item_type)
              VALUES (uid, ms.artifact_id, 'artifact')
              ON CONFLICT (user_id, item_id) DO NOTHING;
              granted_artifact := true;
            EXCEPTION WHEN OTHERS THEN
              granted_artifact := false;
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
$function$;

REVOKE ALL ON FUNCTION public.record_streak_activity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_streak_activity(text, text) TO authenticated;
