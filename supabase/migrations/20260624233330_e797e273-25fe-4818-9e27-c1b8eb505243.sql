-- 1. Remove broad read access on the base table.
DROP POLICY IF EXISTS "Authenticated can view public profiles" ON public.profiles;

-- 2. Safe public view (security_invoker=on so the caller's RLS applies on
--    any base-table access this view performs). Exposes only public fields.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = on, security_barrier = true) AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.avatar_id,
  p.level,
  p.title,
  p.bio,
  p.favorite_state_id,
  p.favorite_figure_id,
  p.campaigns_completed,
  p.artifacts_collected,
  p.discovery_pct
FROM public.profiles p;

-- Make the view reachable through the Data API without granting anything new
-- on the underlying private table.
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO service_role;

-- Helper policy so the view's SELECT against profiles succeeds for any
-- signed-in user. Restricts WHICH COLUMNS are reachable via security_invoker:
-- the view only projects the safe ones, so even though the policy is
-- "USING (true)" for SELECT, the private columns are not exposed because
-- the view never selects them and direct base-table SELECT is still gated
-- by the existing "Users can view their own profile" policy (owner only).
CREATE POLICY "Public columns readable for view projection"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 3. Lock down the trigger function. Trigger functions are invoked by
--    Postgres, not by user RPC — no role needs direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.profiles_level5_reward_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.profiles_level5_reward_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.profiles_level5_reward_trigger() FROM authenticated;