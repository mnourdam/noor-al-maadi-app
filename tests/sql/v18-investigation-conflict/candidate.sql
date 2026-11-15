-- LOCAL REVIEW CANDIDATE ONLY. NOT A DEPLOYMENT MIGRATION.
-- Narrow fresh-completion hardening; does not authenticate or repair historical evidence.
CREATE OR REPLACE FUNCTION public.complete_investigation_v2(
  p_investigation_id UUID,
  p_delta_id UUID,
  p_score INTEGER DEFAULT 0,
  p_correct_count INTEGER DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_reward   JSONB;
  v_xp       INTEGER;
  v_dinars   INTEGER;
  v_hearts   INTEGER;
  v_badge    TEXT;
  v_artifact TEXT;
  v_slug     TEXT;
  v_snapshot JSONB;
  v_existing public.user_investigation_progress%ROWTYPE;
  v_inserted BOOLEAN := false;
  v_delta_inserted BOOLEAN := false;
  v_artifact_conflict TEXT;
  v_self_heal_artifact TEXT;
  v_self_heal_applied BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT reward, slug INTO v_reward, v_slug
    FROM public.investigations
   WHERE id = p_investigation_id AND enabled = true;

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'investigation_not_found');
  END IF;

  v_xp       := LEAST(150, GREATEST(0, COALESCE((v_reward->>'xp')::int, 0)));
  v_dinars   := LEAST(50,  GREATEST(0, COALESCE(
                    (v_reward->>'dinars')::int,
                    (v_reward->>'coins')::int, 0)));
  v_hearts   := GREATEST(0, LEAST(5, COALESCE((v_reward->>'hearts')::int, 0)));
  v_badge    := NULLIF(v_reward->>'badge', '');
  v_artifact := NULLIF(v_reward->>'artifact', '');

  -- Reward-reference sanity: reject malformed values before any writes.
  IF v_badge    IS NOT NULL AND length(v_badge)    > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_badge_ref');
  END IF;
  IF v_artifact IS NOT NULL AND length(v_artifact) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_artifact_ref');
  END IF;

  -- Attempt the fresh-completion insert first (atomic guard).
  v_snapshot := jsonb_build_object(
    'v', 1,
    'badge', v_badge,
    'artifact', v_artifact,
    'xp', v_xp,
    'dinars', v_dinars,
    'hearts', v_hearts,
    'granted_at', now()
  );

  INSERT INTO public.user_investigation_progress (
    user_id, investigation_id, status,
    score, correct_count,
    xp_earned, dinars_earned, hearts_earned,
    badge_awarded, artifact_awarded,
    reward_snapshot,
    legacy_key, completed_at
  ) VALUES (
    v_uid, p_investigation_id, 'completed',
    GREATEST(0, COALESCE(p_score, 0)),
    GREATEST(0, COALESCE(p_correct_count, 0)),
    v_xp, v_dinars, v_hearts,
    v_badge, v_artifact,
    v_snapshot,
    v_slug, now()
  )
  ON CONFLICT (user_id, investigation_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- =============================================================
  -- Fresh completion path — grant atomically.
  -- Everything below runs in the same transaction as the insert; any
  -- exception rolls back the completion row AND its rewards together.
  -- =============================================================
  IF v_inserted THEN
    -- Applied-delta ledger. Prevents replay via a different code path.
    INSERT INTO public.applied_profile_deltas(
      delta_id, user_id, xp, dinars, hearts, source
    ) VALUES (
      p_delta_id, v_uid, v_xp, v_dinars, v_hearts,
      'investigation_complete:' || p_investigation_id::text
    )
    ON CONFLICT (delta_id) DO NOTHING;

    GET DIAGNOSTICS v_delta_inserted = ROW_COUNT;

    -- Never adopt a pre-existing delta as proof of wallet inclusion. The
    -- exception handler rolls back the tentative completion/snapshot as well.
    IF NOT v_delta_inserted THEN
      RAISE EXCEPTION USING ERRCODE = 'PIV01', MESSAGE = 'investigation_delta_conflict';
    END IF;

    IF v_delta_inserted THEN
      UPDATE public.profiles
         SET xp     = GREATEST(0, COALESCE(xp, 0) + v_xp),
             dinars = GREATEST(0, COALESCE(dinars, 0) + v_dinars),
             hearts = LEAST(5, GREATEST(0, COALESCE(hearts, 5) + v_hearts)),
             last_active = now()
       WHERE id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PIV02', MESSAGE = 'investigation_profile_missing';
      END IF;
    END IF;

    -- Artifact ownership. Atomic with the completion row.
    -- Idempotent: `(user_id, item_id)` unique — repeat is a no-op.
    -- Note: we deliberately do NOT grant badges server-side because
    -- there is no canonical server badge store yet (see file header).
    IF v_artifact IS NOT NULL THEN
      BEGIN
        INSERT INTO public.user_collection (user_id, item_id, item_type)
        VALUES (v_uid, v_artifact, 'artifact')
        ON CONFLICT (user_id, item_id) DO NOTHING;
      EXCEPTION WHEN others THEN
        v_artifact_conflict := SQLERRM;
        RAISE EXCEPTION
          'investigation_reward_artifact_failed: %', v_artifact_conflict
          USING ERRCODE = 'raise_exception';
      END;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'applied', true,
      'already_completed', false,
      'xp_earned', v_xp,
      'dinars_earned', v_dinars,
      'hearts_earned', v_hearts,
      'badge_awarded', v_badge,
      'artifact_awarded', v_artifact,
      'reward_granted', v_delta_inserted,
      'reward_snapshot', v_snapshot
    );
  END IF;

  -- =============================================================
  -- Replay path — completion row already exists.
  -- =============================================================
  SELECT * INTO v_existing
    FROM public.user_investigation_progress
   WHERE user_id = v_uid AND investigation_id = p_investigation_id;

  -- Evidence-based self-heal: ONLY if the stored snapshot contains a
  -- specific artifact and that exact artifact is missing from
  -- user_collection. Never use the current investigation reward here.
  IF v_existing.reward_snapshot IS NOT NULL THEN
    v_self_heal_artifact := NULLIF(v_existing.reward_snapshot->>'artifact', '');
    IF v_self_heal_artifact IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.user_collection
          WHERE user_id = v_uid AND item_id = v_self_heal_artifact
       )
    THEN
      INSERT INTO public.user_collection (user_id, item_id, item_type)
      VALUES (v_uid, v_self_heal_artifact, 'artifact')
      ON CONFLICT (user_id, item_id) DO NOTHING;
      v_self_heal_applied := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'applied', false,
    'already_completed', true,
    'xp_earned', v_existing.xp_earned,
    'dinars_earned', v_existing.dinars_earned,
    'hearts_earned', v_existing.hearts_earned,
    'badge_awarded', v_existing.badge_awarded,
    'artifact_awarded', v_existing.artifact_awarded,
    'reward_snapshot', v_existing.reward_snapshot,
    'collectible_reconciliation', CASE
      WHEN v_existing.reward_snapshot IS NULL THEN 'insufficient_evidence'
      WHEN v_self_heal_applied THEN 'artifact_restored_from_snapshot'
      ELSE 'ok'
    END
  );
EXCEPTION
  -- PL/pgSQL exception block rolls back ALL writes in this invocation before
  -- returning failure. Do not replace this with a normal early RETURN.
  WHEN SQLSTATE 'PIV01' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false,
      'reward_granted', false, 'reason', 'investigation_delta_conflict');
  WHEN SQLSTATE 'PIV02' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false,
      'reward_granted', false, 'reason', 'investigation_profile_missing');
END;
$$;
