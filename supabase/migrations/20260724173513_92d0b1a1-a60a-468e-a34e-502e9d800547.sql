
-- Phase 2 — Referral system removal (safe compatibility layer).
-- REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE
-- These five RPCs preserve their original signatures for legacy APKs still
-- calling them, but are now inert: they never write, never grant rewards,
-- and always return a disabled response. Tables `public.referrals`,
-- `public.referral_rewards`, and columns `profiles.referral_code` /
-- `profiles.referred_by` are intentionally retained (inactive legacy data).

CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', false, 'disabled', true, 'reason', 'referrals_removed');
$$;

CREATE OR REPLACE FUNCTION public.my_referral_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', false,
    'disabled', true,
    'reason', 'referrals_removed',
    'code', NULL,
    'invited', 0,
    'joined', 0,
    'level5', 0,
    'conversion_pct', 0,
    'total_dinars', 0
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_signup_referral_rewards()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', false, 'disabled', true, 'reason', 'referrals_removed');
$$;

CREATE OR REPLACE FUNCTION public.advance_referral_stage(p_stage integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', false, 'disabled', true, 'reason', 'referrals_removed');
$$;

-- grant_level5_reward historically returned uuid. Preserve return type;
-- disabled stub always returns NULL (no reward, no side effects).
CREATE OR REPLACE FUNCTION public.grant_level5_reward(p_referred_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULL::uuid;
$$;

COMMENT ON FUNCTION public.redeem_referral_code(text) IS
  'DISABLED STUB — referrals removed in Phase 2. Delete after one APK release cycle. REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE';
COMMENT ON FUNCTION public.my_referral_stats() IS
  'DISABLED STUB — referrals removed in Phase 2. Delete after one APK release cycle. REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE';
COMMENT ON FUNCTION public.claim_signup_referral_rewards() IS
  'DISABLED STUB — referrals removed in Phase 2. Delete after one APK release cycle. REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE';
COMMENT ON FUNCTION public.advance_referral_stage(integer) IS
  'DISABLED STUB — referrals removed in Phase 2. Delete after one APK release cycle. REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE';
COMMENT ON FUNCTION public.grant_level5_reward(uuid) IS
  'DISABLED STUB — referrals removed in Phase 2. Delete after one APK release cycle. REFERRAL_FINAL_REMOVAL_AFTER_ONE_APK_RELEASE_CYCLE';
