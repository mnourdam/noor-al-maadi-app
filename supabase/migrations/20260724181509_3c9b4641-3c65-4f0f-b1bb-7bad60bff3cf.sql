
ALTER FUNCTION public.record_streak_activity(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_streak_reward(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.my_claimed_streak_rewards() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.record_streak_activity(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_streak_reward(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_claimed_streak_rewards() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_streak_activity(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_streak_reward(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_claimed_streak_rewards() TO authenticated;
