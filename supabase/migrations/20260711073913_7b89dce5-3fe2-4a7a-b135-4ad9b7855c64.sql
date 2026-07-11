-- Idempotent reward-delta ledger. Ensures XP/dinar/heart awards from the
-- offline outbox can be flushed repeatedly with zero double-award risk.
CREATE TABLE public.applied_profile_deltas (
  delta_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  dinars integer NOT NULL DEFAULT 0,
  hearts integer NOT NULL DEFAULT 0,
  source text,
  applied_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.applied_profile_deltas TO authenticated;
GRANT ALL ON public.applied_profile_deltas TO service_role;

ALTER TABLE public.applied_profile_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_deltas_select" ON public.applied_profile_deltas
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "own_deltas_insert" ON public.applied_profile_deltas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX applied_profile_deltas_user_applied_idx
  ON public.applied_profile_deltas(user_id, applied_at DESC);

-- Atomic apply: inserts the idempotency row AND updates profiles in a
-- single transaction. If delta_id already exists, returns {applied:false}
-- and mutates nothing. Safe to call any number of times from the outbox.
CREATE OR REPLACE FUNCTION public.apply_profile_delta(
  p_delta_id uuid,
  p_xp integer DEFAULT 0,
  p_dinars integer DEFAULT 0,
  p_hearts integer DEFAULT 0,
  p_source text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  INSERT INTO public.applied_profile_deltas(delta_id, user_id, xp, dinars, hearts, source)
  VALUES (p_delta_id, v_uid, COALESCE(p_xp,0), COALESCE(p_dinars,0), COALESCE(p_hearts,0), p_source)
  ON CONFLICT (delta_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'already_applied');
  END IF;

  UPDATE public.profiles
     SET xp = GREATEST(0, COALESCE(xp, 0) + COALESCE(p_xp, 0)),
         dinars = GREATEST(0, COALESCE(dinars, 0) + COALESCE(p_dinars, 0)),
         hearts = LEAST(5, GREATEST(0, COALESCE(hearts, 5) + COALESCE(p_hearts, 0))),
         last_active = now()
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'applied', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_profile_delta(uuid, integer, integer, integer, text) TO authenticated;