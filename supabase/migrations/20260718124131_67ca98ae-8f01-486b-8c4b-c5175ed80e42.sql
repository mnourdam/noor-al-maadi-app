
CREATE TABLE IF NOT EXISTS public.user_investigation_progress (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  investigation_id  UUID NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('unlocked','completed')),
  score             INTEGER NOT NULL DEFAULT 0,
  correct_count     INTEGER NOT NULL DEFAULT 0,
  xp_earned         INTEGER NOT NULL DEFAULT 0,
  dinars_earned     INTEGER NOT NULL DEFAULT 0,
  hearts_earned     INTEGER NOT NULL DEFAULT 0,
  badge_awarded     TEXT,
  artifact_awarded  TEXT,
  legacy_key        TEXT,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, investigation_id)
);

CREATE INDEX IF NOT EXISTS uip_user_idx
  ON public.user_investigation_progress (user_id);
CREATE INDEX IF NOT EXISTS uip_user_completed_idx
  ON public.user_investigation_progress (user_id, completed_at DESC)
  WHERE status = 'completed';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_investigation_progress TO authenticated;
GRANT ALL ON public.user_investigation_progress TO service_role;

ALTER TABLE public.user_investigation_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uip_select_own"
  ON public.user_investigation_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "uip_insert_own"
  ON public.user_investigation_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uip_update_own"
  ON public.user_investigation_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uip_delete_own"
  ON public.user_investigation_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.uip_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS uip_updated_at ON public.user_investigation_progress;
CREATE TRIGGER uip_updated_at
  BEFORE UPDATE ON public.user_investigation_progress
  FOR EACH ROW EXECUTE FUNCTION public.uip_touch_updated_at();

-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_investigation_v2(
  p_investigation_id UUID,
  p_delta_id UUID,
  p_score INTEGER DEFAULT 0,
  p_correct_count INTEGER DEFAULT 0
) RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.complete_investigation_v2(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_investigation_v2(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
CREATE OR REPLACE FUNCTION public.backfill_investigation_completion(
  p_legacy_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_investigation_id UUID;
  v_inserted BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_legacy_key IS NULL OR length(trim(p_legacy_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_key');
  END IF;

  BEGIN
    SELECT id INTO v_investigation_id
      FROM public.investigations WHERE id = p_legacy_key::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_investigation_id := NULL;
  END;

  IF v_investigation_id IS NULL THEN
    SELECT id INTO v_investigation_id
      FROM public.investigations WHERE slug = p_legacy_key;
  END IF;

  IF v_investigation_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'resolved', false, 'reason', 'not_found');
  END IF;

  INSERT INTO public.user_investigation_progress (
    user_id, investigation_id, status,
    xp_earned, dinars_earned, hearts_earned,
    legacy_key, completed_at
  ) VALUES (
    v_uid, v_investigation_id, 'completed',
    0, 0, 0, p_legacy_key, now()
  )
  ON CONFLICT (user_id, investigation_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'resolved', true,
    'inserted', v_inserted,
    'investigation_id', v_investigation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_investigation_completion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_investigation_completion(TEXT) TO authenticated;
