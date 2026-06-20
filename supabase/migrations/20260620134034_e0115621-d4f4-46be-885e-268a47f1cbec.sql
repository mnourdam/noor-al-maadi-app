-- Add display_name column (separate from the unique username handle).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;

-- Update new-user trigger: read display_name from metadata with proper fallbacks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  desired_username text;
  final_username text;
  desired_display text;
  suffix int := 0;
  ref_code text;
  referrer_uuid uuid;
  new_code text;
BEGIN
  -- Username (unique handle).
  desired_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1),
    'player'
  );
  final_username := desired_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := desired_username || suffix::text;
  END LOOP;

  -- Display name (editable, no uniqueness).
  desired_display := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1),
    'مستخدم إرث'
  );

  new_code := public.gen_referral_code();

  ref_code := NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), '');
  IF ref_code IS NOT NULL THEN
    SELECT id INTO referrer_uuid FROM public.profiles WHERE referral_code = upper(ref_code);
    IF referrer_uuid = NEW.id THEN referrer_uuid := NULL; END IF;
  END IF;

  INSERT INTO public.profiles (id, username, display_name, email, referral_code, referred_by)
  VALUES (NEW.id, final_username, desired_display, NEW.email, new_code, referrer_uuid)
  ON CONFLICT (id) DO NOTHING;

  IF referrer_uuid IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code, stage, stage1_at)
    VALUES (referrer_uuid, NEW.id, upper(ref_code), 1, now())
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: existing profiles where display_name is null/empty/"ضيف".
UPDATE public.profiles p
SET display_name = COALESCE(
  NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
  NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(p.username, ''),
  split_part(u.email, '@', 1),
  'مستخدم إرث'
)
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR trim(p.display_name) = '' OR p.display_name = 'ضيف');

-- RPC: let a user update their own display_name only (avoids overwriting other columns).
CREATE OR REPLACE FUNCTION public.set_my_display_name(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  clean := NULLIF(trim(p_name), '');
  IF clean IS NULL THEN RAISE EXCEPTION 'empty_name'; END IF;
  IF length(clean) > 60 THEN clean := left(clean, 60); END IF;
  UPDATE public.profiles SET display_name = clean, updated_at = now() WHERE id = uid;
  RETURN clean;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_display_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_display_name(text) TO authenticated;