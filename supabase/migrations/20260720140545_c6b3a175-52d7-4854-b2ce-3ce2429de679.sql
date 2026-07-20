
-- ============================================================
-- Achievement Engine v2 — Server-authoritative reward integrity
-- ============================================================

CREATE TABLE IF NOT EXISTS public.achievement_registry (
  id text PRIMARY KEY,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  dinars integer NOT NULL DEFAULT 0 CHECK (dinars >= 0),
  title_id text,
  rarity text NOT NULL,
  category text NOT NULL,
  engine_version integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.achievement_registry TO authenticated, anon;
GRANT ALL ON public.achievement_registry TO service_role;

ALTER TABLE public.achievement_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievement_registry_public_read"
  ON public.achievement_registry FOR SELECT
  TO authenticated, anon
  USING (true);

-- --------------- user_titles ---------------
CREATE TABLE IF NOT EXISTS public.user_titles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  source_achievement_id text,
  PRIMARY KEY (user_id, title_id)
);
CREATE INDEX IF NOT EXISTS user_titles_user_idx
  ON public.user_titles (user_id, earned_at DESC);

GRANT SELECT, INSERT ON public.user_titles TO authenticated;
GRANT ALL ON public.user_titles TO service_role;

ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_titles_select_own"
  ON public.user_titles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
-- Writes go exclusively through the SECURITY DEFINER RPC below;
-- no INSERT policy is exposed to authenticated.

-- --------------- Seed registry ---------------
INSERT INTO public.achievement_registry (id, xp, dinars, title_id, rarity, category) VALUES
  ('ach_campaign_1',    150,  100, NULL,                'common',    'campaigns'),
  ('ach_campaign_3',    400,  200, NULL,                'rare',      'campaigns'),
  ('ach_campaign_5',    800,  400, NULL,                'rare',      'campaigns'),
  ('ach_campaign_10',  1800,    0, 'قاهر الجبهات',      'epic',      'campaigns'),
  ('ach_campaign_20',  4000,    0, 'فاتح الفاتحين',     'legendary', 'campaigns'),
  ('ach_inv_1',         100,    0, NULL,                'common',    'investigations'),
  ('ach_inv_5',         100,    0, NULL,                'common',    'investigations'),
  ('ach_inv_15',        300,  150, NULL,                'rare',      'investigations'),
  ('ach_inv_30',        700,  300, NULL,                'rare',      'investigations'),
  ('ach_inv_60',       2000,    0, 'إمام المحقّقين',    'legendary', 'investigations'),
  ('ach_streak_7',      100,    0, NULL,                'common',    'daily'),
  ('ach_streak_30',     400,  250, NULL,                'rare',      'daily'),
  ('ach_streak_100',   1500,    0, 'صاحب المئة',        'epic',      'daily'),
  ('ach_streak_365',   5000,    0, 'حارس العام',        'legendary', 'daily'),
  ('ach_level_5',       150,    0, NULL,                'common',    'level'),
  ('ach_level_7',         0,  400, NULL,                'rare',      'level'),
  ('ach_level_10',        0,    0, 'أسطورة التاريخ',    'legendary', 'level'),
  ('ach_points_1000',     0,  100, NULL,                'common',    'economy'),
  ('ach_points_5000',     0,  500, NULL,                'rare',      'economy'),
  ('ach_points_15000',    0, 1500, NULL,                'rare',      'economy'),
  ('ach_points_50000',    0,    0, 'ذو الخمسين',        'epic',      'economy'),
  ('ach_dinars_500',    100,    0, NULL,                'common',    'economy'),
  ('ach_dinars_2000',   300,    0, NULL,                'rare',      'economy'),
  ('ach_dinars_10000',    0,    0, 'تاجر الإرث',        'epic',      'economy'),
  ('ach_artifact_10',   100,    0, NULL,                'common',    'museum'),
  ('ach_artifact_25',   250,  150, NULL,                'rare',      'museum'),
  ('ach_artifact_50',   600,  350, NULL,                'rare',      'museum'),
  ('ach_artifact_100', 1500,    0, 'ربّ المتحف',        'epic',      'museum'),
  ('ach_char_6',         80,    0, NULL,                'common',    'encyclopedia'),
  ('ach_char_15',       200,  100, NULL,                'rare',      'encyclopedia'),
  ('ach_char_30',       500,  200, NULL,                'rare',      'encyclopedia'),
  ('ach_char_60',      1200,    0, 'موسوعة الشخصيات',   'epic',      'encyclopedia'),
  ('ach_region_5',       80,    0, NULL,                'common',    'atlas'),
  ('ach_region_10',     200,    0, NULL,                'rare',      'atlas'),
  ('ach_region_15',     500,  250, NULL,                'rare',      'atlas'),
  ('ach_eras_5',        250,    0, NULL,                'rare',      'encyclopedia'),
  ('ach_eras_10',       800,    0, 'ابن العصور',        'epic',      'encyclopedia'),
  ('ach_collection_50',  300,   0, NULL,                'rare',      'collection'),
  ('ach_collection_150',1200, 600, NULL,                'epic',      'collection'),
  ('ach_collection_300',3000,   0, 'أمين الأرشيف الأكبر','legendary', 'collection'),
  ('ach_titles_3',      250,    0, NULL,                'rare',      'special'),
  ('ach_titles_10',       0, 1500, NULL,                'epic',      'special'),
  ('ach_legend_master',5000,    0, 'سيّد الميادين',     'legendary', 'special'),
  ('ach_legend_eternal',  0,    0, 'الخالد',            'legendary', 'special')
