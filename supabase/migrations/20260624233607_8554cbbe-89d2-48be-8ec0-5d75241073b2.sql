-- Remove the loophole policy: it let authenticated users read every column
-- of profiles directly through the Data API.
DROP POLICY IF EXISTS "Public columns readable for view projection" ON public.profiles;

-- Recreate the public projection as SECURITY DEFINER (default) so the view
-- itself can read the safe columns regardless of caller RLS. The view's
-- WHERE clause is unrestricted because every projected column is already
-- intentionally public.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = off, security_barrier = true) AS
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

-- View ownership stays with postgres so security_invoker=off uses the
-- postgres role to read profiles (bypasses RLS only for the safe columns
-- projected above).
ALTER VIEW public.public_profiles OWNER TO postgres;

-- Reachable via Data API for signed-in users only; never anon.
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO service_role;