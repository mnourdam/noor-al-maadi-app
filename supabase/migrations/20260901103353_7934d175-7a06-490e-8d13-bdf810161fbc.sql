CREATE TABLE IF NOT EXISTS public.admin_balance_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('xp','dinars')),
  delta integer NOT NULL,
  expected_value integer NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_balance_grants TO service_role;
GRANT SELECT ON public.admin_balance_grants TO authenticated;

ALTER TABLE public.admin_balance_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view balance grants"
  ON public.admin_balance_grants FOR SELECT TO authenticated
  USING (public.is_user_manager());

CREATE INDEX IF NOT EXISTS admin_balance_grants_pending_idx
  ON public.admin_balance_grants (user_id) WHERE consumed_at IS NULL;

CREATE TRIGGER update_admin_balance_grants_updated_at
  BEFORE UPDATE ON public.admin_balance_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Record every admin adjustment as a pending grant (additive change only).
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id uuid, p_field text, p_delta integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_value int;
  old_value int;
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;
  IF p_field NOT IN ('xp','dinars') THEN RAISE EXCEPTION 'unsupported_field'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'invalid_delta'; END IF;
  IF abs(p_delta) > 10000000 THEN RAISE EXCEPTION 'delta_out_of_range'; END IF;

  IF p_field = 'xp' THEN
    SELECT xp INTO old_value FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    new_value := GREATEST(0, LEAST(100000000, COALESCE(old_value,0) + p_delta));
    UPDATE public.profiles SET xp = new_value, updated_at = now() WHERE id = p_user_id;
  ELSE
    SELECT dinars INTO old_value FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    new_value := GREATEST(0, LEAST(100000000, COALESCE(old_value,0) + p_delta));
    UPDATE public.profiles SET dinars = new_value, updated_at = now() WHERE id = p_user_id;
  END IF;

  INSERT INTO public.admin_balance_grants(user_id, field, delta, expected_value)
  VALUES (p_user_id, p_field, p_delta, new_value);

  PERFORM public.log_admin_action(
    'balance.adjust', p_user_id,
    jsonb_build_object('field', p_field, 'delta', p_delta, 'old', old_value, 'new', new_value),
    p_reason
  );
  RETURN jsonb_build_object('ok', true, 'field', p_field, 'old', old_value, 'new', new_value);
END;
$function$;

-- Client stat push must not silently drop pending admin adjustments.
CREATE OR REPLACE FUNCTION public.sync_my_public_stats(p_stats jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_xp int;
  v_dinars int;
  g record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT LEAST(GREATEST(COALESCE((p_stats->>'xp')::int, xp), 0), 100000000),
         LEAST(GREATEST(COALESCE((p_stats->>'dinars')::int, dinars), 0), 100000000)
    INTO v_xp, v_dinars
    FROM public.profiles WHERE id = uid FOR UPDATE;

  -- Re-apply any admin adjustment the client has not observed yet. Each
  -- grant is consumed exactly once; if the pushed value already reflects
  -- it, the grant is consumed without changing the value.
  FOR g IN
    SELECT * FROM public.admin_balance_grants
     WHERE user_id = uid AND consumed_at IS NULL
     ORDER BY created_at
  LOOP
    IF g.field = 'xp' THEN
      IF v_xp < g.expected_value THEN
        v_xp := LEAST(100000000, GREATEST(0, v_xp + g.delta));
      END IF;
    ELSE
      IF v_dinars < g.expected_value THEN
        v_dinars := LEAST(100000000, GREATEST(0, v_dinars + g.delta));
      END IF;
    END IF;
    UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
  END LOOP;

  UPDATE public.profiles SET
    bio                 = COALESCE(LEFT(NULLIF(p_stats->>'bio',''), 500), bio),
    title               = COALESCE(LEFT(NULLIF(p_stats->>'title',''), 100), title),
    level               = LEAST(GREATEST(COALESCE((p_stats->>'level')::int, level), 0), 999),
    xp                  = v_xp,
    dinars              = v_dinars,
    hearts              = LEAST(GREATEST(COALESCE((p_stats->>'hearts')::int, hearts), 0), 5),
    streak              = LEAST(GREATEST(COALESCE((p_stats->>'streak')::int, streak), 0), 100000),
    campaigns_completed = LEAST(GREATEST(COALESCE((p_stats->>'campaigns_completed')::int, campaigns_completed), 0), 100000),
    artifacts_collected = LEAST(GREATEST(COALESCE((p_stats->>'artifacts_collected')::int, artifacts_collected), 0), 100000),
    discovery_pct       = LEAST(GREATEST(COALESCE((p_stats->>'discovery_pct')::int, discovery_pct), 0), 100),
    favorite_state_id   = COALESCE(NULLIF(p_stats->>'favorite_state_id',''),  favorite_state_id),
    favorite_figure_id  = COALESCE(NULLIF(p_stats->>'favorite_figure_id',''), favorite_figure_id),
    avatar_id           = COALESCE(NULLIF(LEFT(p_stats->>'avatar_id', 64),''), avatar_id),
    last_active         = now()
  WHERE id = uid;
END;
$function$;