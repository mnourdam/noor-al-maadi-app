
-- ============ PROFILES: public stats + referral fields ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text DEFAULT '',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS xp int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinars int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaigns_completed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS artifacts_collected int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_state_id text,
  ADD COLUMN IF NOT EXISTS favorite_figure_id text,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON public.profiles (referral_code);

-- Allow any authenticated user to read public-profile rows (client must avoid selecting `email`).
DROP POLICY IF EXISTS "Authenticated can view public profiles" ON public.profiles;
CREATE POLICY "Authenticated can view public profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ============ FRIENDSHIPS ============
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT friendships_ordered CHECK (user_a < user_b),
  CONSTRAINT friendships_requester_in_pair CHECK (requester = user_a OR requester = user_b)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Friends can view their pair" ON public.friendships
  FOR SELECT TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Requester creates friendship" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = requester
    AND (auth.uid() = user_a OR auth.uid() = user_b)
    AND user_a <> user_b
  );
CREATE POLICY "Either party can update" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Either party can delete" ON public.friendships
  FOR DELETE TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE TRIGGER friendships_touch_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ REFERRALS ============
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  stage int NOT NULL DEFAULT 0,
  stage1_at timestamptz,
  stage2_at timestamptz,
  stage3_at timestamptz,
  stage4_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_id)
);

GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrer or referred can view" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE TRIGGER referrals_touch_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Referral code generator ============
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := 'IRTH-';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- Backfill existing rows
UPDATE public.profiles SET referral_code = public.gen_referral_code() WHERE referral_code IS NULL;

-- ============ Replace handle_new_user to assign code + link referrer ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  desired text;
  final_username text;
  suffix int := 0;
  ref_code text;
  referrer_uuid uuid;
  new_code text;
BEGIN
  desired := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''), split_part(NEW.email, '@', 1), 'player');
  final_username := desired;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := desired || suffix::text;
  END LOOP;

  new_code := public.gen_referral_code();

  ref_code := NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), '');
  IF ref_code IS NOT NULL THEN
    SELECT id INTO referrer_uuid FROM public.profiles WHERE referral_code = upper(ref_code);
    IF referrer_uuid = NEW.id THEN referrer_uuid := NULL; END IF; -- block self
  END IF;

  INSERT INTO public.profiles (id, username, email, referral_code, referred_by)
  VALUES (NEW.id, final_username, NEW.email, new_code, referrer_uuid)
  ON CONFLICT (id) DO NOTHING;

  IF referrer_uuid IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code, stage, stage1_at)
    VALUES (referrer_uuid, NEW.id, upper(ref_code), 1, now())
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ Referral reward claim RPCs (idempotent) ============
-- Stage 1 rewards (sign-up): grant once. Returns JSON of what was granted.
CREATE OR REPLACE FUNCTION public.claim_signup_referral_rewards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rr record;
  granted jsonb := '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO rr FROM public.referrals WHERE referred_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;
  -- mark stage1 only if not already past it
  IF rr.stage < 1 THEN
    UPDATE public.referrals SET stage = 1, stage1_at = now() WHERE id = rr.id;
  END IF;
  granted := jsonb_build_object('ok', true, 'referrer_id', rr.referrer_id, 'stage', rr.stage);
  RETURN granted;
END;
$$;

-- Advance to a later stage with caller-provided friend metrics (referee calls).
-- Stage 2: level >= 5 → 100 dinars + artifact (client grants)
-- Stage 3: campaigns >= 1 → badge + title
-- Stage 4: streak >= 7 → title
CREATE OR REPLACE FUNCTION public.advance_referral_stage(
  p_stage int, p_level int, p_campaigns int, p_streak int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rr record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO rr FROM public.referrals WHERE referred_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;
  IF p_stage <= rr.stage THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed'); END IF;

  IF p_stage = 2 AND p_level >= 5 THEN
    UPDATE public.referrals SET stage = 2, stage2_at = now() WHERE id = rr.id;
  ELSIF p_stage = 3 AND p_campaigns >= 1 THEN
    UPDATE public.referrals SET stage = 3, stage3_at = now() WHERE id = rr.id;
  ELSIF p_stage = 4 AND p_streak >= 7 THEN
    UPDATE public.referrals SET stage = 4, stage4_at = now() WHERE id = rr.id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'requirements_unmet');
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_id', rr.referrer_id, 'stage', p_stage);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_signup_referral_rewards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_referral_stage(int,int,int,int) TO authenticated;
