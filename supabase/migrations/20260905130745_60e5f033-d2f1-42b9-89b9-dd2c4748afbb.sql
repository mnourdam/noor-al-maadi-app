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

  -- An admin adjustment stays pending until the client demonstrably knows
  -- about it (pushed value has caught up to the expected value). Until then
  -- the stale client push is corrected up to the expected value instead of
  -- erasing the adjustment. Safety valve: grants older than 7 days expire.
  FOR g IN
    SELECT * FROM public.admin_balance_grants
     WHERE user_id = uid AND consumed_at IS NULL
     ORDER BY created_at
  LOOP
    IF g.field = 'xp' THEN
      IF v_xp < g.expected_value THEN
        v_xp := g.expected_value;
      ELSE
        UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
      END IF;
    ELSE
      IF v_dinars < g.expected_value THEN
        v_dinars := g.expected_value;
      ELSE
        UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
      END IF;
    END IF;
    IF g.created_at < now() - interval '7 days' THEN
      UPDATE public.admin_balance_grants SET consumed_at = now() WHERE id = g.id;
    END IF;
  END LOOP;

  UPDATE public.profiles SET
    bio                 = COALESCE(LEFT(NULLIF(p_stats->>'bio',''), 500), bio),
    title               = COALESCE(LEFT(NULLIF(p_stats->>'title',''), 100), title),
    level               = LEAST(GREATEST(COALESCE((p_stats->>'level')::int, level), 0), 999),
    xp                  = v_xp,
    dinars              = v_dinars,
    hearts              = LEAST(GREATEST(COALESCE((p_stats->>'hearts')::int, hearts), 0), 5),
    -- V17-04B: `streak` intentionally NOT assigned here. The ledger
    -- (public.user_streak_days) via record_streak_activity_v16 is the only
    -- writer of the streak mirror. A client-supplied p_stats->>'streak' is
    -- ignored.
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