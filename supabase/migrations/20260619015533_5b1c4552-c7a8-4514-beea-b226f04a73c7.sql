
-- 1. Lock down profile UPDATE column-level grants
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT UPDATE (username, bio, title, favorite_state_id, favorite_figure_id, last_active)
  ON public.profiles TO authenticated;

-- 2. Server-side sync of public stats with clamps
CREATE OR REPLACE FUNCTION public.sync_my_public_stats(p_stats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  UPDATE public.profiles SET
    bio                 = COALESCE(LEFT(NULLIF(p_stats->>'bio',''), 500), bio),
    title               = COALESCE(LEFT(NULLIF(p_stats->>'title',''), 100), title),
    level               = LEAST(GREATEST(COALESCE((p_stats->>'level')::int, level), 0), 999),
    xp                  = LEAST(GREATEST(COALESCE((p_stats->>'xp')::int, xp), 0), 100000000),
    dinars              = LEAST(GREATEST(COALESCE((p_stats->>'dinars')::int, dinars), 0), 100000000),
    streak              = LEAST(GREATEST(COALESCE((p_stats->>'streak')::int, streak), 0), 100000),
    campaigns_completed = LEAST(GREATEST(COALESCE((p_stats->>'campaigns_completed')::int, campaigns_completed), 0), 100000),
    artifacts_collected = LEAST(GREATEST(COALESCE((p_stats->>'artifacts_collected')::int, artifacts_collected), 0), 100000),
    discovery_pct       = LEAST(GREATEST(COALESCE((p_stats->>'discovery_pct')::int, discovery_pct), 0), 100),
    favorite_state_id   = COALESCE(NULLIF(p_stats->>'favorite_state_id',''),  favorite_state_id),
    favorite_figure_id  = COALESCE(NULLIF(p_stats->>'favorite_figure_id',''), favorite_figure_id),
    last_active         = now()
  WHERE id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_my_public_stats(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sync_my_public_stats(jsonb) TO authenticated;

-- 3. Rewrite advance_referral_stage to use server-authoritative profile data
DROP FUNCTION IF EXISTS public.advance_referral_stage(int, int, int, int);

CREATE OR REPLACE FUNCTION public.advance_referral_stage(p_stage int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rr record;
  v_level int;
  v_campaigns int;
  v_streak int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO rr FROM public.referrals WHERE referred_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;
  IF p_stage <= rr.stage THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed'); END IF;

  SELECT level, campaigns_completed, streak
    INTO v_level, v_campaigns, v_streak
    FROM public.profiles WHERE id = uid;

  IF p_stage = 2 AND v_level >= 5 THEN
    UPDATE public.referrals SET stage = 2, stage2_at = now() WHERE id = rr.id;
  ELSIF p_stage = 3 AND v_campaigns >= 1 THEN
    UPDATE public.referrals SET stage = 3, stage3_at = now() WHERE id = rr.id;
  ELSIF p_stage = 4 AND v_streak >= 7 THEN
    UPDATE public.referrals SET stage = 4, stage4_at = now() WHERE id = rr.id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'requirements_unmet');
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_id', rr.referrer_id, 'stage', p_stage);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_referral_stage(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.advance_referral_stage(int) TO authenticated;
