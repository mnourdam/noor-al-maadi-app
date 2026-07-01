
CREATE TABLE public.user_streak_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_days integer NOT NULL CHECK (milestone_days > 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_days)
);

GRANT SELECT ON public.user_streak_reward_claims TO authenticated;
GRANT ALL ON public.user_streak_reward_claims TO service_role;

ALTER TABLE public.user_streak_reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak reward claims"
  ON public.user_streak_reward_claims
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_streak_reward_claims_user ON public.user_streak_reward_claims(user_id);

CREATE OR REPLACE FUNCTION public.my_claimed_streak_rewards()
RETURNS integer[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(milestone_days ORDER BY milestone_days), ARRAY[]::integer[])
  FROM public.user_streak_reward_claims
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.claim_streak_reward(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur_streak integer;
  inserted_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_days IS NULL OR p_days <= 0 THEN RAISE EXCEPTION 'invalid_milestone'; END IF;

  SELECT COALESCE(streak, 0) INTO cur_streak FROM public.profiles WHERE id = uid;
  IF cur_streak IS NULL THEN cur_streak := 0; END IF;
  IF cur_streak < p_days THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'streak_too_low', 'streak', cur_streak);
  END IF;

  INSERT INTO public.user_streak_reward_claims (user_id, milestone_days)
  VALUES (uid, p_days)
  ON CONFLICT (user_id, milestone_days) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'milestone_days', p_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_claimed_streak_rewards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_streak_reward(integer) TO authenticated;
