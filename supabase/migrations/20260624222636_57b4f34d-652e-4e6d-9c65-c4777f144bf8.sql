
-- ============ referrals analytics columns ============
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS invited_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS signup_reward_at  timestamptz,
  ADD COLUMN IF NOT EXISTS level5_reward_at  timestamptz;

-- ============ referral_rewards ledger ============
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  reward_source   text NOT NULL,
  dinars_amount   integer NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.referral_rewards
    ADD CONSTRAINT referral_rewards_kind_check
    CHECK (kind IN ('signup','level5','campaign','event','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_unique_per_referred
  ON public.referral_rewards (referred_id, kind);

CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx
  ON public.referral_rewards (referrer_id, created_at DESC);

GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL    ON public.referral_rewards TO service_role;

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Referrer can read own rewards" ON public.referral_rewards;
CREATE POLICY "Referrer can read own rewards"
  ON public.referral_rewards FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.is_content_admin());

-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER RPCs may write.

-- ============ internal: grant_signup_reward ============
CREATE OR REPLACE FUNCTION public.grant_signup_reward(p_referred_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rr record;
  notif_id uuid;
  reward_amount int := 50;
BEGIN
  SELECT * INTO rr FROM public.referrals WHERE referred_id = p_referred_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF rr.signup_reward_at IS NOT NULL THEN RETURN NULL; END IF;  -- idempotent

  INSERT INTO public.notifications (title, body, type, target_type, target_user_id, deep_link, status, sent_at)
  VALUES (
    'إحالة جديدة',
    'انضم لاعب جديد عبر رمز الإحالة الخاص بك. تمت إضافة 50 دينار.',
    'referral',
    'user',
    rr.referrer_id,
    '/referrals',
    'sent',
    now()
  ) RETURNING id INTO notif_id;

  BEGIN
    INSERT INTO public.referral_rewards (referrer_id, referred_id, kind, reward_source, dinars_amount, notification_id)
    VALUES (rr.referrer_id, p_referred_id, 'signup', 'signup_reward', reward_amount, notif_id);
  EXCEPTION WHEN unique_violation THEN
    -- Already paid — undo the notification we just queued.
    DELETE FROM public.notifications WHERE id = notif_id;
    RETURN NULL;
  END;

  UPDATE public.profiles
     SET dinars = LEAST(100000000, dinars + reward_amount), updated_at = now()
   WHERE id = rr.referrer_id;

  UPDATE public.referrals
     SET stage = GREATEST(stage, 1),
         stage1_at = COALESCE(stage1_at, now()),
         signup_reward_at = now()
   WHERE id = rr.id;

  PERFORM public.log_admin_action(
    'referral.reward', rr.referrer_id,
    jsonb_build_object('kind','signup','referred_id',p_referred_id,'dinars',reward_amount),
    NULL
  );
  RETURN notif_id;
EXCEPTION WHEN insufficient_privilege THEN
  -- log_admin_action requires admin; ignore failures from non-admin contexts.
  RETURN notif_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_signup_reward(uuid) FROM PUBLIC, anon, authenticated;
-- Internal only — callable by trigger / definer functions / service_role.

-- ============ internal: grant_level5_reward ============
CREATE OR REPLACE FUNCTION public.grant_level5_reward(p_referred_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rr record;
  notif_id uuid;
  reward_amount int := 100;
  v_level int;
BEGIN
  SELECT level INTO v_level FROM public.profiles WHERE id = p_referred_id;
  IF v_level IS NULL OR v_level < 5 THEN RETURN NULL; END IF;

  SELECT * INTO rr FROM public.referrals WHERE referred_id = p_referred_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF rr.level5_reward_at IS NOT NULL THEN RETURN NULL; END IF;

  INSERT INTO public.notifications (title, body, type, target_type, target_user_id, deep_link, status, sent_at)
  VALUES (
    'مكافأة المستوى الخامس',
    'وصل اللاعب المدعو إلى المستوى الخامس. تمت إضافة 100 دينار.',
    'referral',
    'user',
    rr.referrer_id,
    '/referrals',
    'sent',
    now()
  ) RETURNING id INTO notif_id;

  BEGIN
    INSERT INTO public.referral_rewards (referrer_id, referred_id, kind, reward_source, dinars_amount, notification_id)
    VALUES (rr.referrer_id, p_referred_id, 'level5', 'level5_reward', reward_amount, notif_id);
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.notifications WHERE id = notif_id;
    RETURN NULL;
  END;

  UPDATE public.profiles
     SET dinars = LEAST(100000000, dinars + reward_amount), updated_at = now()
   WHERE id = rr.referrer_id;

  UPDATE public.referrals
     SET stage = GREATEST(stage, 2),
         stage2_at = COALESCE(stage2_at, now()),
         level5_reward_at = now()
   WHERE id = rr.id;
  RETURN notif_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_level5_reward(uuid) FROM PUBLIC, anon, authenticated;

-- ============ trigger: profiles level → level5 reward ============
CREATE OR REPLACE FUNCTION public.profiles_level5_reward_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.level >= 5 AND COALESCE(OLD.level, 0) < 5 THEN
    PERFORM public.grant_level5_reward(NEW.id);
  END IF;
  -- Track longest_streak
  IF NEW.streak > COALESCE(OLD.longest_streak, 0) THEN
    NEW.longest_streak := NEW.streak;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_level5_reward_trg ON public.profiles;
CREATE TRIGGER profiles_level5_reward_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_level5_reward_trigger();

-- ============ redeem_referral_code (client-facing) ============
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ref_id uuid;
  cleaned text;
  existing record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  cleaned := upper(NULLIF(trim(p_code), ''));
  IF cleaned IS NULL THEN RAISE EXCEPTION 'empty_code'; END IF;

  SELECT id INTO ref_id FROM public.profiles WHERE referral_code = cleaned;
  IF ref_id IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF ref_id = uid THEN RAISE EXCEPTION 'self_referral'; END IF;

  -- Prevent simple loops: referrer cannot be someone we've already invited.
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referrer_id = uid AND referred_id = ref_id) THEN
    RAISE EXCEPTION 'referral_loop';
  END IF;

  SELECT * INTO existing FROM public.referrals WHERE referred_id = uid;
  IF FOUND THEN RAISE EXCEPTION 'already_referred'; END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, code, stage, invited_at)
  VALUES (ref_id, uid, cleaned, 0, now());

  UPDATE public.profiles SET referred_by = ref_id WHERE id = uid AND referred_by IS NULL;

  PERFORM public.grant_signup_reward(uid);
  RETURN jsonb_build_object('ok', true, 'referrer_id', ref_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.redeem_referral_code(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated;

-- ============ my_referral_stats ============
CREATE OR REPLACE FUNCTION public.my_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  my_code text;
  invited int;
  joined int;
  level5 int;
  total_dinars int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT referral_code INTO my_code FROM public.profiles WHERE id = uid;

  SELECT count(*) INTO invited FROM public.referrals WHERE referrer_id = uid;
  SELECT count(*) INTO joined  FROM public.referrals WHERE referrer_id = uid AND signup_reward_at IS NOT NULL;
  SELECT count(*) INTO level5  FROM public.referrals WHERE referrer_id = uid AND level5_reward_at IS NOT NULL;
  SELECT COALESCE(sum(dinars_amount),0) INTO total_dinars
    FROM public.referral_rewards WHERE referrer_id = uid;

  RETURN jsonb_build_object(
    'code', my_code,
    'invited', invited,
    'joined', joined,
    'level5', level5,
    'conversion_pct', CASE WHEN invited > 0 THEN round((joined::numeric / invited) * 100, 1) ELSE 0 END,
    'total_dinars', total_dinars
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_referral_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_referral_stats() TO authenticated;

-- ============ handle_new_user — also grant signup reward ============
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

  INSERT INTO public.profiles (id, username, display_name, email, referral_code, referred_by)
  VALUES (NEW.id, final_username, desired_display, NEW.email, new_code, referrer_uuid)
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

-- ============ advance_referral_stage — call level5 grant ============
CREATE OR REPLACE FUNCTION public.advance_referral_stage(p_stage integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  rr record;
  v_level int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO rr FROM public.referrals WHERE referred_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;

  SELECT level INTO v_level FROM public.profiles WHERE id = uid;

  IF p_stage = 1 THEN
    PERFORM public.grant_signup_reward(uid);
    RETURN jsonb_build_object('ok', true, 'stage', 1);
  ELSIF p_stage = 2 AND v_level >= 5 THEN
    PERFORM public.grant_level5_reward(uid);
    RETURN jsonb_build_object('ok', true, 'stage', 2);
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'requirements_unmet');
END;
$function$;
