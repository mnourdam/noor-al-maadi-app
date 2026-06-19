
REVOKE EXECUTE ON FUNCTION public.gen_referral_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_signup_referral_rewards() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_referral_stage(int,int,int,int) FROM PUBLIC, anon;
