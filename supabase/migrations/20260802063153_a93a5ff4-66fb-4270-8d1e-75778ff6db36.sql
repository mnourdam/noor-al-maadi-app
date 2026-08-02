-- 1) Remove the permissive SELECT policy that let any signed-in user read
--    every row of the base profiles table (email, hearts, marketing_opt_in,
--    referral_code, etc.).
DROP POLICY IF EXISTS "Safe columns readable by authenticated" ON public.profiles;

-- Base table is now strictly owner-only for reads.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Make sure anon has no access to the base table at all.
REVOKE ALL ON public.profiles FROM anon;

-- 2) Public player data moves to an explicit, column-restricted surface.
--    security_invoker=off so it does not depend on base-table RLS, and it can
--    only ever expose the curated column list below.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = off, security_barrier = true) AS
SELECT
  id,
  username,
  display_name,
  avatar_id,
  level,
  xp,
  title,
  bio,
  favorite_state_id,
  favorite_figure_id,
  campaigns_completed,
  artifacts_collected,
  discovery_pct
FROM public.profiles
WHERE COALESCE(account_status, 'active') = 'active';

REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT ALL ON public.public_profiles TO service_role;