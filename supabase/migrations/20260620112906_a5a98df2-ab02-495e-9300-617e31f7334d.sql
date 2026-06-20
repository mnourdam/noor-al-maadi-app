
-- 1) Protect email column: revoke column-level access from anon/authenticated
REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;
-- Owner can still read their own email via the existing SECURITY DEFINER function public.get_my_email()

-- 2) Lock down SECURITY DEFINER function executability
-- Trigger / internal helpers: revoke from API roles entirely
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_referral_code() FROM PUBLIC, anon, authenticated;

-- User-callable RPCs: restrict to authenticated only (no anon)
REVOKE ALL ON FUNCTION public.advance_referral_stage(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_referral_stage(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_signup_referral_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_signup_referral_rewards() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_my_public_stats(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_public_stats(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;
