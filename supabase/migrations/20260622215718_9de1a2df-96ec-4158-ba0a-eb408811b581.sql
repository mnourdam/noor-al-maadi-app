
-- Make admin check robust: use auth.users.email directly (security definer) so it works
-- even when profiles row hasn't been backfilled.
CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(coalesce(
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    ''
  )) = 'mnourdam@gmail.com';
$$;

-- Backfill missing profile rows for existing auth users (idempotent).
INSERT INTO public.profiles (id, username, display_name, email, referral_code)
SELECT
  u.id,
  COALESCE(split_part(u.email, '@', 1), 'user_' || substr(u.id::text, 1, 8)),
  COALESCE(split_part(u.email, '@', 1), 'مستخدم'),
  u.email,
  public.gen_referral_code()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