ON CONFLICT (id) DO UPDATE SET
  xp = EXCLUDED.xp,
  dinars = EXCLUDED.dinars,
  title_id = EXCLUDED.title_id,
  rarity = EXCLUDED.rarity,
  category = EXCLUDED.category;

-- --------------- Atomic claim RPC ---------------
CREATE OR REPLACE FUNCTION public.claim_achievement_rewards(_ids text[])
RETURNS TABLE (
  inserted text[],
  already_claimed text[],
  rejected text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_valid text[];
  v_inserted text[] := ARRAY[]::text[];
  v_already text[];
  v_rejected text[];
  v_xp int := 0;
  v_dinars int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN QUERY SELECT ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[];
    RETURN;
  END IF;

  -- Split ids into (registered, rejected).
  SELECT COALESCE(array_agg(DISTINCT r.id), ARRAY[]::text[])
    INTO v_valid
    FROM public.achievement_registry r
    WHERE r.id = ANY(_ids);

  v_rejected := ARRAY(
    SELECT unnest(_ids)
    EXCEPT
    SELECT unnest(v_valid)
  );

  IF array_length(v_valid, 1) IS NULL THEN
    RETURN QUERY SELECT ARRAY[]::text[], ARRAY[]::text[], COALESCE(v_rejected, ARRAY[]::text[]);
    RETURN;
  END IF;

  -- Idempotent insert; only rows that did not exist come back.
  WITH ins AS (
    INSERT INTO public.user_achievements (user_id, achievement_id, engine_version, definition_version)
    SELECT v_user, id, 2, 1 FROM unnest(v_valid) AS id
    ON CONFLICT (user_id, achievement_id) DO NOTHING
    RETURNING achievement_id
  )
  SELECT COALESCE(array_agg(achievement_id), ARRAY[]::text[]) INTO v_inserted FROM ins;

  v_already := ARRAY(
    SELECT unnest(v_valid)
    EXCEPT
    SELECT unnest(v_inserted)
  );

  IF array_length(v_inserted, 1) IS NULL THEN
    RETURN QUERY SELECT ARRAY[]::text[]::text[], COALESCE(v_already, ARRAY[]::text[]), COALESCE(v_rejected, ARRAY[]::text[]);
    RETURN;
  END IF;

  -- Sum authoritative reward payload from registry for newly-inserted ids.
  SELECT COALESCE(SUM(xp), 0), COALESCE(SUM(dinars), 0)
    INTO v_xp, v_dinars
    FROM public.achievement_registry
    WHERE id = ANY(v_inserted);

  -- Grant XP + dinars atomically.
  IF v_xp > 0 OR v_dinars > 0 THEN
    UPDATE public.profiles
       SET xp = COALESCE(xp, 0) + v_xp,
           dinars = COALESCE(dinars, 0) + v_dinars
     WHERE id = v_user;
  END IF;

  -- Grant titles (idempotent).
  INSERT INTO public.user_titles (user_id, title_id, source_achievement_id)
  SELECT v_user, r.title_id, r.id
    FROM public.achievement_registry r
   WHERE r.id = ANY(v_inserted) AND r.title_id IS NOT NULL
  ON CONFLICT (user_id, title_id) DO NOTHING;

  -- Stamp rewards_granted_at + record payload.
  UPDATE public.user_achievements ua
     SET rewards_granted_at = now(),
         rewards_payload = jsonb_build_object(
           'xp', r.xp,
           'dinars', r.dinars,
           'title_id', r.title_id
         )
    FROM public.achievement_registry r
   WHERE ua.user_id = v_user
     AND ua.achievement_id = ANY(v_inserted)
     AND ua.achievement_id = r.id;

  RETURN QUERY SELECT
    COALESCE(v_inserted, ARRAY[]::text[]),
    COALESCE(v_already, ARRAY[]::text[]),
    COALESCE(v_rejected, ARRAY[]::text[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_achievement_rewards(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_achievement_rewards(text[]) FROM anon, public;
