-- ============================================================
-- Phase 2b — Starting dinars economy + atomic heart purchase
-- ============================================================

-- 1) Canonical starting balance for NEW authenticated accounts.
--    Existing profiles are NOT touched — the default only applies to
--    future INSERTs where dinars is not provided.
ALTER TABLE public.profiles ALTER COLUMN dinars SET DEFAULT 300;

-- 2) handle_new_user: explicitly insert dinars = 300 so new profiles
--    always start with the canonical grant, regardless of column default.
--    Referral bonus (grant_signup_reward) still applies additively.
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

  -- ON CONFLICT DO NOTHING guarantees this grant is one-time per user id;
  -- reinstalling the APK or re-signing in never re-inserts the profile row.
  INSERT INTO public.profiles (id, username, display_name, email, referral_code, referred_by, dinars)
  VALUES (NEW.id, final_username, desired_display, NEW.email, new_code, referrer_uuid, 300)
  ON CONFLICT (id) DO NOTHING;

  IF referrer_uuid IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code, stage, invited_at)
    VALUES (referrer_uuid, NEW.id, upper(ref_code), 0, now())
    ON CONFLICT (referred_id) DO NOTHING;
    PERFORM public.grant_signup_reward(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3) Atomic heart-purchase RPC.
--    Cost is enforced server-side (constant 20). Client cannot submit a
--    cheaper price. Runs under a row-level FOR UPDATE lock so two concurrent
--    calls cannot double-spend or exceed max hearts.
CREATE OR REPLACE FUNCTION public.purchase_heart()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dinars int;
  v_hearts int;
  v_cost constant int := 20;
  v_max constant int := 5;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  SELECT dinars, hearts INTO v_dinars, v_hearts
    FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'failed', 'reason', 'no_profile');
  END IF;

  IF v_hearts >= v_max THEN
    RETURN jsonb_build_object('status', 'hearts_full', 'hearts', v_hearts, 'dinars', v_dinars);
  END IF;

  IF v_dinars < v_cost THEN
    RETURN jsonb_build_object('status', 'insufficient_dinars', 'hearts', v_hearts, 'dinars', v_dinars);
  END IF;

  UPDATE public.profiles
    SET dinars = dinars - v_cost,
        hearts = LEAST(v_max, hearts + 1),
        updated_at = now()
    WHERE id = v_uid
    RETURNING dinars, hearts INTO v_dinars, v_hearts;

  RETURN jsonb_build_object(
    'status', 'purchased',
    'hearts', v_hearts,
    'dinars', v_dinars,
    'cost', v_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_heart() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_heart() TO authenticated;
