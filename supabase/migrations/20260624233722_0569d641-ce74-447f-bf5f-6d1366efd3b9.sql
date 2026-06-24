-- 1. View: standard security_invoker, exposes only safe columns. Caller's
--    column-level GRANTs on profiles enforce the column projection.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
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

REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO service_role;

-- 2. Row-level: allow signed-in users to see any row's safe columns.
--    Column-level grants (next block) are what actually restrict columns.
CREATE POLICY "Safe columns readable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 3. Column-level enforcement. Revoke broad table-level SELECT then
--    re-grant only the safe column set. Private/admin columns stay
--    inaccessible to ordinary signed-in users via the Data API.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, username, display_name, avatar_id, level, title, bio,
  favorite_state_id, favorite_figure_id,
  campaigns_completed, artifacts_collected, discovery_pct
) ON public.profiles TO authenticated;

-- INSERT / UPDATE / DELETE on the owner's row stay table-level (gated by
-- the existing owner-only policies; the column scope is set by what the
-- app writes, not by GRANTs we want to enumerate here).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 4. Owner-only full-row read via SECURITY DEFINER RPC. Replaces direct
--    SELECT * FROM profiles WHERE id = auth.uid() for the current user.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;