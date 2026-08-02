DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.list_public_profiles(
  p_ids uuid[] DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_id text,
  level int,
  xp int,
  title text,
  bio text,
  favorite_state_id text,
  favorite_figure_id text,
  campaigns_completed int,
  artifacts_collected int,
  discovery_pct int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_id, p.level, p.xp,
         p.title, p.bio, p.favorite_state_id, p.favorite_figure_id,
         p.campaigns_completed, p.artifacts_collected, p.discovery_pct
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(p.account_status, 'active') = 'active'
    AND (p_ids IS NULL OR p.id = ANY (p_ids))
    AND (p_username IS NULL OR p.username ILIKE p_username)
    AND (p_search IS NULL OR p.username ILIKE p_search OR p.display_name ILIKE p_search)
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.list_public_profiles(uuid[], text, text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_profiles(uuid[], text, text, uuid, int) TO authenticated;