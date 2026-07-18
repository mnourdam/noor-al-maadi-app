-- Phase G2: Server-authoritative badges and museum unlocks for investigations.
-- Extends complete_investigation_v2 and backfill_investigation_completions to
-- atomically insert reward.badge / reward.artifact into public.user_collection
-- using ON CONFLICT (user_id, item_id) DO NOTHING so unlocks are idempotent
-- and never replay. Backfill grants unlocks but no XP / dinars / hearts.

-- Helper: unlock badge + artifact for a given investigation into user_collection.
CREATE OR REPLACE FUNCTION public._unlock_investigation_collectibles(
  p_user_id UUID,
  p_investigation_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward   JSONB;
  v_badge    TEXT;
  v_artifact TEXT;
BEGIN
  SELECT reward INTO v_reward
    FROM public.investigations
   WHERE id = p_investigation_id;

  IF v_reward IS NULL THEN RETURN; END IF;

  v_badge    := NULLIF(v_reward->>'badge', '');
  v_artifact := NULLIF(v_reward->>'artifact', '');

  IF v_badge IS NOT NULL THEN
    INSERT INTO public.user_collection (user_id, item_id, item_type)
    VALUES (p_user_id, v_badge, 'badge')
    ON CONFLICT (user_id, item_id) DO NOTHING;
  END IF;

  IF v_artifact IS NOT NULL THEN
    INSERT INTO public.user_collection (user_id, item_id, item_type)
    VALUES (p_user_id, v_artifact, 'artifact')
    ON CONFLICT (user_id, item_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._unlock_investigation_collectibles(UUID, UUID) FROM PUBLIC;

-- Rewrite complete_investigation_v2 with the collectible unlock inline.
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
  v_uid     UUID := auth.uid();
  v_reward  JSONB;
  v_xp      INTEGER;
  v_dinars  INTEGER;
  v_hearts  INTEGER;
  v_badge   TEXT;
  v_artifact TEXT;
  v_slug    TEXT;
  v_inserted BOOLEAN := false;
  v_delta_inserted BOOLEAN := false;
  v_existing public.user_investigation_progress%ROWTYPE;
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

  v_xp      := LEAST(150, GREATEST(0, COALESCE((v_reward->>'xp')::int, 0)));
  v_dinars  := LEAST(50,  GREATEST(0, COALESCE(
                   (v_reward->>'dinars')::int,
                   (v_reward->>'coins')::int, 0)));
  v_hearts  := GREATEST(0, LEAST(5, COALESCE((v_reward->>'hearts')::int, 0)));
  v_badge   := NULLIF(v_reward->>'badge', '');
  v_artifact:= NULLIF(v_reward->>'artifact', '');

  INSERT INTO public.user_investigation_progress (
    user_id, investigation_id, status,
    score, correct_count,
    xp_earned, dinars_earned, hearts_earned,
    badge_awarded, artifact_awarded,
    legacy_key, completed_at
  ) VALUES (
    v_uid, p_investigation_id, 'completed',
    GREATEST(0, COALESCE(p_score, 0)),
    GREATEST(0, COALESCE(p_correct_count, 0)),
    v_xp, v_dinars, v_hearts,
    v_badge, v_artifact,
    v_slug, now()
  )
  ON CONFLICT (user_id, investigation_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = false THEN
    -- Already completed: still ensure collectibles are unlocked
    -- (self-healing for accounts completed before this migration).
    PERFORM public._unlock_investigation_collectibles(v_uid, p_investigation_id);

    SELECT * INTO v_existing
      FROM public.user_investigation_progress
     WHERE user_id = v_uid AND investigation_id = p_investigation_id;

    RETURN jsonb_build_object(
      'ok', true,
      'applied', false,
      'already_completed', true,
      'xp_earned',      v_existing.xp_earned,
      'dinars_earned',  v_existing.dinars_earned,
      'hearts_earned',  v_existing.hearts_earned,
      'badge_awarded',  v_existing.badge_awarded,
      'artifact_awarded', v_existing.artifact_awarded
    );
  END IF;

  INSERT INTO public.applied_profile_deltas(delta_id, user_id, xp, dinars, hearts, source)
  VALUES (p_delta_id, v_uid, v_xp, v_dinars, v_hearts,
          'investigation_complete:' || p_investigation_id::text)
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

  -- Collectibles: idempotent unlock; always runs on first completion, so
  -- badges/artifacts land server-side even if the ledger delta was already
  -- applied via a different path.
  PERFORM public._unlock_investigation_collectibles(v_uid, p_investigation_id);

  RETURN jsonb_build_object(
    'ok', true,
    'applied', true,
    'already_completed', false,
    'xp_earned',      v_xp,
    'dinars_earned',  v_dinars,
    'hearts_earned',  v_hearts,
    'badge_awarded',  v_badge,
    'artifact_awarded', v_artifact,
    'reward_granted', v_delta_inserted
  );
END;
$$;

-- Extend batched backfill: unlock collectibles for every resolved
-- investigation, whether inserted now or already present. No XP/dinars.
CREATE OR REPLACE FUNCTION public.backfill_investigation_completions(p_legacy_keys text[])
RETURNS jsonb
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
      v_results := v_results || jsonb_build_object('key', v_key, 'resolved', false, 'reason', 'empty_key');
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
      v_results := v_results || jsonb_build_object('key', v_key, 'resolved', false, 'reason', 'not_found');
      CONTINUE;
    END IF;

    INSERT INTO public.user_investigation_progress (
      user_id, investigation_id, status,
      xp_earned, dinars_earned, hearts_earned,
      legacy_key, completed_at
    ) VALUES (
      v_uid, v_investigation_id, 'completed',
      0, 0, 0, v_key, now()
    )
    ON CONFLICT (user_id, investigation_id) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_row_count > 0;

    -- Always ensure collectibles are unlocked for resolved investigations.
    PERFORM public._unlock_investigation_collectibles(v_uid, v_investigation_id);

    IF v_inserted THEN
      v_inserted_count := v_inserted_count + 1;
    ELSE
      v_already_count := v_already_count + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'key', v_key, 'resolved', true,
      'investigation_id', v_investigation_id,
      'inserted', v_inserted
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