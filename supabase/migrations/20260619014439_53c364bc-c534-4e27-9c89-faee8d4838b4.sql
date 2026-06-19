
-- =============================================
-- PART 1: PROFILES — hide email from other users via column-level grant
-- =============================================
-- Keep row-level visibility (authenticated can SEE rows), but remove column-level
-- access to `email` for everyone except the row owner (via service_role / direct auth).
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, username, bio, title, level, xp, dinars, streak,
  campaigns_completed, artifacts_collected, discovery_pct,
  favorite_state_id, favorite_figure_id, referral_code,
  referred_by, last_active, join_date, created_at, updated_at
) ON public.profiles TO authenticated;

-- Owner-only access to email via a security-definer RPC (returns own email or null).
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- =============================================
-- PART 2: FRIENDSHIPS — restrict status updates to the recipient
-- =============================================
DROP POLICY IF EXISTS "Either party can update" ON public.friendships;

-- Only the non-requester (recipient) of a pending row can update it.
CREATE POLICY "Recipient can accept pending"
  ON public.friendships
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (auth.uid() = user_a OR auth.uid() = user_b)
    AND auth.uid() <> requester
  )
  WITH CHECK (
    status = 'accepted'
    AND (auth.uid() = user_a OR auth.uid() = user_b)
    AND auth.uid() <> requester
  );

-- Delete policy stays as-is (either party can remove).

-- =============================================
-- PART 3: SECURITY DEFINER functions — least privilege
-- =============================================
-- gen_referral_code is internal helper, not for end users.
REVOKE EXECUTE ON FUNCTION public.gen_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gen_referral_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_referral_code() FROM anon;

-- handle_new_user is only invoked by trigger on auth.users (service role).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

-- touch_updated_at is trigger-only.
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon;

-- Keep referral RPCs callable by authenticated (they validate auth.uid()).
REVOKE EXECUTE ON FUNCTION public.claim_signup_referral_rewards() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_signup_referral_rewards() FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_signup_referral_rewards() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.advance_referral_stage(int,int,int,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_referral_stage(int,int,int,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.advance_referral_stage(int,int,int,int) TO authenticated;
