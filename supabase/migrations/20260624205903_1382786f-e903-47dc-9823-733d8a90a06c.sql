
-- 1) Attach the missing trigger so new signups always create a profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill profiles for any existing auth.users that don't have one
DO $$
DECLARE
  u record;
  desired_username text;
  final_username text;
  desired_display text;
  suffix int;
  new_code text;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    desired_username := COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      split_part(u.email, '@', 1),
      'player'
    );
    final_username := desired_username;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
      suffix := suffix + 1;
      final_username := desired_username || suffix::text;
    END LOOP;

    desired_display := COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
      split_part(u.email, '@', 1),
      'مستخدم إرث'
    );

    new_code := public.gen_referral_code();

    INSERT INTO public.profiles (id, username, display_name, email, referral_code)
    VALUES (u.id, final_username, desired_display, u.email, new_code)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
