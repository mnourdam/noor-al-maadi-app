-- ============================================================
-- Phase G2 corrective pass
-- ------------------------------------------------------------
-- Removes the unsafe "grant current rewards on legacy history" behavior
-- introduced by the previous G2 draft. New model:
--
--   * Fresh first completion  → grant everything atomically AND stamp
--                               an immutable `reward_snapshot` onto
--                               the completion row.
--   * Replay (already_completed) → NEVER read the current investigation
--                               reward. Only the stored snapshot may
--                               drive a targeted collectible restore.
--   * Legacy backfill        → completion row only. Zero economy. No
--                               user_collection insert. Ever.
--
-- Badge store audit (short):
--   There is no server-side badge store today. `user_collection` holds
--   museum artifacts / entity types (artifact, battle, city, event,
--   figure, landmark). `profile.badges` is a CLIENT-LOCAL array in the
--   local profile, not a Postgres column. Therefore this migration
--   does not persist badges server-side. The completion snapshot
--   records the badge id historically granted; a follow-up phase can
--   add a real `public.user_badges` table and self-heal from the
--   snapshot without any content-drift risk.
-- ============================================================

-- 1. Immutable snapshot column ---------------------------------
ALTER TABLE public.user_investigation_progress
  ADD COLUMN IF NOT EXISTS reward_snapshot JSONB;

COMMENT ON COLUMN public.user_investigation_progress.reward_snapshot IS
  'Immutable reward evidence captured at the moment of first completion. '
  'Shape: {"v":1,"badge":?,"artifact":?,"xp":n,"dinars":n,"hearts":n,'
  '"granted_at":ts}. NULL means "no historical evidence" — used for '
  'legacy-backfilled rows. Never overwritten. Never derived from the '
  'current investigation reward.';

-- 2. Drop the unsafe helper introduced by the previous G2 draft.
DROP FUNCTION IF EXISTS public._unlock_investigation_collectibles(UUID, UUID);

-- 3. Rewrite complete_investigation_v2 -------------------------
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

    IF v_delta_inserted THEN
      UPDATE public.profiles
         SET xp     = GREATEST(0, COALESCE(xp, 0) + v_xp),
             dinars = GREATEST(0, COALESCE(dinars, 0) + v_dinars),
             hearts = LEAST(5, GREATEST(0, COALESCE(hearts, 5) + v_hearts)),
             last_active = now()
       WHERE id = v_uid;
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
END;
$$;

-- 4. Legacy backfill: progress only, zero economy, no collection writes.
CREATE OR REPLACE FUNCTION public.backfill_investigation_completions(
  p_legacy_keys text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_investigation_id UUID;
  v_inserted BOOLEAN;
  v_row_count INTEGER;
  v_results JSONB := '[]'::jsonb;
  v_inserted_count INTEGER := 0;
  v_already_count  INTEGER := 0;
  v_notfound_count INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_legacy_keys IS NULL OR array_length(p_legacy_keys, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'inserted', 0, 'already_present', 0, 'not_found', 0,
      'total', 0, 'results', '[]'::jsonb
    );
  END IF;

  FOREACH v_key IN ARRAY p_legacy_keys LOOP
    v_total := v_total + 1;
    v_investigation_id := NULL;
    v_inserted := false;

    IF v_key IS NULL OR length(trim(v_key)) = 0 THEN
      v_notfound_count := v_notfound_count + 1;
      v_results := v_results || jsonb_build_object(
        'key', v_key, 'resolved', false, 'reason', 'empty_key'
      );
      CONTINUE;
    END IF;

    BEGIN
      SELECT id INTO v_investigation_id
        FROM public.investigations WHERE id = v_key::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_investigation_id := NULL;
    END;

    IF v_investigation_id IS NULL THEN
      SELECT id INTO v_investigation_id
        FROM public.investigations WHERE slug = v_key;
    END IF;

    IF v_investigation_id IS NULL THEN
      v_notfound_count := v_notfound_count + 1;
      v_results := v_results || jsonb_build_object(
        'key', v_key, 'resolved', false, 'reason', 'not_found'
      );
      CONTINUE;
    END IF;

    -- Progress row only. NO snapshot. NO collectible unlock. NO economy.
    INSERT INTO public.user_investigation_progress (
      user_id, investigation_id, status,
      xp_earned, dinars_earned, hearts_earned,
      reward_snapshot,
      legacy_key, completed_at
    ) VALUES (
      v_uid, v_investigation_id, 'completed',
      0, 0, 0,
      NULL,                     -- legacy → no historical evidence
      v_key, now()
    )
    ON CONFLICT (user_id, investigation_id) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_row_count > 0;

    IF v_inserted THEN
      v_inserted_count := v_inserted_count + 1;
    ELSE
      v_already_count := v_already_count + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'key', v_key, 'resolved', true,
      'investigation_id', v_investigation_id,
      'inserted', v_inserted,
      'rewards_granted', false
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted_count,
    'already_present', v_already_count,
    'not_found', v_notfound_count,
    'total', v_total,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_investigation_v2(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_investigation_completions(text[]) TO authenticated;